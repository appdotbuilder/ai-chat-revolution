import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, chatsTable, messagesTable } from '../db/schema';
import { summarizeConversation, type SummarizeConversationInput } from '../handlers/summarize_conversation';

describe('summarizeConversation', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUser1: any;
  let testUser2: any;
  let testChat: any;

  const setupTestData = async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'user1@example.com',
          display_name: 'User One',
          preferences: {
            language: 'en',
            timezone: 'UTC',
            ai_assistance_level: 'moderate',
            voice_enabled: false,
            encryption_enabled: true
          }
        },
        {
          email: 'user2@example.com',
          display_name: 'User Two',
          preferences: {
            language: 'en',
            timezone: 'UTC',
            ai_assistance_level: 'moderate',
            voice_enabled: false,
            encryption_enabled: true
          }
        }
      ])
      .returning()
      .execute();

    testUser1 = users[0];
    testUser2 = users[1];

    // Create test chat
    const chats = await db.insert(chatsTable)
      .values({
        name: 'Test Chat',
        type: 'group',
        participants: [testUser1.id, testUser2.id],
        created_by: testUser1.id
      })
      .returning()
      .execute();

    testChat = chats[0];
  };

  const createTestMessages = async (messageData: Array<{
    content: string;
    sender_id: string;
    message_type?: 'text' | 'voice' | 'image' | 'file' | 'ai_suggestion';
    created_at?: Date;
  }>) => {
    return await db.insert(messagesTable)
      .values(messageData.map(msg => ({
        chat_id: testChat.id,
        sender_id: msg.sender_id,
        content: msg.content,
        message_type: msg.message_type || 'text',
        created_at: msg.created_at || new Date()
      })))
      .returning()
      .execute();
  };

  it('should throw error for non-existent chat', async () => {
    await setupTestData();

    const input: SummarizeConversationInput = {
      chat_id: 'non-existent-id',
      user_id: testUser1.id,
      summary_type: 'brief'
    };

    await expect(summarizeConversation(input)).rejects.toThrow(/Chat not found/);
  });

  it('should throw error for unauthorized user', async () => {
    await setupTestData();

    // Create user not in chat
    const unauthorizedUser = await db.insert(usersTable)
      .values({
        email: 'unauthorized@example.com',
        display_name: 'Unauthorized User',
        preferences: {
          language: 'en',
          timezone: 'UTC',
          ai_assistance_level: 'moderate',
          voice_enabled: false,
          encryption_enabled: true
        }
      })
      .returning()
      .execute();

    const input: SummarizeConversationInput = {
      chat_id: testChat.id,
      user_id: unauthorizedUser[0].id,
      summary_type: 'brief'
    };

    await expect(summarizeConversation(input)).rejects.toThrow(/User not authorized/);
  });

  it('should return empty summary for no messages', async () => {
    await setupTestData();

    const input: SummarizeConversationInput = {
      chat_id: testChat.id,
      user_id: testUser1.id,
      summary_type: 'brief'
    };

    const result = await summarizeConversation(input);

    expect(result.summary).toEqual('No messages found in the specified time range.');
    expect(result.key_points).toEqual([]);
    expect(result.participants).toEqual([]);
    expect(result.sentiment).toEqual('neutral');
    expect(result.topics).toEqual([]);
    expect(result.action_items).toBeUndefined();
  });

  it('should generate brief summary correctly', async () => {
    await setupTestData();

    await createTestMessages([
      { content: 'Hello everyone!', sender_id: testUser1.id },
      { content: 'Hi there! How are you?', sender_id: testUser2.id },
      { content: 'I am doing well, thanks for asking.', sender_id: testUser1.id },
      { content: 'Great to hear!', sender_id: testUser2.id }
    ]);

    const input: SummarizeConversationInput = {
      chat_id: testChat.id,
      user_id: testUser1.id,
      summary_type: 'brief'
    };

    const result = await summarizeConversation(input);

    expect(result.summary).toContain('User One, User Two');
    expect(result.summary).toContain('4 messages');
    expect(result.key_points.length).toBeGreaterThan(0);
    expect(result.participants).toEqual(['User One', 'User Two']);
    expect(result.sentiment).toEqual('positive');
    expect(result.action_items).toBeUndefined();
    expect(typeof result.summary).toBe('string');
  });

  it('should generate detailed summary with multimedia content', async () => {
    await setupTestData();

    await createTestMessages([
      { content: 'Here is a detailed explanation of our project requirements and timeline.', sender_id: testUser1.id },
      { content: 'Voice message content', sender_id: testUser2.id, message_type: 'voice' },
      { content: 'Screenshot of the design', sender_id: testUser1.id, message_type: 'image' },
      { content: 'Project documentation attached', sender_id: testUser2.id, message_type: 'file' }
    ]);

    const input: SummarizeConversationInput = {
      chat_id: testChat.id,
      user_id: testUser1.id,
      summary_type: 'detailed'
    };

    const result = await summarizeConversation(input);

    expect(result.summary).toContain('User One, User Two');
    expect(result.summary).toContain('Multimedia content included');
    expect(result.summary).toContain('1 voice messages, 1 images, and 1 files');
    expect(result.key_points.length).toBeGreaterThan(0);
    expect(result.participants).toEqual(['User One', 'User Two']);
    expect(result.action_items).toBeUndefined();
  });

  it('should extract action items correctly', async () => {
    await setupTestData();

    await createTestMessages([
      { content: 'We need to finish the project by Friday.', sender_id: testUser1.id },
      { content: 'I will assign this task to the development team.', sender_id: testUser2.id },
      { content: 'Todo: Review the requirements document', sender_id: testUser1.id },
      { content: 'The deadline for testing is next week.', sender_id: testUser2.id },
      { content: 'Action: Set up the deployment pipeline', sender_id: testUser1.id }
    ]);

    const input: SummarizeConversationInput = {
      chat_id: testChat.id,
      user_id: testUser1.id,
      summary_type: 'action_items'
    };

    const result = await summarizeConversation(input);

    expect(result.summary).toContain('Action-focused conversation');
    expect(result.action_items).toBeDefined();
    expect(result.action_items!.length).toBeGreaterThan(0);
    expect(result.action_items).toEqual(
      expect.arrayContaining([
        expect.stringContaining('finish the project')
      ])
    );
    expect(result.participants).toEqual(['User One', 'User Two']);
  });

  it('should filter messages by time range', async () => {
    await setupTestData();

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    await createTestMessages([
      { content: 'Old message', sender_id: testUser1.id, created_at: twoHoursAgo },
      { content: 'Recent message within range', sender_id: testUser2.id, created_at: oneHourAgo },
      { content: 'Another recent message', sender_id: testUser1.id, created_at: now }
    ]);

    const input: SummarizeConversationInput = {
      chat_id: testChat.id,
      user_id: testUser1.id,
      summary_type: 'brief',
      time_range: {
        from: oneHourAgo,
        to: now
      }
    };

    const result = await summarizeConversation(input);

    // Should only include 2 messages within time range
    expect(result.summary).toContain('2 messages');
    expect(result.participants).toEqual(expect.arrayContaining(['User Two', 'User One']));
    expect(result.participants).toHaveLength(2);
  });

  it('should analyze sentiment correctly', async () => {
    await setupTestData();

    // Test positive sentiment
    await createTestMessages([
      { content: 'This is amazing work! Great job everyone!', sender_id: testUser1.id },
      { content: 'I love this approach. Excellent results!', sender_id: testUser2.id },
      { content: 'Thank you for the good feedback!', sender_id: testUser1.id }
    ]);

    const positiveInput: SummarizeConversationInput = {
      chat_id: testChat.id,
      user_id: testUser1.id,
      summary_type: 'brief'
    };

    const positiveResult = await summarizeConversation(positiveInput);
    expect(positiveResult.sentiment).toEqual('positive');

    // Clear messages and test negative sentiment
    await db.delete(messagesTable).execute();

    await createTestMessages([
      { content: 'This is terrible. I hate this approach.', sender_id: testUser1.id },
      { content: 'Bad results. This is awful and frustrating.', sender_id: testUser2.id },
      { content: 'We have serious problems with this issue.', sender_id: testUser1.id }
    ]);

    const negativeResult = await summarizeConversation(positiveInput);
    expect(negativeResult.sentiment).toEqual('negative');
  });

  it('should extract topics correctly', async () => {
    await setupTestData();

    await createTestMessages([
      { content: 'We need to discuss the project milestone and deadline.', sender_id: testUser1.id },
      { content: 'Let me schedule a meeting for next week to coordinate with the team.', sender_id: testUser2.id },
      { content: 'The code review found a bug in the feature development.', sender_id: testUser1.id },
      { content: 'I have feedback on the technical approach we should consider.', sender_id: testUser2.id }
    ]);

    const input: SummarizeConversationInput = {
      chat_id: testChat.id,
      user_id: testUser1.id,
      summary_type: 'brief'
    };

    const result = await summarizeConversation(input);

    expect(result.topics).toEqual(
      expect.arrayContaining([
        'project management',
        'meeting planning',
        'technical discussion',
        'team coordination',
        'feedback'
      ])
    );
    expect(result.topics.length).toBeGreaterThan(0);
    expect(result.topics.length).toBeLessThanOrEqual(5);
  });

  it('should handle mixed message types correctly', async () => {
    await setupTestData();

    await createTestMessages([
      { content: 'Regular text message with sufficient length to be considered as important content for analysis', sender_id: testUser1.id, message_type: 'text' },
      { content: 'AI suggested response with detailed explanation and comprehensive information for the user', sender_id: testUser2.id, message_type: 'ai_suggestion' },
      { content: 'Voice transcription', sender_id: testUser1.id, message_type: 'voice' },
      { content: 'Image description', sender_id: testUser2.id, message_type: 'image' },
      { content: 'File content', sender_id: testUser1.id, message_type: 'file' }
    ]);

    const input: SummarizeConversationInput = {
      chat_id: testChat.id,
      user_id: testUser1.id,
      summary_type: 'detailed'
    };

    const result = await summarizeConversation(input);

    // Only text and ai_suggestion messages should be analyzed for content
    expect(result.key_points.length).toBeGreaterThan(0);
    expect(result.summary).toContain('Multimedia content included');
    expect(result.participants).toEqual(expect.arrayContaining(['User One', 'User Two']));
    expect(result.participants).toHaveLength(2);
  });

  it('should respect key points limit based on summary type', async () => {
    await setupTestData();

    // Create many messages to test limits
    const manyMessages = Array.from({ length: 15 }, (_, i) => ({
      content: `This is a detailed message number ${i + 1} with sufficient length to be considered important.`,
      sender_id: i % 2 === 0 ? testUser1.id : testUser2.id
    }));

    await createTestMessages(manyMessages);

    // Test brief summary (should have max 3 key points)
    const briefInput: SummarizeConversationInput = {
      chat_id: testChat.id,
      user_id: testUser1.id,
      summary_type: 'brief'
    };

    const briefResult = await summarizeConversation(briefInput);
    expect(briefResult.key_points.length).toBeLessThanOrEqual(3);

    // Test detailed summary (should have max 8 key points)
    const detailedInput: SummarizeConversationInput = {
      chat_id: testChat.id,
      user_id: testUser1.id,
      summary_type: 'detailed'
    };

    const detailedResult = await summarizeConversation(detailedInput);
    expect(detailedResult.key_points.length).toBeLessThanOrEqual(8);

    // Test action items summary (should have max 5 key points)
    const actionInput: SummarizeConversationInput = {
      chat_id: testChat.id,
      user_id: testUser1.id,
      summary_type: 'action_items'
    };

    const actionResult = await summarizeConversation(actionInput);
    expect(actionResult.key_points.length).toBeLessThanOrEqual(5);
    expect(actionResult.action_items).toBeDefined();
  });
});