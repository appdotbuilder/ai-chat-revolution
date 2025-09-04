import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, chatsTable, messagesTable } from '../db/schema';
import { type GetChatMessagesInput } from '../schema';
import { getChatMessages } from '../handlers/get_chat_messages';

// Test data setup
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

const testChat = {
  name: 'Test Chat',
  type: 'direct' as const,
  participants: [] as string[], // Will be filled with user IDs
  is_encrypted: true,
  created_by: '' // Will be filled with user ID
};

describe('getChatMessages', () => {
  let userId1: string;
  let userId2: string;
  let chatId: string;
  let messageIds: string[] = [];

  beforeEach(async () => {
    await createDB();
    
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
        ...testChat,
        participants: [userId1, userId2],
        created_by: userId1
      })
      .returning()
      .execute();
    
    chatId = chats[0].id;

    // Create test messages with different timestamps
    const now = new Date();
    const messages = [
      {
        chat_id: chatId,
        sender_id: userId1,
        content: 'First message',
        message_type: 'text' as const,
        created_at: new Date(now.getTime() - 3000), // 3 seconds ago
        updated_at: new Date(now.getTime() - 3000)
      },
      {
        chat_id: chatId,
        sender_id: userId2,
        content: 'Second message',
        message_type: 'text' as const,
        created_at: new Date(now.getTime() - 2000), // 2 seconds ago
        updated_at: new Date(now.getTime() - 2000)
      },
      {
        chat_id: chatId,
        sender_id: userId1,
        content: 'Third message',
        message_type: 'text' as const,
        created_at: new Date(now.getTime() - 1000), // 1 second ago
        updated_at: new Date(now.getTime() - 1000)
      },
      {
        chat_id: chatId,
        sender_id: userId2,
        content: 'Fourth message',
        message_type: 'voice' as const,
        metadata: {
          voice_duration: 5.5,
          ai_context: {
            tone: 'casual',
            confidence: 0.95
          }
        },
        created_at: now,
        updated_at: now
      }
    ];

    const insertedMessages = await db.insert(messagesTable)
      .values(messages)
      .returning()
      .execute();
    
    messageIds = insertedMessages.map(m => m.id);
  });

  afterEach(resetDB);

  it('should retrieve messages for a chat', async () => {
    const input: GetChatMessagesInput = {
      chat_id: chatId,
      limit: 50,
      offset: 0
    };

    const result = await getChatMessages(input);

    expect(result).toHaveLength(4);
    expect(result[0].chat_id).toEqual(chatId);
    expect(result[0].content).toEqual('Fourth message'); // Most recent first
    expect(result[1].content).toEqual('Third message');
    expect(result[2].content).toEqual('Second message');
    expect(result[3].content).toEqual('First message');
  });

  it('should handle pagination with limit', async () => {
    const input: GetChatMessagesInput = {
      chat_id: chatId,
      limit: 2,
      offset: 0
    };

    const result = await getChatMessages(input);

    expect(result).toHaveLength(2);
    expect(result[0].content).toEqual('Fourth message');
    expect(result[1].content).toEqual('Third message');
  });

  it('should handle pagination with offset', async () => {
    const input: GetChatMessagesInput = {
      chat_id: chatId,
      limit: 2,
      offset: 2
    };

    const result = await getChatMessages(input);

    expect(result).toHaveLength(2);
    expect(result[0].content).toEqual('Second message');
    expect(result[1].content).toEqual('First message');
  });

  it('should filter messages by date with before parameter', async () => {
    const now = new Date();
    const beforeTime = new Date(now.getTime() - 1500); // 1.5 seconds ago

    const input: GetChatMessagesInput = {
      chat_id: chatId,
      limit: 50,
      offset: 0,
      before: beforeTime
    };

    const result = await getChatMessages(input);

    expect(result).toHaveLength(2); // Only first two messages
    expect(result[0].content).toEqual('Second message');
    expect(result[1].content).toEqual('First message');
  });

  it('should handle voice messages with metadata correctly', async () => {
    const input: GetChatMessagesInput = {
      chat_id: chatId,
      limit: 1,
      offset: 0
    };

    const result = await getChatMessages(input);

    expect(result[0].message_type).toEqual('voice');
    expect(result[0].metadata).toBeDefined();
    expect(result[0].metadata?.voice_duration).toEqual(5.5);
    expect(result[0].metadata?.ai_context?.tone).toEqual('casual');
    expect(result[0].metadata?.ai_context?.confidence).toEqual(0.95);
  });

  it('should return empty array for non-existent chat', async () => {
    const input: GetChatMessagesInput = {
      chat_id: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID format
      limit: 50,
      offset: 0
    };

    const result = await getChatMessages(input);

    expect(result).toHaveLength(0);
  });

  it('should preserve all message fields correctly', async () => {
    const input: GetChatMessagesInput = {
      chat_id: chatId,
      limit: 1,
      offset: 0
    };

    const result = await getChatMessages(input);
    const message = result[0];

    expect(message.id).toBeDefined();
    expect(message.chat_id).toEqual(chatId);
    expect(message.sender_id).toEqual(userId2);
    expect(message.content).toEqual('Fourth message');
    expect(message.message_type).toEqual('voice');
    expect(message.metadata).toBeDefined();
    expect(message.reply_to).toBeNull();
    expect(message.is_edited).toEqual(false);
    expect(message.is_encrypted).toEqual(true);
    expect(message.created_at).toBeInstanceOf(Date);
    expect(message.updated_at).toBeInstanceOf(Date);
  });

  it('should handle empty chat correctly', async () => {
    // Create a chat with no messages
    const emptyChatResult = await db.insert(chatsTable)
      .values({
        name: 'Empty Chat',
        type: 'direct' as const,
        participants: [userId1, userId2],
        is_encrypted: true,
        created_by: userId1
      })
      .returning()
      .execute();

    const input: GetChatMessagesInput = {
      chat_id: emptyChatResult[0].id,
      limit: 50,
      offset: 0
    };

    const result = await getChatMessages(input);

    expect(result).toHaveLength(0);
  });

  it('should handle large offset correctly', async () => {
    const input: GetChatMessagesInput = {
      chat_id: chatId,
      limit: 50,
      offset: 100 // Larger than available messages
    };

    const result = await getChatMessages(input);

    expect(result).toHaveLength(0);
  });
});