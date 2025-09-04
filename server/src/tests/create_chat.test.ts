import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { chatsTable, usersTable } from '../db/schema';
import { type CreateChatInput } from '../schema';
import { createChat } from '../handlers/create_chat';
import { eq } from 'drizzle-orm';

// Test users for different scenarios
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
    ai_assistance_level: 'proactive' as const,
    voice_enabled: true,
    encryption_enabled: true
  }
};

const testUser3 = {
  email: 'user3@test.com',
  display_name: 'Test User 3',
  preferences: {
    language: 'es',
    timezone: 'EST',
    ai_assistance_level: 'minimal' as const,
    voice_enabled: false,
    encryption_enabled: false
  }
};

describe('createChat', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a direct chat', async () => {
    // Create test users first
    const user1Result = await db.insert(usersTable).values(testUser1).returning().execute();
    const user2Result = await db.insert(usersTable).values(testUser2).returning().execute();
    
    const user1Id = user1Result[0].id;
    const user2Id = user2Result[0].id;

    const testInput: CreateChatInput = {
      name: 'Direct Chat Test',
      type: 'direct',
      participants: [user1Id, user2Id],
      created_by: user1Id
    };

    const result = await createChat(testInput);

    // Verify basic fields
    expect(result.name).toEqual('Direct Chat Test');
    expect(result.type).toEqual('direct');
    expect(result.participants).toEqual([user1Id, user2Id]);
    expect(result.created_by).toEqual(user1Id);
    expect(result.is_encrypted).toBe(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a group chat with multiple participants', async () => {
    // Create test users
    const user1Result = await db.insert(usersTable).values(testUser1).returning().execute();
    const user2Result = await db.insert(usersTable).values(testUser2).returning().execute();
    const user3Result = await db.insert(usersTable).values(testUser3).returning().execute();
    
    const user1Id = user1Result[0].id;
    const user2Id = user2Result[0].id;
    const user3Id = user3Result[0].id;

    const testInput: CreateChatInput = {
      name: 'Team Discussion',
      type: 'group',
      participants: [user1Id, user2Id, user3Id],
      created_by: user1Id
    };

    const result = await createChat(testInput);

    expect(result.name).toEqual('Team Discussion');
    expect(result.type).toEqual('group');
    expect(result.participants).toEqual([user1Id, user2Id, user3Id]);
    expect(result.created_by).toEqual(user1Id);
    expect(result.is_encrypted).toBe(true);
  });

  it('should create an AI assistant chat', async () => {
    // Create test user
    const user1Result = await db.insert(usersTable).values(testUser1).returning().execute();
    const user1Id = user1Result[0].id;

    const testInput: CreateChatInput = {
      name: 'AI Assistant Chat',
      type: 'ai_assistant',
      participants: [user1Id],
      created_by: user1Id
    };

    const result = await createChat(testInput);

    expect(result.name).toEqual('AI Assistant Chat');
    expect(result.type).toEqual('ai_assistant');
    expect(result.participants).toEqual([user1Id]);
    expect(result.is_encrypted).toBe(true);
  });

  it('should save chat to database', async () => {
    // Create test users
    const user1Result = await db.insert(usersTable).values(testUser1).returning().execute();
    const user2Result = await db.insert(usersTable).values(testUser2).returning().execute();
    
    const user1Id = user1Result[0].id;
    const user2Id = user2Result[0].id;

    const testInput: CreateChatInput = {
      name: 'Database Test Chat',
      type: 'direct',
      participants: [user1Id, user2Id],
      created_by: user1Id
    };

    const result = await createChat(testInput);

    // Query database to verify chat was saved
    const chats = await db.select()
      .from(chatsTable)
      .where(eq(chatsTable.id, result.id))
      .execute();

    expect(chats).toHaveLength(1);
    expect(chats[0].name).toEqual('Database Test Chat');
    expect(chats[0].type).toEqual('direct');
    expect(chats[0].participants).toEqual([user1Id, user2Id]);
    expect(chats[0].created_by).toEqual(user1Id);
    expect(chats[0].is_encrypted).toBe(true);
    expect(chats[0].created_at).toBeInstanceOf(Date);
    expect(chats[0].updated_at).toBeInstanceOf(Date);
  });

  it('should throw error when creator does not exist', async () => {
    const testInput: CreateChatInput = {
      name: 'Invalid Creator Chat',
      type: 'direct',
      participants: ['00000000-0000-0000-0000-000000000001'],
      created_by: '00000000-0000-0000-0000-000000000999' // Non-existent user
    };

    await expect(createChat(testInput)).rejects.toThrow(/Creator with ID .* does not exist/i);
  });

  it('should throw error when participant does not exist', async () => {
    // Create valid creator
    const user1Result = await db.insert(usersTable).values(testUser1).returning().execute();
    const user1Id = user1Result[0].id;

    const testInput: CreateChatInput = {
      name: 'Invalid Participant Chat',
      type: 'group',
      participants: [user1Id, '00000000-0000-0000-0000-000000000999'], // One valid, one invalid
      created_by: user1Id
    };

    await expect(createChat(testInput)).rejects.toThrow(/Participant with ID .* does not exist/i);
  });

  it('should handle single participant chat', async () => {
    // Create test user
    const user1Result = await db.insert(usersTable).values(testUser1).returning().execute();
    const user1Id = user1Result[0].id;

    const testInput: CreateChatInput = {
      name: 'Solo Chat',
      type: 'ai_assistant',
      participants: [user1Id],
      created_by: user1Id
    };

    const result = await createChat(testInput);

    expect(result.participants).toEqual([user1Id]);
    expect(result.participants).toHaveLength(1);
  });

  it('should always enable encryption regardless of input', async () => {
    // Create test users
    const user1Result = await db.insert(usersTable).values(testUser1).returning().execute();
    const user2Result = await db.insert(usersTable).values(testUser2).returning().execute();
    
    const user1Id = user1Result[0].id;
    const user2Id = user2Result[0].id;

    const testInput: CreateChatInput = {
      name: 'Encryption Test Chat',
      type: 'direct',
      participants: [user1Id, user2Id],
      created_by: user1Id
    };

    const result = await createChat(testInput);

    // Verify encryption is always enabled
    expect(result.is_encrypted).toBe(true);

    // Verify in database as well
    const chatInDb = await db.select()
      .from(chatsTable)
      .where(eq(chatsTable.id, result.id))
      .execute();

    expect(chatInDb[0].is_encrypted).toBe(true);
  });
});