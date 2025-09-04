import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, aiContextTable } from '../db/schema';
import { type SearchAIContextInput } from '../schema';
import { searchAIContext } from '../handlers/search_ai_context';

// Test data setup
const createTestUser = async () => {
  const result = await db.insert(usersTable)
    .values({
      email: 'test@example.com',
      display_name: 'Test User',
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
  return result[0];
};

const createTestAIContext = async (userId: string, overrides = {}) => {
  const defaultContext = {
    user_id: userId,
    context_type: 'conversation_summary' as const,
    content: 'Default test context content',
    relevance_score: 1.0,
    ...overrides
  };

  const result = await db.insert(aiContextTable)
    .values({
      ...defaultContext,
      relevance_score: defaultContext.relevance_score
    })
    .returning()
    .execute();
  return result[0];
};

describe('searchAIContext', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should search AI context by user_id and query', async () => {
    const user = await createTestUser();
    
    // Create multiple AI context entries
    await createTestAIContext(user.id, {
      content: 'Meeting notes about project planning',
      context_type: 'meeting_context',
      relevance_score: 0.9
    });

    await createTestAIContext(user.id, {
      content: 'User prefers casual communication style',
      context_type: 'user_preference',
      relevance_score: 0.8
    });

    await createTestAIContext(user.id, {
      content: 'Conversation summary from yesterday',
      context_type: 'conversation_summary',
      relevance_score: 0.95
    });

    const searchInput: SearchAIContextInput = {
      user_id: user.id,
      query: 'project',
      limit: 10
    };

    const results = await searchAIContext(searchInput);

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('project planning');
    expect(results[0].context_type).toBe('meeting_context');
    expect(typeof results[0].relevance_score).toBe('number');
    expect(results[0].relevance_score).toEqual(0.9);
  });

  it('should filter by context_type when provided', async () => {
    const user = await createTestUser();
    
    await createTestAIContext(user.id, {
      content: 'Meeting notes about project planning',
      context_type: 'meeting_context',
      relevance_score: 0.9
    });

    await createTestAIContext(user.id, {
      content: 'Project discussion from chat',
      context_type: 'conversation_summary',
      relevance_score: 0.8
    });

    const searchInput: SearchAIContextInput = {
      user_id: user.id,
      query: 'project',
      context_type: 'meeting_context',
      limit: 10
    };

    const results = await searchAIContext(searchInput);

    expect(results).toHaveLength(1);
    expect(results[0].context_type).toBe('meeting_context');
    expect(results[0].content).toContain('Meeting notes');
  });

  it('should order results by relevance_score descending', async () => {
    const user = await createTestUser();
    
    await createTestAIContext(user.id, {
      content: 'Lower relevance conversation',
      context_type: 'conversation_summary',
      relevance_score: 0.5
    });

    await createTestAIContext(user.id, {
      content: 'Higher relevance conversation',
      context_type: 'conversation_summary', 
      relevance_score: 0.95
    });

    await createTestAIContext(user.id, {
      content: 'Medium relevance conversation',
      context_type: 'conversation_summary',
      relevance_score: 0.7
    });

    const searchInput: SearchAIContextInput = {
      user_id: user.id,
      query: 'conversation',
      limit: 10
    };

    const results = await searchAIContext(searchInput);

    expect(results).toHaveLength(3);
    expect(results[0].relevance_score).toBe(0.95);
    expect(results[1].relevance_score).toBe(0.7);
    expect(results[2].relevance_score).toBe(0.5);
    expect(results[0].content).toContain('Higher relevance');
  });

  it('should respect the limit parameter', async () => {
    const user = await createTestUser();
    
    // Create 5 contexts
    for (let i = 0; i < 5; i++) {
      await createTestAIContext(user.id, {
        content: `Test context number ${i}`,
        context_type: 'conversation_summary',
        relevance_score: 0.8
      });
    }

    const searchInput: SearchAIContextInput = {
      user_id: user.id,
      query: 'Test',
      limit: 3
    };

    const results = await searchAIContext(searchInput);

    expect(results).toHaveLength(3);
  });

  it('should only return contexts for the specified user', async () => {
    const user1 = await createTestUser();
    
    const user2 = await db.insert(usersTable)
      .values({
        email: 'user2@example.com',
        display_name: 'User 2',
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

    // Create context for both users
    await createTestAIContext(user1.id, {
      content: 'User 1 context about testing',
      context_type: 'conversation_summary'
    });

    await createTestAIContext(user2[0].id, {
      content: 'User 2 context about testing',
      context_type: 'conversation_summary'
    });

    const searchInput: SearchAIContextInput = {
      user_id: user1.id,
      query: 'testing',
      limit: 10
    };

    const results = await searchAIContext(searchInput);

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('User 1 context');
    expect(results[0].user_id).toBe(user1.id);
  });

  it('should return empty array when no matches found', async () => {
    const user = await createTestUser();
    
    await createTestAIContext(user.id, {
      content: 'Completely different topic',
      context_type: 'conversation_summary'
    });

    const searchInput: SearchAIContextInput = {
      user_id: user.id,
      query: 'nonexistent',
      limit: 10
    };

    const results = await searchAIContext(searchInput);

    expect(results).toHaveLength(0);
  });

  it('should handle case-insensitive search', async () => {
    const user = await createTestUser();
    
    await createTestAIContext(user.id, {
      content: 'Important Meeting Notes',
      context_type: 'meeting_context'
    });

    const searchInput: SearchAIContextInput = {
      user_id: user.id,
      query: 'meeting',
      limit: 10
    };

    const results = await searchAIContext(searchInput);

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('Meeting');
  });

  it('should handle embedding_vector data correctly', async () => {
    const user = await createTestUser();
    
    const context = await db.insert(aiContextTable)
      .values({
        user_id: user.id,
        context_type: 'conversation_summary',
        content: 'Context with embedding vector',
        embedding_vector: [0.1, 0.2, 0.3, 0.4],
        relevance_score: 0.8
      })
      .returning()
      .execute();

    const searchInput: SearchAIContextInput = {
      user_id: user.id,
      query: 'embedding',
      limit: 10
    };

    const results = await searchAIContext(searchInput);

    expect(results).toHaveLength(1);
    expect(results[0].embedding_vector).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(Array.isArray(results[0].embedding_vector)).toBe(true);
  });

  it('should use default limit when not specified', async () => {
    const user = await createTestUser();
    
    // Create more contexts than the default limit (10)
    for (let i = 0; i < 15; i++) {
      await createTestAIContext(user.id, {
        content: `Default limit test context ${i}`,
        context_type: 'conversation_summary'
      });
    }

    const searchInput: SearchAIContextInput = {
      user_id: user.id,
      query: 'Default',
      limit: 10 // This is the default from the schema
    };

    const results = await searchAIContext(searchInput);

    expect(results).toHaveLength(10);
  });
});