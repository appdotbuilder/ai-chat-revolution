import { db } from '../db';
import { chatsTable, messagesTable, usersTable, aiContextTable } from '../db/schema';
import { eq, desc, and, gte, inArray } from 'drizzle-orm';

export interface AIMeetingSuggestion {
    title: string;
    description: string;
    suggested_time: Date;
    duration_minutes: number;
    participants: string[];
    confidence: number;
    reasoning: string;
}

export const aiMeetingSuggestions = async (chatId: string, userId: string): Promise<AIMeetingSuggestion[]> => {
    try {
        // Verify chat exists and user has access
        const chatResult = await db.select()
            .from(chatsTable)
            .where(eq(chatsTable.id, chatId))
            .execute();

        if (chatResult.length === 0) {
            throw new Error('Chat not found');
        }

        const chat = chatResult[0];
        const participants = chat.participants as string[];

        // Verify user is a participant
        if (!participants.includes(userId)) {
            throw new Error('User is not a participant in this chat');
        }

        // Get recent messages (last 24 hours) for analysis
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

        const recentMessages = await db.select()
            .from(messagesTable)
            .where(
                and(
                    eq(messagesTable.chat_id, chatId),
                    gte(messagesTable.created_at, twentyFourHoursAgo)
                )
            )
            .orderBy(desc(messagesTable.created_at))
            .limit(50)
            .execute();

        // Get participant details
        const participantDetails = await db.select()
            .from(usersTable)
            .where(inArray(usersTable.id, participants))
            .execute();

        // Get existing AI context for conversation analysis
        const existingContext = await db.select()
            .from(aiContextTable)
            .where(
                and(
                    eq(aiContextTable.chat_id, chatId),
                    eq(aiContextTable.context_type, 'conversation_summary')
                )
            )
            .orderBy(desc(aiContextTable.created_at))
            .limit(5)
            .execute();

        // Analyze messages for meeting triggers
        const suggestions = await analyzeMessagesForMeetings(
            recentMessages,
            participantDetails,
            existingContext,
            chat
        );

        // Store analysis as AI context for future reference
        if (suggestions.length > 0) {
            const contextContent = JSON.stringify({
                analysis_date: new Date(),
                message_count: recentMessages.length,
                suggestions_count: suggestions.length,
                chat_type: chat.type,
                participant_count: participants.length
            });

            await db.insert(aiContextTable)
                .values({
                    user_id: userId,
                    chat_id: chatId,
                    context_type: 'meeting_context',
                    content: contextContent,
                    relevance_score: Math.max(...suggestions.map(s => s.confidence))
                })
                .execute();
        }

        return suggestions;
    } catch (error) {
        console.error('AI meeting suggestions failed:', error);
        throw error;
    }
};

// AI analysis function - simulates AI processing of conversation context
async function analyzeMessagesForMeetings(
    messages: any[],
    participants: any[],
    context: any[],
    chat: any
): Promise<AIMeetingSuggestion[]> {
    const suggestions: AIMeetingSuggestion[] = [];

    if (messages.length === 0) {
        return suggestions;
    }

    // Analyze message content for meeting indicators
    const messageTexts = messages.map(m => m.content.toLowerCase());
    const allText = messageTexts.join(' ');

    // Meeting trigger keywords and their weights
    const meetingTriggers = [
        { keywords: ['meeting', 'meet', 'schedule', 'call'], weight: 0.9, type: 'general' },
        { keywords: ['project', 'deadline', 'planning', 'review'], weight: 0.8, type: 'project' },
        { keywords: ['discuss', 'decision', 'strategy', 'brainstorm'], weight: 0.7, type: 'discussion' },
        { keywords: ['problem', 'issue', 'urgent', 'help'], weight: 0.85, type: 'urgent' },
        { keywords: ['presentation', 'demo', 'showcase', 'show'], weight: 0.75, type: 'presentation' }
    ];

    // Calculate confidence based on trigger matches
    let maxConfidence = 0;
    let primaryType = 'general';

    for (const trigger of meetingTriggers) {
        const matches = trigger.keywords.filter(keyword => allText.includes(keyword)).length;
        if (matches > 0) {
            const confidence = Math.min(trigger.weight * (matches / trigger.keywords.length), 1.0);
            if (confidence > maxConfidence) {
                maxConfidence = confidence;
                primaryType = trigger.type;
            }
        }
    }

    // Only suggest meetings if confidence is above threshold
    if (maxConfidence < 0.6) {
        return suggestions;
    }

    // Generate time-based suggestions
    const now = new Date();
    const suggestionTimes = [
        new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours from now
        new Date(now.getTime() + 24 * 60 * 60 * 1000), // Tomorrow same time
        new Date(now.getTime() + 48 * 60 * 60 * 1000)  // Day after tomorrow
    ];

    // Create suggestions based on analysis
    const participantIds = participants.map(p => p.id);

    for (let i = 0; i < Math.min(3, suggestionTimes.length); i++) {
        const confidence = maxConfidence - (i * 0.1); // Decrease confidence for later suggestions
        
        if (confidence < 0.5) break;

        const suggestion: AIMeetingSuggestion = {
            title: generateMeetingTitle(primaryType, chat.name),
            description: generateMeetingDescription(primaryType, messages.slice(0, 5)),
            suggested_time: suggestionTimes[i],
            duration_minutes: getDurationByType(primaryType),
            participants: participantIds,
            confidence: Math.round(confidence * 100) / 100,
            reasoning: generateReasoning(primaryType, messages.length, participantIds.length)
        };

        suggestions.push(suggestion);
    }

    return suggestions;
}

function generateMeetingTitle(type: string, chatName: string): string {
    const titles = {
        general: `Follow-up Discussion - ${chatName}`,
        project: `Project Planning Meeting - ${chatName}`,
        discussion: `Strategy Discussion - ${chatName}`,
        urgent: `Urgent Issue Resolution - ${chatName}`,
        presentation: `Review & Demo Session - ${chatName}`
    };
    return titles[type as keyof typeof titles] || `Team Meeting - ${chatName}`;
}

function generateMeetingDescription(type: string, recentMessages: any[]): string {
    const descriptions = {
        general: 'Continue the conversation and align on next steps based on recent chat discussions.',
        project: 'Review project progress, discuss milestones, and plan upcoming deliverables.',
        discussion: 'Strategic discussion to make key decisions and align on direction.',
        urgent: 'Address urgent issues identified in recent conversations and determine action items.',
        presentation: 'Present updates, demonstrate progress, and gather feedback from the team.'
    };
    
    const baseDescription = descriptions[type as keyof typeof descriptions] || 'Team meeting to discuss recent topics.';
    
    if (recentMessages.length > 0) {
        return `${baseDescription} This meeting was suggested based on ${recentMessages.length} recent messages indicating the need for synchronous discussion.`;
    }
    
    return baseDescription;
}

function getDurationByType(type: string): number {
    const durations = {
        general: 30,
        project: 60,
        discussion: 45,
        urgent: 30,
        presentation: 45
    };
    return durations[type as keyof typeof durations] || 30;
}

function generateReasoning(type: string, messageCount: number, participantCount: number): string {
    const reasonings = {
        general: `Detected meeting-related keywords in ${messageCount} recent messages with ${participantCount} participants.`,
        project: `Project-related discussions identified across ${messageCount} messages suggest need for planning session.`,
        discussion: `Strategic discussion indicators found in conversation history with ${participantCount} stakeholders.`,
        urgent: `Urgent issue keywords detected in recent messages requiring immediate attention from ${participantCount} people.`,
        presentation: `Demo or presentation-related content identified, suggesting review session with ${participantCount} participants.`
    };
    return reasonings[type as keyof typeof reasonings] || `AI analysis of ${messageCount} messages suggests meeting would be beneficial.`;
}