import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { chatsTable, messagesTable, usersTable, aiContextTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { aiMeetingSuggestions } from '../handlers/ai_meeting_suggestions';

// Test data
const testUser1 = {
  email: 'user1@test.com',
  display_name: 'Test User 1',
  preferences: {
    language: 'en',
    timezone: 'UTC',
    ai_assistance_level: 'moderate' as const,
    voice_enabled: false,
    encryption_enabled: true
  }
};

const testUser2 = {
  email: 'user2@test.com',
  display_name: 'Test User 2',
  preferences: {
    language: 'en',
    timezone: 'UTC',
    ai_assistance_level: 'moderate' as const,
    voice_enabled: false,
    encryption_enabled: true
  }
};

describe('aiMeetingSuggestions', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let userId1: string;
  let userId2: string;
  let chatId: string;

  beforeEach(async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([testUser1, testUser2])
      .returning()
      .execute();
    
    userId1 = users[0].id;
    userId2 = users[1].id;

    // Create test chat
    const chats = await db.insert(chatsTable)
      .values({
        name: 'Project Alpha Team',
        type: 'group',
        participants: [userId1, userId2],
        created_by: userId1
      })
      .returning()
      .execute();
    
    chatId = chats[0].id;
  });

  it('should return empty array for chat with no recent messages', async () => {
    const suggestions = await aiMeetingSuggestions(chatId, userId1);
    
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions).toHaveLength(0);
  });

  it('should throw error for non-existent chat', async () => {
    const fakeUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    
    await expect(aiMeetingSuggestions(fakeUuid, userId1))
      .rejects.toThrow(/Chat not found/i);
  });

  it('should throw error for user not in chat', async () => {
    // Create another user not in the chat
    const otherUser = await db.insert(usersTable)
      .values({
        email: 'other@test.com',
        display_name: 'Other User',
        preferences: {
          language: 'en',
          timezone: 'UTC',
          ai_assistance_level: 'moderate' as const,
          voice_enabled: false,
          encryption_enabled: true
        }
      })
      .returning()
      .execute();
    
    await expect(aiMeetingSuggestions(chatId, otherUser[0].id))
      .rejects.toThrow(/User is not a participant/i);
  });

  it('should suggest meetings for project-related discussions', async () => {
    // Create messages with project-related keywords
    const projectMessages = [
      {
        chat_id: chatId,
        sender_id: userId1,
        content: 'We need to discuss the project timeline and upcoming deadlines',
        message_type: 'text' as const
      },
      {
        chat_id: chatId,
        sender_id: userId2,
        content: 'The project planning phase needs review before we move forward',
        message_type: 'text' as const
      },
      {
        chat_id: chatId,
        sender_id: userId1,
        content: 'Let\'s schedule a meeting to plan the next milestone',
        message_type: 'text' as const
      }
    ];

    await db.insert(messagesTable)
      .values(projectMessages)
      .execute();

    const suggestions = await aiMeetingSuggestions(chatId, userId1);
    
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    
    const firstSuggestion = suggestions[0];
    expect(firstSuggestion.title).toContain('Project Planning Meeting');
    expect(firstSuggestion.description).toContain('project progress');
    expect(firstSuggestion.duration_minutes).toEqual(60);
    expect(firstSuggestion.participants).toContain(userId1);
    expect(firstSuggestion.participants).toContain(userId2);
    expect(firstSuggestion.confidence).toBeGreaterThan(0.6);
    expect(firstSuggestion.reasoning).toContain('Project-related discussions');
    expect(firstSuggestion.suggested_time).toBeInstanceOf(Date);
    expect(firstSuggestion.suggested_time.getTime()).toBeGreaterThan(Date.now());
  });

  it('should suggest meetings for urgent discussions', async () => {
    const urgentMessages = [
      {
        chat_id: chatId,
        sender_id: userId1,
        content: 'We have an urgent problem that needs immediate attention',
        message_type: 'text' as const
      },
      {
        chat_id: chatId,
        sender_id: userId2,
        content: 'This issue is blocking our progress, we need help urgently',
        message_type: 'text' as const
      }
    ];

    await db.insert(messagesTable)
      .values(urgentMessages)
      .execute();

    const suggestions = await aiMeetingSuggestions(chatId, userId1);
    
    expect(suggestions.length).toBeGreaterThan(0);
    
    const firstSuggestion = suggestions[0];
    expect(firstSuggestion.title).toContain('Urgent Issue Resolution');
    expect(firstSuggestion.description).toContain('urgent issues');
    expect(firstSuggestion.duration_minutes).toEqual(30);
    expect(firstSuggestion.confidence).toBeGreaterThan(0.7);
    expect(firstSuggestion.reasoning).toContain('Urgent issue keywords');
  });

  it('should suggest meetings for presentation/demo discussions', async () => {
    const presentationMessages = [
      {
        chat_id: chatId,
        sender_id: userId1,
        content: 'Ready to showcase our progress in a demo session',
        message_type: 'text' as const
      },
      {
        chat_id: chatId,
        sender_id: userId2,
        content: 'The presentation looks good, let\'s show it to the team',
        message_type: 'text' as const
      }
    ];

    await db.insert(messagesTable)
      .values(presentationMessages)
      .execute();

    const suggestions = await aiMeetingSuggestions(chatId, userId1);
    
    expect(suggestions.length).toBeGreaterThan(0);
    
    const firstSuggestion = suggestions[0];
    expect(firstSuggestion.title).toContain('Review & Demo Session');
    expect(firstSuggestion.description).toContain('demonstrate progress');
    expect(firstSuggestion.duration_minutes).toEqual(45);
    expect(firstSuggestion.reasoning).toContain('Demo or presentation-related');
  });

  it('should not suggest meetings for low-confidence conversations', async () => {
    // Create messages without strong meeting indicators
    const casualMessages = [
      {
        chat_id: chatId,
        sender_id: userId1,
        content: 'How was your weekend?',
        message_type: 'text' as const
      },
      {
        chat_id: chatId,
        sender_id: userId2,
        content: 'Great, thanks for asking!',
        message_type: 'text' as const
      }
    ];

    await db.insert(messagesTable)
      .values(casualMessages)
      .execute();

    const suggestions = await aiMeetingSuggestions(chatId, userId1);
    
    expect(suggestions).toHaveLength(0);
  });

  it('should create AI context entry for successful suggestions', async () => {
    const meetingMessages = [
      {
        chat_id: chatId,
        sender_id: userId1,
        content: 'We should meet to discuss the strategy and make important decisions',
        message_type: 'text' as const
      },
      {
        chat_id: chatId,
        sender_id: userId2,
        content: 'Great idea, let\'s schedule a discussion meeting soon',
        message_type: 'text' as const
      }
    ];

    await db.insert(messagesTable)
      .values(meetingMessages)
      .execute();

    const suggestions = await aiMeetingSuggestions(chatId, userId1);
    
    expect(suggestions.length).toBeGreaterThan(0);

    // Check that AI context was created
    const contexts = await db.select()
      .from(aiContextTable)
      .where(eq(aiContextTable.chat_id, chatId))
      .execute();
    
    expect(contexts.length).toBeGreaterThan(0);
    
    const meetingContext = contexts.find(ctx => ctx.context_type === 'meeting_context');
    expect(meetingContext).toBeDefined();
    expect(meetingContext!.user_id).toEqual(userId1);
    expect(meetingContext!.content).toContain('suggestions_count');
    expect(meetingContext!.relevance_score).toBeGreaterThan(0.5);
  });

  it('should return multiple time-based suggestions with decreasing confidence', async () => {
    const strongMessages = [
      {
        chat_id: chatId,
        sender_id: userId1,
        content: 'We need to meet urgently to discuss this critical project issue',
        message_type: 'text' as const
      },
      {
        chat_id: chatId,
        sender_id: userId2,
        content: 'Yes, let\'s schedule a meeting to plan our strategy and review the deadline',
        message_type: 'text' as const
      },
      {
        chat_id: chatId,
        sender_id: userId1,
        content: 'The project planning meeting should help us decide on next steps',
        message_type: 'text' as const
      }
    ];

    await db.insert(messagesTable)
      .values(strongMessages)
      .execute();

    const suggestions = await aiMeetingSuggestions(chatId, userId1);
    
    expect(suggestions.length).toBeGreaterThanOrEqual(2);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    
    // Check that confidence decreases for later suggestions
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].confidence).toBeLessThanOrEqual(suggestions[i - 1].confidence);
    }
    
    // Check that suggested times are in the future and ordered
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].suggested_time.getTime())
        .toBeGreaterThan(suggestions[i - 1].suggested_time.getTime());
    }

    // Verify all suggestions have valid structure
    suggestions.forEach(suggestion => {
      expect(typeof suggestion.title).toBe('string');
      expect(typeof suggestion.description).toBe('string');
      expect(suggestion.suggested_time).toBeInstanceOf(Date);
      expect(typeof suggestion.duration_minutes).toBe('number');
      expect(Array.isArray(suggestion.participants)).toBe(true);
      expect(suggestion.participants.length).toEqual(2);
      expect(typeof suggestion.confidence).toBe('number');
      expect(suggestion.confidence).toBeGreaterThan(0);
      expect(suggestion.confidence).toBeLessThanOrEqual(1);
      expect(typeof suggestion.reasoning).toBe('string');
    });
  });

  it('should handle old messages correctly', async () => {
    // Create old messages (more than 24 hours ago)
    const oldTime = new Date();
    oldTime.setHours(oldTime.getHours() - 48);

    // Insert old message with timestamp manipulation
    await db.execute(`
      INSERT INTO messages (chat_id, sender_id, content, message_type, created_at)
      VALUES ('${chatId}', '${userId1}', 'Old meeting discussion', 'text', '${oldTime.toISOString()}')
    `);

    const suggestions = await aiMeetingSuggestions(chatId, userId1);
    
    // Should not suggest meetings based on old messages
    expect(suggestions).toHaveLength(0);
  });
});