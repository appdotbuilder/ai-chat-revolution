import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { messagesTable, usersTable, chatsTable } from '../db/schema';
import { type CreateMessageInput } from '../schema';
import { createMessage } from '../handlers/create_message';
import { eq } from 'drizzle-orm';

// Test user data
const testUser = {
  email: 'test@example.com',
  display_name: 'Test User',
  avatar_url: null,
  preferences: {
    language: 'en',
    timezone: 'UTC',
    ai_assistance_level: 'moderate' as const,
    voice_enabled: false,
    encryption_enabled: true
  }
};

// Test chat data
const testChat = {
  name: 'Test Chat',
  type: 'group' as const,
  participants: [] as string[], // Will be populated with user IDs
  is_encrypted: true,
  created_by: '' // Will be populated with user ID
};

// Basic message input
const basicMessageInput: CreateMessageInput = {
  chat_id: '',
  sender_id: '',
  content: 'Hello, this is a test message',
  message_type: 'text'
};

describe('createMessage', () => {
  let userId: string;
  let chatId: string;

  beforeEach(async () => {
    await createDB();
    
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    userId = userResult[0].id;

    // Create test chat
    const chatToInsert = {
      ...testChat,
      participants: [userId],
      created_by: userId
    };
    
    const chatResult = await db.insert(chatsTable)
      .values(chatToInsert)
      .returning()
      .execute();
    chatId = chatResult[0].id;
  });

  afterEach(resetDB);

  it('should create a basic text message', async () => {
    const input = {
      ...basicMessageInput,
      chat_id: chatId,
      sender_id: userId
    };

    const result = await createMessage(input);

    // Basic field validation
    expect(result.chat_id).toEqual(chatId);
    expect(result.sender_id).toEqual(userId);
    expect(result.content).toEqual('Hello, this is a test message');
    expect(result.message_type).toEqual('text');
    expect(result.metadata).toBeNull();
    expect(result.reply_to).toBeNull();
    expect(result.is_edited).toBe(false);
    expect(result.is_encrypted).toBe(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save message to database', async () => {
    const input = {
      ...basicMessageInput,
      chat_id: chatId,
      sender_id: userId
    };

    const result = await createMessage(input);

    // Query the database to verify the message was saved
    const messages = await db.select()
      .from(messagesTable)
      .where(eq(messagesTable.id, result.id))
      .execute();

    expect(messages).toHaveLength(1);
    const savedMessage = messages[0];
    expect(savedMessage.chat_id).toEqual(chatId);
    expect(savedMessage.sender_id).toEqual(userId);
    expect(savedMessage.content).toEqual('Hello, this is a test message');
    expect(savedMessage.message_type).toEqual('text');
    expect(savedMessage.is_encrypted).toBe(true);
    expect(savedMessage.is_edited).toBe(false);
  });

  it('should create message with voice metadata', async () => {
    const voiceInput: CreateMessageInput = {
      chat_id: chatId,
      sender_id: userId,
      content: 'Voice message transcription',
      message_type: 'voice',
      metadata: {
        voice_duration: 15.5,
        ai_context: {
          tone: 'casual',
          intent: 'greeting',
          confidence: 0.95
        }
      }
    };

    const result = await createMessage(voiceInput);

    expect(result.message_type).toEqual('voice');
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.voice_duration).toEqual(15.5);
    expect(result.metadata?.ai_context?.tone).toEqual('casual');
    expect(result.metadata?.ai_context?.confidence).toEqual(0.95);
  });

  it('should create message with image metadata', async () => {
    const imageInput: CreateMessageInput = {
      chat_id: chatId,
      sender_id: userId,
      content: 'Check out this image!',
      message_type: 'image',
      metadata: {
        image_dimensions: {
          width: 1920,
          height: 1080
        },
        file_size: 2048000,
        file_name: 'vacation_photo.jpg'
      }
    };

    const result = await createMessage(imageInput);

    expect(result.message_type).toEqual('image');
    expect(result.metadata?.image_dimensions?.width).toEqual(1920);
    expect(result.metadata?.image_dimensions?.height).toEqual(1080);
    expect(result.metadata?.file_size).toEqual(2048000);
    expect(result.metadata?.file_name).toEqual('vacation_photo.jpg');
  });

  it('should create message as reply to another message', async () => {
    // First create an original message
    const originalInput = {
      ...basicMessageInput,
      chat_id: chatId,
      sender_id: userId,
      content: 'Original message'
    };
    const originalMessage = await createMessage(originalInput);

    // Create a reply
    const replyInput: CreateMessageInput = {
      chat_id: chatId,
      sender_id: userId,
      content: 'This is a reply',
      message_type: 'text',
      reply_to: originalMessage.id
    };

    const result = await createMessage(replyInput);

    expect(result.reply_to).toEqual(originalMessage.id);
    expect(result.content).toEqual('This is a reply');
  });

  it('should create AI suggestion message', async () => {
    const aiInput: CreateMessageInput = {
      chat_id: chatId,
      sender_id: userId,
      content: 'Based on the context, you might want to schedule a follow-up meeting.',
      message_type: 'ai_suggestion',
      metadata: {
        ai_context: {
          tone: 'professional',
          intent: 'suggestion',
          confidence: 0.87
        }
      }
    };

    const result = await createMessage(aiInput);

    expect(result.message_type).toEqual('ai_suggestion');
    expect(result.metadata?.ai_context?.tone).toEqual('professional');
    expect(result.metadata?.ai_context?.intent).toEqual('suggestion');
    expect(result.metadata?.ai_context?.confidence).toEqual(0.87);
  });

  it('should create file message with metadata', async () => {
    const fileInput: CreateMessageInput = {
      chat_id: chatId,
      sender_id: userId,
      content: 'Document attached',
      message_type: 'file',
      metadata: {
        file_size: 1024000,
        file_name: 'project_proposal.pdf'
      }
    };

    const result = await createMessage(fileInput);

    expect(result.message_type).toEqual('file');
    expect(result.metadata?.file_size).toEqual(1024000);
    expect(result.metadata?.file_name).toEqual('project_proposal.pdf');
  });

  it('should handle message with no metadata', async () => {
    const input = {
      ...basicMessageInput,
      chat_id: chatId,
      sender_id: userId,
      metadata: null
    };

    const result = await createMessage(input);

    expect(result.metadata).toBeNull();
  });

  it('should handle message with no reply_to', async () => {
    const input = {
      ...basicMessageInput,
      chat_id: chatId,
      sender_id: userId,
      reply_to: null
    };

    const result = await createMessage(input);

    expect(result.reply_to).toBeNull();
  });

  it('should create message with non-existent chat_id', async () => {
    // Note: Without explicit foreign key constraints in schema,
    // the database allows insertion with non-existent references
    const invalidInput = {
      ...basicMessageInput,
      chat_id: '00000000-0000-0000-0000-000000000000', // Non-existent chat
      sender_id: userId
    };

    const result = await createMessage(invalidInput);
    expect(result.chat_id).toEqual('00000000-0000-0000-0000-000000000000');
  });

  it('should create message with non-existent sender_id', async () => {
    // Note: Without explicit foreign key constraints in schema,
    // the database allows insertion with non-existent references
    const invalidInput = {
      ...basicMessageInput,
      chat_id: chatId,
      sender_id: '00000000-0000-0000-0000-000000000000' // Non-existent user
    };

    const result = await createMessage(invalidInput);
    expect(result.sender_id).toEqual('00000000-0000-0000-0000-000000000000');
  });

  it('should default encryption to true', async () => {
    const input = {
      ...basicMessageInput,
      chat_id: chatId,
      sender_id: userId
    };

    const result = await createMessage(input);

    expect(result.is_encrypted).toBe(true);
  });

  it('should default edited status to false', async () => {
    const input = {
      ...basicMessageInput,
      chat_id: chatId,
      sender_id: userId
    };

    const result = await createMessage(input);

    expect(result.is_edited).toBe(false);
  });
});