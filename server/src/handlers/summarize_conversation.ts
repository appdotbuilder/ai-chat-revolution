import { db } from '../db';
import { messagesTable, chatsTable, usersTable } from '../db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { SQL } from 'drizzle-orm';

export interface SummarizeConversationInput {
    chat_id: string;
    user_id: string;
    time_range?: {
        from: Date;
        to: Date;
    };
    summary_type: 'brief' | 'detailed' | 'action_items';
}

export interface SummarizeConversationResponse {
    summary: string;
    key_points: string[];
    action_items?: string[];
    participants: string[];
    sentiment: string;
    topics: string[];
}

export const summarizeConversation = async (input: SummarizeConversationInput): Promise<SummarizeConversationResponse> => {
    try {
        // Verify chat exists and user has access
        let chat;
        try {
            chat = await db.select()
                .from(chatsTable)
                .where(eq(chatsTable.id, input.chat_id))
                .execute();
        } catch (error) {
            // Handle invalid UUID format
            if ((error as any).message?.includes('invalid input syntax for type uuid')) {
                throw new Error('Chat not found');
            }
            throw error;
        }

        if (chat.length === 0) {
            throw new Error('Chat not found');
        }

        const chatData = chat[0];
        const participants = Array.isArray(chatData.participants) ? chatData.participants as string[] : [];
        
        // Check if user is a participant
        if (!participants.includes(input.user_id)) {
            throw new Error('User not authorized to access this chat');
        }

        // Build query for messages
        let baseQuery = db.select({
            content: messagesTable.content,
            sender_id: messagesTable.sender_id,
            message_type: messagesTable.message_type,
            metadata: messagesTable.metadata,
            created_at: messagesTable.created_at,
            sender_name: usersTable.display_name
        })
        .from(messagesTable)
        .innerJoin(usersTable, eq(messagesTable.sender_id, usersTable.id));

        // Build conditions array
        const conditions: SQL<unknown>[] = [eq(messagesTable.chat_id, input.chat_id)];

        // Apply time range filters if provided
        if (input.time_range) {
            if (input.time_range.from) {
                conditions.push(gte(messagesTable.created_at, input.time_range.from));
            }
            if (input.time_range.to) {
                conditions.push(lte(messagesTable.created_at, input.time_range.to));
            }
        }

        // Apply where clause and order by created_at
        const query = baseQuery.where(and(...conditions))
            .orderBy(desc(messagesTable.created_at));

        const messages = await query.execute();

        if (messages.length === 0) {
            return {
                summary: "No messages found in the specified time range.",
                key_points: [],
                action_items: input.summary_type === 'action_items' ? [] : undefined,
                participants: [],
                sentiment: "neutral",
                topics: []
            };
        }

        // Extract unique participants
        const uniqueParticipants = [...new Set(messages.map(m => m.sender_name))];

        // Analyze message content for different summary types
        const messageContents = messages
            .filter(m => m.message_type === 'text' || m.message_type === 'ai_suggestion')
            .map(m => m.content);

        let summary: string;
        let keyPoints: string[];
        let actionItems: string[] | undefined;

        if (input.summary_type === 'brief') {
            summary = generateBriefSummary(messageContents, uniqueParticipants);
            keyPoints = extractKeyPoints(messageContents, 3);
        } else if (input.summary_type === 'detailed') {
            summary = generateDetailedSummary(messageContents, uniqueParticipants, messages);
            keyPoints = extractKeyPoints(messageContents, 8);
        } else { // action_items
            summary = generateActionItemSummary(messageContents, uniqueParticipants);
            keyPoints = extractKeyPoints(messageContents, 5);
            actionItems = extractActionItems(messageContents);
        }

        // Analyze sentiment
        const sentiment = analyzeSentiment(messageContents);

        // Extract topics
        const topics = extractTopics(messageContents);

        return {
            summary,
            key_points: keyPoints,
            action_items: actionItems,
            participants: uniqueParticipants,
            sentiment,
            topics
        };

    } catch (error) {
        console.error('Conversation summarization failed:', error);
        throw error;
    }
};

// Helper functions for content analysis

function generateBriefSummary(messages: string[], participants: string[]): string {
    const messageCount = messages.length;
    const participantList = participants.join(", ");
    
    if (messageCount === 0) {
        return "No conversation content to summarize.";
    }
    
    // Simple pattern matching for common conversation themes
    const hasQuestions = messages.some(m => m.includes('?'));
    const hasDecisions = messages.some(m => 
        m.toLowerCase().includes('decide') || 
        m.toLowerCase().includes('agree') || 
        m.toLowerCase().includes('confirm')
    );
    
    let summary = `Conversation between ${participantList} with ${messageCount} messages.`;
    
    if (hasDecisions) {
        summary += " Discussion included decision-making and agreements.";
    } else if (hasQuestions) {
        summary += " Conversation involved questions and information exchange.";
    } else {
        summary += " General discussion and information sharing.";
    }
    
    return summary;
}

function generateDetailedSummary(messages: string[], participants: string[], fullMessages: any[]): string {
    const messageCount = messages.length;
    const participantList = participants.join(", ");
    const timeSpan = getTimeSpan(fullMessages);
    
    let summary = `Detailed conversation summary: ${participantList} exchanged ${messageCount} messages over ${timeSpan}.`;
    
    // Analyze message types
    const voiceCount = fullMessages.filter(m => m.message_type === 'voice').length;
    const imageCount = fullMessages.filter(m => m.message_type === 'image').length;
    const fileCount = fullMessages.filter(m => m.message_type === 'file').length;
    
    if (voiceCount > 0 || imageCount > 0 || fileCount > 0) {
        summary += ` Multimedia content included: ${voiceCount} voice messages, ${imageCount} images, and ${fileCount} files.`;
    }
    
    // Look for patterns in content
    const longMessages = messages.filter(m => m.length > 100).length;
    const shortResponses = messages.filter(m => m.length < 20).length;
    
    if (longMessages > messageCount * 0.3) {
        summary += " Conversation featured detailed explanations and comprehensive discussions.";
    } else if (shortResponses > messageCount * 0.5) {
        summary += " Communication was brief and to-the-point with quick exchanges.";
    }
    
    return summary;
}

function generateActionItemSummary(messages: string[], participants: string[]): string {
    const participantList = participants.join(", ");
    const actionWords = ['todo', 'task', 'action', 'follow up', 'deadline', 'assign', 'complete', 'finish'];
    
    const actionRelatedMessages = messages.filter(m => 
        actionWords.some(word => m.toLowerCase().includes(word))
    );
    
    if (actionRelatedMessages.length === 0) {
        return `Conversation between ${participantList} with no explicit action items identified.`;
    }
    
    return `Action-focused conversation between ${participantList}. ${actionRelatedMessages.length} messages contained task-related content.`;
}

function extractKeyPoints(messages: string[], maxPoints: number): string[] {
    if (messages.length === 0) return [];
    
    // Simple extraction based on message length and keywords
    const importantMessages = messages
        .filter(m => m.length > 30) // Filter out very short messages
        .map(m => {
            // Clean up and truncate long messages
            const cleaned = m.replace(/\s+/g, ' ').trim();
            return cleaned.length > 100 ? cleaned.substring(0, 97) + '...' : cleaned;
        })
        .slice(0, maxPoints * 2); // Get more than needed for filtering
    
    // Score messages by importance indicators
    const scoredMessages = importantMessages.map(msg => ({
        content: msg,
        score: calculateImportanceScore(msg)
    }));
    
    // Sort by score and take top messages
    return scoredMessages
        .sort((a, b) => b.score - a.score)
        .slice(0, maxPoints)
        .map(item => item.content);
}

function extractActionItems(messages: string[]): string[] {
    const actionPatterns = [
        /(?:need to|should|must|have to|will|going to)\s+([^.!?]+)/gi,
        /(?:todo|task|action):\s*([^.!?\n]+)/gi,
        /(?:assign|give)\s+\w+\s+to\s+([^.!?]+)/gi,
        /(?:deadline|due|by)\s+([^.!?]+)/gi
    ];
    
    const actionItems: string[] = [];
    
    messages.forEach(message => {
        actionPatterns.forEach(pattern => {
            const matches = message.matchAll(pattern);
            for (const match of matches) {
                if (match[1] && match[1].trim().length > 5) {
                    actionItems.push(match[1].trim());
                }
            }
        });
    });
    
    // Remove duplicates and limit results
    return [...new Set(actionItems)].slice(0, 10);
}

function analyzeSentiment(messages: string[]): string {
    if (messages.length === 0) return "neutral";
    
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'love', 'like', 'happy', 'glad', 'thanks', 'thank you'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'dislike', 'sad', 'angry', 'frustrated', 'problem', 'issue'];
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    messages.forEach(message => {
        const lowerMessage = message.toLowerCase();
        positiveCount += positiveWords.filter(word => lowerMessage.includes(word)).length;
        negativeCount += negativeWords.filter(word => lowerMessage.includes(word)).length;
    });
    
    if (positiveCount > negativeCount * 1.5) return "positive";
    if (negativeCount > positiveCount * 1.5) return "negative";
    return "neutral";
}

function extractTopics(messages: string[]): string[] {
    if (messages.length === 0) return [];
    
    // Common topic keywords
    const topicKeywords = {
        'project management': ['project', 'milestone', 'deadline', 'task', 'sprint'],
        'meeting planning': ['meeting', 'schedule', 'calendar', 'time', 'availability'],
        'technical discussion': ['code', 'bug', 'feature', 'development', 'technical'],
        'business strategy': ['strategy', 'business', 'market', 'revenue', 'growth'],
        'team coordination': ['team', 'coordinate', 'collaborate', 'assign', 'responsibility'],
        'feedback': ['feedback', 'review', 'opinion', 'thoughts', 'suggestion']
    };
    
    const topicScores: { [key: string]: number } = {};
    
    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
        const score = messages.reduce((acc, message) => {
            const lowerMessage = message.toLowerCase();
            return acc + keywords.filter(keyword => lowerMessage.includes(keyword)).length;
        }, 0);
        
        if (score > 0) {
            topicScores[topic] = score;
        }
    });
    
    // Return topics sorted by relevance
    return Object.entries(topicScores)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([topic]) => topic);
}

function calculateImportanceScore(message: string): number {
    let score = 0;
    
    // Length factor
    score += Math.min(message.length / 50, 3);
    
    // Importance keywords
    const importantKeywords = ['important', 'critical', 'urgent', 'decision', 'agree', 'confirm', 'deadline'];
    score += importantKeywords.filter(keyword => message.toLowerCase().includes(keyword)).length * 2;
    
    // Question marks indicate engagement
    score += (message.match(/\?/g) || []).length * 0.5;
    
    // Exclamation marks indicate emphasis
    score += (message.match(/!/g) || []).length * 0.3;
    
    return score;
}

function getTimeSpan(messages: any[]): string {
    if (messages.length < 2) return "a short period";
    
    const times = messages.map(m => new Date(m.created_at)).sort((a, b) => a.getTime() - b.getTime());
    const start = times[0];
    const end = times[times.length - 1];
    
    const diffMs = end.getTime() - start.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffHours / 24;
    
    if (diffDays > 1) {
        return `${Math.ceil(diffDays)} days`;
    } else if (diffHours > 1) {
        return `${Math.ceil(diffHours)} hours`;
    } else {
        return "less than an hour";
    }
}