import { db } from '../db';
import { messagesTable, aiContextTable, chatsTable, usersTable } from '../db/schema';
import { type AIChatCompletionInput } from '../schema';
import { eq, desc, and, gte, SQL, isNull, or, sql } from 'drizzle-orm';

export interface AIChatCompletionResponse {
    response: string;
    suggestions?: string[];
    context_used: boolean;
    tone_detected?: string;
    confidence: number;
}

export const aiChatCompletion = async (input: AIChatCompletionInput): Promise<AIChatCompletionResponse> => {
    try {
        // Validate that chat and user exist
        const [chat, user] = await Promise.all([
            db.select().from(chatsTable).where(eq(chatsTable.id, input.chat_id)).limit(1),
            db.select().from(usersTable).where(eq(usersTable.id, input.user_id)).limit(1)
        ]);

        if (chat.length === 0) {
            throw new Error('Chat not found');
        }
        if (user.length === 0) {
            throw new Error('User not found');
        }

        // Get recent messages for context
        const recentMessages = await db.select()
            .from(messagesTable)
            .where(eq(messagesTable.chat_id, input.chat_id))
            .orderBy(desc(messagesTable.created_at))
            .limit(input.context_window)
            .execute();

        // Get relevant AI context
        let query = db.select().from(aiContextTable);
        
        const conditions: SQL<unknown>[] = [
            eq(aiContextTable.user_id, input.user_id)
        ];

        // Add chat-specific context if available
        conditions.push(eq(aiContextTable.chat_id, input.chat_id));

        // Filter out expired context - use raw SQL for this complex condition
        const now = new Date();
        conditions.push(
            sql`${aiContextTable.expires_at} IS NULL OR ${aiContextTable.expires_at} >= ${now}`
        );

        const contextQuery = query.where(and(...conditions))
            .orderBy(desc(aiContextTable.relevance_score), desc(aiContextTable.created_at))
            .limit(5);

        const contextRecords = await contextQuery.execute();

        // Detect tone from the input message
        const toneDetected = detectTone(input.message);
        
        // Generate response based on input and context
        const response = generateAIResponse(
            input.message,
            recentMessages,
            contextRecords,
            user[0],
            input.tone
        );

        // Generate suggestions based on message content and context
        const suggestions = generateSuggestions(
            input.message,
            toneDetected,
            chat[0].type,
            input.include_suggestions
        );

        // Calculate confidence based on available context and message clarity
        const confidence = calculateConfidence(
            input.message,
            recentMessages.length,
            contextRecords.length
        );

        return {
            response,
            suggestions: input.include_suggestions ? suggestions : undefined,
            context_used: contextRecords.length > 0 || recentMessages.length > 0,
            tone_detected: toneDetected,
            confidence
        };

    } catch (error) {
        console.error('AI chat completion failed:', error);
        throw error;
    }
};

// Helper function to detect tone from message content
function detectTone(message: string): string {
    const lowerMessage = message.toLowerCase();
    
    // Professional indicators
    if (/\b(meeting|schedule|deadline|project|report|proposal|budget)\b/.test(lowerMessage)) {
        return 'professional';
    }
    
    // Casual indicators
    if (/\b(hey|hi|lol|btw|awesome|cool|thanks|thx)\b/.test(lowerMessage) || message.includes('!')) {
        return 'casual';
    }
    
    // Empathetic indicators (questions, concerns, help requests)
    if (/\b(help|support|worried|concern|issue|problem|sorry)\b/.test(lowerMessage) || message.includes('?')) {
        return 'empathetic';
    }
    
    // Urgent/concise indicators
    if (/\b(urgent|asap|quickly|now|immediately|short)\b/.test(lowerMessage) || message.length < 20) {
        return 'concise';
    }
    
    // Default to professional for longer, structured messages
    return message.length > 100 ? 'detailed' : 'professional';
}

// Helper function to generate AI response
function generateAIResponse(
    message: string,
    recentMessages: any[],
    contextRecords: any[],
    user: any,
    requestedTone?: string
): string {
    const tone = requestedTone || detectTone(message);
    const userPreferences = user.preferences || {};
    
    // Analyze message intent
    const lowerMessage = message.toLowerCase();
    
    // Meeting-related responses
    if (/\b(meeting|schedule|calendar|appointment)\b/.test(lowerMessage)) {
        if (tone === 'casual') {
            return "Sure! I can help you set up a meeting. When works best for you?";
        }
        return "I'd be happy to assist with scheduling a meeting. Please let me know your preferred time and attendees.";
    }
    
    // Help/support requests
    if (/\b(help|support|how|what|why)\b/.test(lowerMessage)) {
        if (tone === 'empathetic') {
            return "I understand you need assistance. Let me help you with that. What specific area would you like support with?";
        }
        return "I'm here to help! Could you provide more details about what you need assistance with?";
    }
    
    // Translation requests
    if (/\b(translate|translation|language)\b/.test(lowerMessage)) {
        return "I can help with translation. What would you like me to translate and to which language?";
    }
    
    // Summarization requests
    if (/\b(summarize|summary|recap|overview)\b/.test(lowerMessage)) {
        const contextInfo = recentMessages.length > 0 ? 
            `Based on the recent ${recentMessages.length} messages in this conversation, ` : '';
        return `${contextInfo}I can provide a summary. What specific topic or time period would you like me to focus on?`;
    }
    
    // Default contextual response
    const contextInfo = contextRecords.length > 0 ? 
        'Based on our previous conversations and your preferences, ' : '';
    
    if (tone === 'concise') {
        return `${contextInfo}Got it. How can I help?`;
    }
    
    return `${contextInfo}I understand. Could you provide more specific details so I can give you the most helpful response?`;
}

// Helper function to generate suggestions
function generateSuggestions(
    message: string,
    tone: string,
    chatType: string,
    includeSuggestions: boolean
): string[] | undefined {
    if (!includeSuggestions) return undefined;
    
    const suggestions: string[] = [];
    const lowerMessage = message.toLowerCase();
    
    // Meeting-related suggestions
    if (/\b(meeting|schedule|calendar|appointment|time)\b/.test(lowerMessage)) {
        suggestions.push('Schedule a meeting');
        suggestions.push('Check availability');
        suggestions.push('Send calendar invite');
    }
    
    // Communication suggestions
    if (/\b(translate|language|international)\b/.test(lowerMessage)) {
        suggestions.push('Translate message');
        suggestions.push('Detect language');
    }
    
    // Productivity suggestions
    if (/\b(summarize|summary|recap|notes)\b/.test(lowerMessage)) {
        suggestions.push('Summarize conversation');
        suggestions.push('Generate meeting notes');
    }
    
    // Default suggestions based on chat type
    if (suggestions.length === 0) {
        if (chatType === 'group') {
            suggestions.push('Summarize conversation');
            suggestions.push('Schedule group meeting');
            suggestions.push('Create action items');
        } else if (chatType === 'direct') {
            suggestions.push('Schedule a call');
            suggestions.push('Share calendar');
            suggestions.push('Translate message');
        } else if (chatType === 'ai_assistant') {
            suggestions.push('Get recommendations');
            suggestions.push('Analyze sentiment');
            suggestions.push('Generate summary');
        }
    }
    
    // Limit to top 3 suggestions
    return suggestions.slice(0, 3);
}

// Helper function to calculate confidence score
function calculateConfidence(
    message: string,
    recentMessageCount: number,
    contextRecordCount: number
): number {
    let confidence = 0.5; // Base confidence
    
    // Boost confidence based on message clarity
    if (message.length > 10) confidence += 0.1;
    if (message.length > 50) confidence += 0.1;
    if (/\b(please|help|can you|would you|could you)\b/.test(message.toLowerCase())) {
        confidence += 0.1; // Clear requests
    }
    
    // Boost confidence based on available context
    confidence += Math.min(recentMessageCount * 0.05, 0.2);
    confidence += Math.min(contextRecordCount * 0.1, 0.3);
    
    // Cap confidence at reasonable levels
    return Math.min(confidence, 0.95);
}