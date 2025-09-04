import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, chatsTable } from '../db/schema';
import { getUserChats } from '../handlers/get_user_chats';

describe('getUserChats', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return chats where user is a participant', async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'user1@test.com',
          display_name: 'User 1',
          preferences: {
            language: 'en',
            timezone: 'UTC',
            ai_assistance_level: 'moderate',
            voice_enabled: false,
            encryption_enabled: true
          }
        },
        {
          email: 'user2@test.com',
          display_name: 'User 2',
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

    const user1Id = users[0].id;
    const user2Id = users[1].id;

    // Create test chats with different participant combinations
    const chats = await db.insert(chatsTable)
      .values([
        {
          name: 'Chat 1 - User1 included',
          type: 'direct',
          participants: [user1Id, user2Id],
          created_by: user1Id
        },
        {
          name: 'Chat 2 - User1 included',
          type: 'group',
          participants: [user1Id, user2Id],
          created_by: user2Id
        },
        {
          name: 'Chat 3 - User1 not included',
          type: 'direct',
          participants: [user2Id],
          created_by: user2Id
        }
      ])
      .returning()
      .execute();

    // Get chats for user1
    const result = await getUserChats(user1Id);

    // Should return only the chats where user1 is a participant
    expect(result).toHaveLength(2);
    expect(result.some(chat => chat.name === 'Chat 1 - User1 included')).toBe(true);
    expect(result.some(chat => chat.name === 'Chat 2 - User1 included')).toBe(true);
    expect(result.some(chat => chat.name === 'Chat 3 - User1 not included')).toBe(false);

    // Verify structure of returned chats
    result.forEach(chat => {
      expect(chat.id).toBeDefined();
      expect(chat.name).toBeDefined();
      expect(chat.type).toBeDefined();
      expect(Array.isArray(chat.participants)).toBe(true);
      expect(chat.participants).toContain(user1Id);
      expect(chat.created_by).toBeDefined();
      expect(chat.created_at).toBeInstanceOf(Date);
      expect(chat.updated_at).toBeInstanceOf(Date);
      expect(typeof chat.is_encrypted).toBe('boolean');
    });
  });

  it('should return chats ordered by updated_at DESC', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values({
        email: 'test@test.com',
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

    const userId = user[0].id;

    // Create chats at different times (simulate by creating in sequence)
    const chat1 = await db.insert(chatsTable)
      .values({
        name: 'Oldest Chat',
        type: 'direct',
        participants: [userId],
        created_by: userId
      })
      .returning()
      .execute();

    // Wait a moment and create another chat
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const chat2 = await db.insert(chatsTable)
      .values({
        name: 'Newer Chat',
        type: 'group',
        participants: [userId],
        created_by: userId
      })
      .returning()
      .execute();

    const result = await getUserChats(userId);

    // Should be ordered by updated_at DESC (newer first)
    expect(result).toHaveLength(2);
    expect(result[0].updated_at >= result[1].updated_at).toBe(true);
    expect(result[0].name).toBe('Newer Chat');
    expect(result[1].name).toBe('Oldest Chat');
  });

  it('should return empty array when user has no chats', async () => {
    // Create a user
    const user = await db.insert(usersTable)
      .values({
        email: 'lonely@test.com',
        display_name: 'Lonely User',
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

    const result = await getUserChats(user[0].id);

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle AI assistant chats correctly', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values({
        email: 'ai@test.com',
        display_name: 'AI User',
        preferences: {
          language: 'en',
          timezone: 'UTC',
          ai_assistance_level: 'proactive',
          voice_enabled: true,
          encryption_enabled: true
        }
      })
      .returning()
      .execute();

    const userId = user[0].id;

    // Create an AI assistant chat
    await db.insert(chatsTable)
      .values({
        name: 'AI Assistant Chat',
        type: 'ai_assistant',
        participants: [userId],
        created_by: userId,
        is_encrypted: false // AI chats might not be encrypted
      })
      .execute();

    const result = await getUserChats(userId);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ai_assistant');
    expect(result[0].name).toBe('AI Assistant Chat');
    expect(result[0].is_encrypted).toBe(false);
  });

  it('should handle users in multiple group chats', async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'user1@test.com',
          display_name: 'User 1',
          preferences: {
            language: 'en',
            timezone: 'UTC',
            ai_assistance_level: 'moderate',
            voice_enabled: false,
            encryption_enabled: true
          }
        },
        {
          email: 'user2@test.com',
          display_name: 'User 2',
          preferences: {
            language: 'en',
            timezone: 'UTC',
            ai_assistance_level: 'moderate',
            voice_enabled: false,
            encryption_enabled: true
          }
        },
        {
          email: 'user3@test.com',
          display_name: 'User 3',
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

    const [user1Id, user2Id, user3Id] = users.map(u => u.id);

    // Create group chats with different participant combinations
    await db.insert(chatsTable)
      .values([
        {
          name: 'Group 1',
          type: 'group',
          participants: [user1Id, user2Id, user3Id],
          created_by: user1Id
        },
        {
          name: 'Group 2',
          type: 'group',
          participants: [user1Id, user2Id],
          created_by: user2Id
        },
        {
          name: 'Group 3',
          type: 'group',
          participants: [user2Id, user3Id],
          created_by: user3Id
        }
      ])
      .execute();

    // Get chats for user1
    const result = await getUserChats(user1Id);

    expect(result).toHaveLength(2);
    expect(result.some(chat => chat.name === 'Group 1')).toBe(true);
    expect(result.some(chat => chat.name === 'Group 2')).toBe(true);
    expect(result.some(chat => chat.name === 'Group 3')).toBe(false);

    // Verify participants arrays are correctly returned
    result.forEach(chat => {
      expect(Array.isArray(chat.participants)).toBe(true);
      expect(chat.participants).toContain(user1Id);
    });
  });

  it('should return empty array for non-existent user', async () => {
    const nonExistentUserId = '00000000-0000-0000-0000-000000000000';
    
    const result = await getUserChats(nonExistentUserId);

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });
});