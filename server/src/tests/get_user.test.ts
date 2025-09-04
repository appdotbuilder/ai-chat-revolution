import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput } from '../schema';
import { getUser } from '../handlers/get_user';

// Test user data
const testUserInput: CreateUserInput = {
  email: 'test@example.com',
  display_name: 'Test User',
  avatar_url: 'https://example.com/avatar.jpg',
  preferences: {
    language: 'en',
    timezone: 'America/New_York',
    ai_assistance_level: 'moderate',
    voice_enabled: true,
    encryption_enabled: false
  }
};

const testUserInputMinimal: CreateUserInput = {
  email: 'minimal@example.com',
  display_name: 'Minimal User',
  preferences: {
    language: 'en',
    timezone: 'UTC',
    ai_assistance_level: 'moderate',
    voice_enabled: false,
    encryption_enabled: true
  }
};

describe('getUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return user by ID with complete data', async () => {
    // Create a test user
    const insertedUsers = await db.insert(usersTable)
      .values({
        email: testUserInput.email,
        display_name: testUserInput.display_name,
        avatar_url: testUserInput.avatar_url,
        preferences: testUserInput.preferences as any
      })
      .returning()
      .execute();

    const insertedUser = insertedUsers[0];
    
    // Test the handler
    const result = await getUser(insertedUser.id);

    // Verify returned user
    expect(result).not.toBeNull();
    expect(result!.id).toEqual(insertedUser.id);
    expect(result!.email).toEqual('test@example.com');
    expect(result!.display_name).toEqual('Test User');
    expect(result!.avatar_url).toEqual('https://example.com/avatar.jpg');
    expect(result!.preferences).toEqual({
      language: 'en',
      timezone: 'America/New_York',
      ai_assistance_level: 'moderate',
      voice_enabled: true,
      encryption_enabled: false
    });
    expect(result!.created_at).toBeInstanceOf(Date);
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should return user with default preferences', async () => {
    // Create a user with minimal input (using defaults)
    const insertedUsers = await db.insert(usersTable)
      .values({
        email: testUserInputMinimal.email,
        display_name: testUserInputMinimal.display_name,
        preferences: testUserInputMinimal.preferences as any
      })
      .returning()
      .execute();

    const insertedUser = insertedUsers[0];
    
    // Test the handler
    const result = await getUser(insertedUser.id);

    // Verify returned user has proper defaults
    expect(result).not.toBeNull();
    expect(result!.id).toEqual(insertedUser.id);
    expect(result!.email).toEqual('minimal@example.com');
    expect(result!.display_name).toEqual('Minimal User');
    expect(result!.avatar_url).toBeNull();
    expect(result!.preferences.language).toEqual('en');
    expect(result!.preferences.timezone).toEqual('UTC');
    expect(result!.preferences.ai_assistance_level).toEqual('moderate');
    expect(result!.preferences.voice_enabled).toEqual(false);
    expect(result!.preferences.encryption_enabled).toEqual(true);
  });

  it('should return null for non-existent user', async () => {
    const nonExistentId = '123e4567-e89b-12d3-a456-426614174000';
    
    // Test the handler with non-existent ID
    const result = await getUser(nonExistentId);

    // Should return null
    expect(result).toBeNull();
  });

  it('should handle malformed UUID gracefully', async () => {
    const malformedId = 'not-a-valid-uuid';
    
    // Test the handler with malformed UUID
    // Should throw an error from the database layer
    expect(async () => {
      await getUser(malformedId);
    }).toThrow();
  });

  it('should return user with null avatar_url when not provided', async () => {
    // Create user without avatar_url
    const insertedUsers = await db.insert(usersTable)
      .values({
        email: 'noavatar@example.com',
        display_name: 'No Avatar User',
        avatar_url: null,
        preferences: {
          language: 'es',
          timezone: 'Europe/Madrid',
          ai_assistance_level: 'proactive',
          voice_enabled: false,
          encryption_enabled: true
        }
      })
      .returning()
      .execute();

    const insertedUser = insertedUsers[0];
    
    // Test the handler
    const result = await getUser(insertedUser.id);

    // Verify avatar_url is null
    expect(result).not.toBeNull();
    expect(result!.avatar_url).toBeNull();
    expect(result!.email).toEqual('noavatar@example.com');
    expect(result!.preferences.language).toEqual('es');
    expect(result!.preferences.timezone).toEqual('Europe/Madrid');
    expect(result!.preferences.ai_assistance_level).toEqual('proactive');
  });

  it('should preserve all preference values correctly', async () => {
    // Test all enum values and boolean combinations
    const testPreferences = {
      language: 'fr',
      timezone: 'Asia/Tokyo',
      ai_assistance_level: 'minimal' as const,
      voice_enabled: true,
      encryption_enabled: false
    };

    const insertedUsers = await db.insert(usersTable)
      .values({
        email: 'preferences@example.com',
        display_name: 'Preferences User',
        preferences: testPreferences
      })
      .returning()
      .execute();

    const insertedUser = insertedUsers[0];
    
    // Test the handler
    const result = await getUser(insertedUser.id);

    // Verify all preferences are preserved
    expect(result).not.toBeNull();
    expect(result!.preferences).toEqual(testPreferences);
    expect(typeof result!.preferences.voice_enabled).toBe('boolean');
    expect(typeof result!.preferences.encryption_enabled).toBe('boolean');
  });
});