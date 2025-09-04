import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, chatsTable, messagesTable, aiContextTable } from '../db/schema';
import { type AIChatCompletionInput } from '../schema';
import { aiChatCompletion } from '../handlers/ai_chat_completion';

// Test data setup
const testUser = {
  email: 'test@example.com',
  display_name: 'Test User',
  preferences: {
    language: 'en',
    timezone: 'UTC',
    ai_assistance_level: 'moderate' as const,
    voice_enabled: false,
    encryption_enabled: true
  }
};

const testChat = {
  name: 'Test Chat',
  type: 'group' as const,
  participants: ['user1', 'user2'],
  created_by: 'user1'
};

describe('aiChatCompletion', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should process basic chat completion request', async () => {
    // Create user and chat
    const [user] = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const [chat] = await db.insert(chatsTable)
      .values({
        ...testChat,
        created_by: user.id
      })
      .returning()
      .execute();

    const input: AIChatCompletionInput = {
      chat_id: chat.id,
      user_id: user.id,
      message: 'Hello, can you help me schedule a meeting?',
      context_window: 10,
      include_suggestions: true
    };

    const result = await aiChatCompletion(input);

    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe('string');
    expect(result.response.length).toBeGreaterThan(0);
    expect(result.context_used).toBeDefined();
    expect(typeof result.context_used).toBe('boolean');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.tone_detected).toBeDefined();
    expect(result.suggestions).toBeInstanceOf(Array);
    expect(result.suggestions?.length).toBeGreaterThan(0);
  });

  it('should detect professional tone for meeting requests', async () => {
    const [user] = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const [chat] = await db.insert(chatsTable)
      .values({
        ...testChat,
        created_by: user.id
      })
      .returning()
      .execute();

    const input: AIChatCompletionInput = {
      chat_id: chat.id,
      user_id: user.id,
      message: 'I need to schedule a project meeting for next week.',
      context_window: 5,
      include_suggestions: true
    };

    const result = await aiChatCompletion(input);

    expect(result.tone_detected).toBe('professional');
    expect(result.suggestions).toContain('Schedule a meeting');
  });

  it('should detect casual tone for informal messages', async () => {
    const [user] = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const [chat] = await db.insert(chatsTable)
      .values({
        ...testChat,
        created_by: user.id
      })
      .returning()
      .execute();

    const input: AIChatCompletionInput = {
      chat_id: chat.id,
      user_id: user.id,
      message: 'Hey! That sounds awesome, thanks!',
      context_window: 5,
      include_suggestions: true
    };

    const result = await aiChatCompletion(input);

    expect(result.tone_detected).toBe('casual');
  });

  it('should detect empathetic tone for help requests', async () => {
    const [user] = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const [chat] = await db.insert(chatsTable)
      .values({
        ...testChat,
        created_by: user.id
      })
      .returning()
      .execute();

    const input: AIChatCompletionInput = {
      chat_id: chat.id,
      user_id: user.id,
      message: 'I am having trouble with this issue, can you help?',
      context_window: 5,
      include_suggestions: true
    };

    const result = await aiChatCompletion(input);

    expect(result.tone_detected).toBe('empathetic');
  });

  it('should use recent messages as context', async () => {
    const [user] = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const [chat] = await db.insert(chatsTable)
      .values({
        ...testChat,
        created_by: user.id
      })
      .returning()
      .execute();

    // Add some recent messages
    await db.insert(messagesTable)
      .values([
        {
          chat_id: chat.id,
          sender_id: user.id,
          content: 'Previous message 1',
          message_type: 'text'
        },
        {
          chat_id: chat.id,
          sender_id: user.id,
          content: 'Previous message 2',
          message_type: 'text'
        }
      ])
      .execute();

    const input: AIChatCompletionInput = {
      chat_id: chat.id,
      user_id: user.id,
      message: 'Can you summarize our conversation?',
      context_window: 5,
      include_suggestions: true
    };

    const result = await aiChatCompletion(input);

    expect(result.context_used).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should use AI context records', async () => {
    const [user] = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const [chat] = await db.insert(chatsTable)
      .values({
        ...testChat,
        created_by: user.id
      })
      .returning()
      .execute();

    // Add AI context
    await db.insert(aiContextTable)
      .values({
        user_id: user.id,
        chat_id: chat.id,
        context_type: 'conversation_summary',
        content: 'Previous conversation about project planning',
        relevance_score: 0.9
      })
      .execute();

    const input: AIChatCompletionInput = {
      chat_id: chat.id,
      user_id: user.id,
      message: 'What did we discuss about the project?',
      context_window: 5,
      include_suggestions: true
    };

    const result = await aiChatCompletion(input);

    expect(result.context_used).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it('should respect tone parameter override', async () => {
    const [user] = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const [chat] = await db.insert(chatsTable)
      .values({
        ...testChat,
        created_by: user.id
      })
      .returning()
      .execute();

    const input: AIChatCompletionInput = {
      chat_id: chat.id,
      user_id: user.id,
      message: 'Schedule meeting',
      tone: 'casual',
      context_window: 5,
      include_suggestions: true
    };

    const result = await aiChatCompletion(input);

    // Even though "Schedule meeting" might be detected as professional,
    // the tone override should influence the response style
    expect(result.response).toContain('Sure!');
  });

  it('should generate relevant suggestions based on message content', async () => {
    const [user] = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const [chat] = await db.insert(chatsTable)
      .values({
        ...testChat,
        created_by: user.id
      })
      .returning()
      .execute();

    const input: AIChatCompletionInput = {
      chat_id: chat.id,
      user_id: user.id,
      message: 'I need to translate this document',
      include_suggestions: true,
      context_window: 5
    };

    const result = await aiChatCompletion(input);

    expect(result.suggestions).toContain('Translate message');
  });

  it('should not include suggestions when disabled', async () => {
    const [user] = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const [chat] = await db.insert(chatsTable)
      .values({
        ...testChat,
        created_by: user.id
      })
      .returning()
      .execute();

    const input: AIChatCompletionInput = {
      chat_id: chat.id,
      user_id: user.id,
      message: 'Hello there',
      include_suggestions: false,
      context_window: 5
    };

    const result = await aiChatCompletion(input);

    expect(result.suggestions).toBeUndefined();
  });

  it('should filter out expired AI context', async () => {
    const [user] = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const [chat] = await db.insert(chatsTable)
      .values({
        ...testChat,
        created_by: user.id
      })
      .returning()
      .execute();

    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 1); // 1 hour ago

    // Add expired AI context
    await db.insert(aiContextTable)
      .values({
        user_id: user.id,
        chat_id: chat.id,
        context_type: 'conversation_summary',
        content: 'Expired conversation context',
        relevance_score: 0.8,
        expires_at: pastDate
      })
      .execute();

    const input: AIChatCompletionInput = {
      chat_id: chat.id,
      user_id: user.id,
      message: 'What did we discuss?',
      context_window: 5,
      include_suggestions: true
    };

    const result = await aiChatCompletion(input);

    // Should not use expired context
    expect(result.context_used).toBe(false);
  });

  it('should throw error for non-existent chat', async () => {
    const [user] = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const input: AIChatCompletionInput = {
      chat_id: '12345678-1234-1234-1234-123456789012',
      user_id: user.id,
      message: 'Hello',
      context_window: 5,
      include_suggestions: true
    };

    expect(aiChatCompletion(input)).rejects.toThrow(/chat not found/i);
  });

  it('should throw error for non-existent user', async () => {
    const [chat] = await db.insert(chatsTable)
      .values({
        ...testChat,
        created_by: '12345678-1234-1234-1234-123456789012'
      })
      .returning()
      .execute();

    const input: AIChatCompletionInput = {
      chat_id: chat.id,
      user_id: '12345678-1234-1234-1234-123456789013',
      message: 'Hello',
      context_window: 5,
      include_suggestions: true
    };

    expect(aiChatCompletion(input)).rejects.toThrow(/user not found/i);
  });

  it('should calculate higher confidence with more context', async () => {
    const [user] = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const [chat] = await db.insert(chatsTable)
      .values({
        ...testChat,
        created_by: user.id
      })
      .returning()
      .execute();

    // Add multiple recent messages and AI context
    await db.insert(messagesTable)
      .values([
        {
          chat_id: chat.id,
          sender_id: user.id,
          content: 'Message 1',
          message_type: 'text'
        },
        {
          chat_id: chat.id,
          sender_id: user.id,
          content: 'Message 2',
          message_type: 'text'
        },
        {
          chat_id: chat.id,
          sender_id: user.id,
          content: 'Message 3',
          message_type: 'text'
        }
      ])
      .execute();

    await db.insert(aiContextTable)
      .values([
        {
          user_id: user.id,
          chat_id: chat.id,
          context_type: 'conversation_summary',
          content: 'Context 1',
          relevance_score: 0.9
        },
        {
          user_id: user.id,
          chat_id: chat.id,
          context_type: 'user_preference',
          content: 'Context 2',
          relevance_score: 0.8
        }
      ])
      .execute();

    const input: AIChatCompletionInput = {
      chat_id: chat.id,
      user_id: user.id,
      message: 'This is a detailed message with clear context about what I need help with',
      context_window: 10,
      include_suggestions: true
    };

    const result = await aiChatCompletion(input);

    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.context_used).toBe(true);
  });
});