import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput } from '../schema';
import { updateUser } from '../handlers/update_user';
import { eq } from 'drizzle-orm';

// Test user data
const testUser = {
  email: 'test@example.com',
  display_name: 'Test User',
  avatar_url: 'https://example.com/avatar.jpg',
  preferences: {
    language: 'en',
    timezone: 'UTC',
    ai_assistance_level: 'moderate' as const,
    voice_enabled: false,
    encryption_enabled: true
  }
};

describe('updateUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should update user display name', async () => {
    // Create a user first
    const createdUser = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const userId = createdUser[0].id;

    // Update the display name
    const updateInput: UpdateUserInput = {
      id: userId,
      display_name: 'Updated User Name'
    };

    const result = await updateUser(updateInput);

    // Verify the update
    expect(result.display_name).toEqual('Updated User Name');
    expect(result.email).toEqual(testUser.email);
    expect(result.avatar_url).toEqual(testUser.avatar_url);
    expect(result.id).toEqual(userId);
    expect(result.updated_at).toBeInstanceOf(Date);
    
    // Verify preferences are preserved
    expect(result.preferences.language).toEqual('en');
    expect(result.preferences.timezone).toEqual('UTC');
    expect(result.preferences.ai_assistance_level).toEqual('moderate');
  });

  it('should update user avatar URL', async () => {
    // Create a user first
    const createdUser = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const userId = createdUser[0].id;

    // Update the avatar URL
    const updateInput: UpdateUserInput = {
      id: userId,
      avatar_url: 'https://example.com/new-avatar.jpg'
    };

    const result = await updateUser(updateInput);

    // Verify the update
    expect(result.avatar_url).toEqual('https://example.com/new-avatar.jpg');
    expect(result.display_name).toEqual(testUser.display_name);
    expect(result.email).toEqual(testUser.email);
  });

  it('should set avatar URL to null', async () => {
    // Create a user first
    const createdUser = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const userId = createdUser[0].id;

    // Set avatar URL to null
    const updateInput: UpdateUserInput = {
      id: userId,
      avatar_url: null
    };

    const result = await updateUser(updateInput);

    // Verify the update
    expect(result.avatar_url).toBeNull();
    expect(result.display_name).toEqual(testUser.display_name);
  });

  it('should update user preferences partially', async () => {
    // Create a user first
    const createdUser = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const userId = createdUser[0].id;

    // Update only some preferences
    const updateInput: UpdateUserInput = {
      id: userId,
      preferences: {
        language: 'es',
        ai_assistance_level: 'proactive'
      }
    };

    const result = await updateUser(updateInput);

    // Verify the partial update
    expect(result.preferences.language).toEqual('es');
    expect(result.preferences.ai_assistance_level).toEqual('proactive');
    
    // Verify unchanged preferences are preserved
    expect(result.preferences.timezone).toEqual('UTC');
    expect(result.preferences.voice_enabled).toEqual(false);
    expect(result.preferences.encryption_enabled).toEqual(true);
  });

  it('should update multiple fields simultaneously', async () => {
    // Create a user first
    const createdUser = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const userId = createdUser[0].id;

    // Update multiple fields
    const updateInput: UpdateUserInput = {
      id: userId,
      display_name: 'Multi-Update User',
      avatar_url: 'https://example.com/multi-avatar.jpg',
      preferences: {
        timezone: 'America/New_York',
        voice_enabled: true
      }
    };

    const result = await updateUser(updateInput);

    // Verify all updates
    expect(result.display_name).toEqual('Multi-Update User');
    expect(result.avatar_url).toEqual('https://example.com/multi-avatar.jpg');
    expect(result.preferences.timezone).toEqual('America/New_York');
    expect(result.preferences.voice_enabled).toEqual(true);
    
    // Verify unchanged fields are preserved
    expect(result.email).toEqual(testUser.email);
    expect(result.preferences.language).toEqual('en');
    expect(result.preferences.ai_assistance_level).toEqual('moderate');
    expect(result.preferences.encryption_enabled).toEqual(true);
  });

  it('should preserve data in database after update', async () => {
    // Create a user first
    const createdUser = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const userId = createdUser[0].id;

    // Update the user
    const updateInput: UpdateUserInput = {
      id: userId,
      display_name: 'Database Preserved User',
      preferences: {
        language: 'fr'
      }
    };

    await updateUser(updateInput);

    // Query directly from database to verify persistence
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    expect(users).toHaveLength(1);
    const dbUser = users[0];
    const preferences = dbUser.preferences as any;
    expect(dbUser.display_name).toEqual('Database Preserved User');
    expect(preferences.language).toEqual('fr');
    expect(preferences.timezone).toEqual('UTC'); // Preserved
    expect(dbUser.updated_at).toBeInstanceOf(Date);
  });

  it('should update updated_at timestamp', async () => {
    // Create a user first
    const createdUser = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const userId = createdUser[0].id;
    const originalUpdatedAt = createdUser[0].updated_at;

    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    // Update the user
    const updateInput: UpdateUserInput = {
      id: userId,
      display_name: 'Timestamp Test User'
    };

    const result = await updateUser(updateInput);

    // Verify updated_at has changed
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
  });

  it('should throw error for non-existent user', async () => {
    const updateInput: UpdateUserInput = {
      id: '00000000-0000-0000-0000-000000000000', // Non-existent UUID
      display_name: 'Non-existent User'
    };

    await expect(updateUser(updateInput)).rejects.toThrow(/user not found/i);
  });

  it('should handle empty preferences object', async () => {
    // Create a user first
    const createdUser = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const userId = createdUser[0].id;

    // Update with empty preferences
    const updateInput: UpdateUserInput = {
      id: userId,
      preferences: {}
    };

    const result = await updateUser(updateInput);

    // Verify all preferences are preserved
    expect(result.preferences.language).toEqual('en');
    expect(result.preferences.timezone).toEqual('UTC');
    expect(result.preferences.ai_assistance_level).toEqual('moderate');
    expect(result.preferences.voice_enabled).toEqual(false);
    expect(result.preferences.encryption_enabled).toEqual(true);
  });

  it('should handle only ID in update input', async () => {
    // Create a user first
    const createdUser = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const userId = createdUser[0].id;

    // Update with only ID (no changes)
    const updateInput: UpdateUserInput = {
      id: userId
    };

    const result = await updateUser(updateInput);

    // Verify all data is preserved
    expect(result.display_name).toEqual(testUser.display_name);
    expect(result.email).toEqual(testUser.email);
    expect(result.avatar_url).toEqual(testUser.avatar_url);
    expect(result.preferences).toEqual(testUser.preferences);
    expect(result.updated_at).toBeInstanceOf(Date);
  });
});