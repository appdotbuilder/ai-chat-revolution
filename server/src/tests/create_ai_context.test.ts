import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { aiContextTable, usersTable, chatsTable } from '../db/schema';
import { type CreateAIContextInput } from '../schema';
import { createAIContext } from '../handlers/create_ai_context';
import { eq } from 'drizzle-orm';

// Test user data for foreign key requirements
const testUser = {
  email: 'testuser@example.com',
  display_name: 'Test User',
  preferences: {
    language: 'en',
    timezone: 'UTC',
    ai_assistance_level: 'moderate' as const,
    voice_enabled: false,
    encryption_enabled: true
  }
};

// Test chat data for foreign key requirements  
const testChat = {
  name: 'Test Chat',
  type: 'group' as const,
  participants: ['user1', 'user2'],
  created_by: ''
};

// Simple test input
const testInput: CreateAIContextInput = {
  user_id: '',
  chat_id: null,
  context_type: 'conversation_summary',
  content: 'This is a test conversation summary for AI context',
  embedding_vector: [0.1, 0.2, 0.3, 0.4, 0.5],
  relevance_score: 0.85,
  expires_at: new Date('2024-12-31T23:59:59Z')
};

describe('createAIContext', () => {
  let userId: string;
  let chatId: string;

  beforeEach(async () => {
    await createDB();
    
    // Create prerequisite user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    userId = userResult[0].id;
    
    // Create prerequisite chat
    const chatResult = await db.insert(chatsTable)
      .values({
        ...testChat,
        created_by: userId
      })
      .returning()
      .execute();
    chatId = chatResult[0].id;
    
    // Update test input with actual IDs
    testInput.user_id = userId;
  });

  afterEach(resetDB);

  it('should create AI context with all fields', async () => {
    testInput.chat_id = chatId;
    
    const result = await createAIContext(testInput);

    // Basic field validation
    expect(result.user_id).toEqual(userId);
    expect(result.chat_id).toEqual(chatId);
    expect(result.context_type).toEqual('conversation_summary');
    expect(result.content).toEqual('This is a test conversation summary for AI context');
    expect(result.embedding_vector).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(result.relevance_score).toEqual(0.85);
    expect(typeof result.relevance_score).toEqual('number');
    expect(result.expires_at).toBeInstanceOf(Date);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should create AI context without optional fields', async () => {
    const minimalInput: CreateAIContextInput = {
      user_id: userId,
      context_type: 'user_preference',
      content: 'User prefers casual tone in conversations',
      relevance_score: 0.9
    };

    const result = await createAIContext(minimalInput);

    // Basic field validation
    expect(result.user_id).toEqual(userId);
    expect(result.chat_id).toBeNull();
    expect(result.context_type).toEqual('user_preference');
    expect(result.content).toEqual('User prefers casual tone in conversations');
    expect(result.embedding_vector).toBeNull();
    expect(result.relevance_score).toEqual(0.9);
    expect(result.expires_at).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save AI context to database', async () => {
    const result = await createAIContext(testInput);

    // Query database to verify record was created
    const aiContexts = await db.select()
      .from(aiContextTable)
      .where(eq(aiContextTable.id, result.id))
      .execute();

    expect(aiContexts).toHaveLength(1);
    expect(aiContexts[0].user_id).toEqual(userId);
    expect(aiContexts[0].context_type).toEqual('conversation_summary');
    expect(aiContexts[0].content).toEqual('This is a test conversation summary for AI context');
    expect(aiContexts[0].embedding_vector).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(parseFloat(aiContexts[0].relevance_score.toString())).toEqual(0.85);
    expect(aiContexts[0].expires_at).toBeInstanceOf(Date);
    expect(aiContexts[0].created_at).toBeInstanceOf(Date);
  });

  it('should handle different context types', async () => {
    const contextTypes = ['conversation_summary', 'user_preference', 'meeting_context', 'translation_cache'] as const;
    
    for (const contextType of contextTypes) {
      const input: CreateAIContextInput = {
        user_id: userId,
        context_type: contextType,
        content: `Test content for ${contextType}`,
        relevance_score: 0.75
      };

      const result = await createAIContext(input);

      expect(result.context_type).toEqual(contextType);
      expect(result.content).toEqual(`Test content for ${contextType}`);
    }
  });

  it('should handle null embedding vector', async () => {
    const inputWithNullVector: CreateAIContextInput = {
      user_id: userId,
      context_type: 'meeting_context',
      content: 'Meeting notes without embeddings',
      embedding_vector: null,
      relevance_score: 0.6
    };

    const result = await createAIContext(inputWithNullVector);

    expect(result.embedding_vector).toBeNull();
    expect(result.content).toEqual('Meeting notes without embeddings');
  });

  it('should handle future expiration dates', async () => {
    const futureDate = new Date('2025-06-15T12:00:00Z');
    const inputWithExpiration: CreateAIContextInput = {
      user_id: userId,
      context_type: 'translation_cache',
      content: 'Cached translation that expires',
      expires_at: futureDate,
      relevance_score: 0.8
    };

    const result = await createAIContext(inputWithExpiration);

    expect(result.expires_at).toBeInstanceOf(Date);
    expect(result.expires_at?.getTime()).toEqual(futureDate.getTime());
  });

  it('should create AI context with different relevance scores', async () => {
    const scoreInput: CreateAIContextInput = {
      user_id: userId,
      context_type: 'conversation_summary',
      content: 'Context with custom relevance score',
      relevance_score: 0.42
    };

    const result = await createAIContext(scoreInput);

    expect(result.relevance_score).toEqual(0.42);
    expect(typeof result.relevance_score).toEqual('number');
  });

  it('should handle large embedding vectors', async () => {
    const largeVector = Array.from({ length: 1536 }, (_, i) => Math.random());
    const inputWithLargeVector: CreateAIContextInput = {
      user_id: userId,
      context_type: 'conversation_summary',
      content: 'Content with large embedding vector',
      embedding_vector: largeVector,
      relevance_score: 0.95
    };

    const result = await createAIContext(inputWithLargeVector);

    expect(result.embedding_vector).toHaveLength(1536);
    expect(Array.isArray(result.embedding_vector)).toBe(true);
  });
});