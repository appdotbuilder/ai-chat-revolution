import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { createUserInputSchema } from '../schema';
import { createUser } from '../handlers/create_user';
import { eq } from 'drizzle-orm';

describe('createUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a user with basic preferences', async () => {
    // Raw input that gets parsed by Zod
    const rawInput = {
      email: 'test@example.com',
      display_name: 'Test User',
      preferences: {
        timezone: 'America/New_York'
      }
    };

    // Parse input to apply Zod defaults
    const input = createUserInputSchema.parse(rawInput);
    const result = await createUser(input);

    // Basic field validation
    expect(result.email).toEqual('test@example.com');
    expect(result.display_name).toEqual('Test User');
    expect(result.avatar_url).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);

    // Preferences validation - should merge with defaults
    expect(result.preferences.language).toEqual('en'); // default
    expect(result.preferences.timezone).toEqual('America/New_York'); // provided
    expect(result.preferences.ai_assistance_level).toEqual('moderate'); // default
    expect(result.preferences.voice_enabled).toEqual(false); // default
    expect(result.preferences.encryption_enabled).toEqual(true); // default
  });

  it('should create a user with full preferences', async () => {
    const rawInput = {
      email: 'full@example.com',
      display_name: 'Full Test User',
      avatar_url: 'https://example.com/avatar.jpg',
      preferences: {
        language: 'es',
        timezone: 'Europe/Madrid',
        ai_assistance_level: 'proactive',
        voice_enabled: true,
        encryption_enabled: false
      }
    };

    const input = createUserInputSchema.parse(rawInput);
    const result = await createUser(input);

    // Basic field validation
    expect(result.email).toEqual('full@example.com');
    expect(result.display_name).toEqual('Full Test User');
    expect(result.avatar_url).toEqual('https://example.com/avatar.jpg');
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);

    // All preferences should match input
    expect(result.preferences.language).toEqual('es');
    expect(result.preferences.timezone).toEqual('Europe/Madrid');
    expect(result.preferences.ai_assistance_level).toEqual('proactive');
    expect(result.preferences.voice_enabled).toEqual(true);
    expect(result.preferences.encryption_enabled).toEqual(false);
  });

  it('should create a user with minimal input using defaults', async () => {
    const rawInput = {
      email: 'minimal@example.com',
      display_name: 'Minimal User'
      // No preferences provided
    };

    const input = createUserInputSchema.parse(rawInput);
    const result = await createUser(input);

    // Basic field validation
    expect(result.email).toEqual('minimal@example.com');
    expect(result.display_name).toEqual('Minimal User');
    expect(result.avatar_url).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);

    // All preferences should use defaults when no preferences provided
    expect(result.preferences.language).toEqual('en');
    expect(result.preferences.timezone).toEqual('UTC');
    expect(result.preferences.ai_assistance_level).toEqual('moderate');
    expect(result.preferences.voice_enabled).toEqual(false);
    expect(result.preferences.encryption_enabled).toEqual(true);
  });

  it('should save user to database correctly', async () => {
    const rawInput = {
      email: 'test@example.com',
      display_name: 'Test User',
      preferences: {
        timezone: 'America/New_York'
      }
    };

    const input = createUserInputSchema.parse(rawInput);
    const result = await createUser(input);

    // Query the database to verify the user was saved
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users).toHaveLength(1);
    const savedUser = users[0];

    expect(savedUser.email).toEqual('test@example.com');
    expect(savedUser.display_name).toEqual('Test User');
    expect(savedUser.avatar_url).toBeNull();
    expect((savedUser.preferences as any).timezone).toEqual('America/New_York');
    expect((savedUser.preferences as any).language).toEqual('en');
    expect(savedUser.created_at).toBeInstanceOf(Date);
    expect(savedUser.updated_at).toBeInstanceOf(Date);
  });

  it('should handle null avatar_url correctly', async () => {
    const rawInput = {
      email: 'null-avatar@example.com',
      display_name: 'Null Avatar User',
      avatar_url: null,
      preferences: {
        timezone: 'UTC'
      }
    };

    const input = createUserInputSchema.parse(rawInput);
    const result = await createUser(input);

    expect(result.avatar_url).toBeNull();

    // Verify in database
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users[0].avatar_url).toBeNull();
  });

  it('should handle partial preferences with defaults', async () => {
    const rawInput = {
      email: 'partial@example.com',
      display_name: 'Partial Prefs User',
      preferences: {
        language: 'fr',
        timezone: 'Europe/Paris',
        voice_enabled: true
        // ai_assistance_level and encryption_enabled should get defaults from Zod
      }
    };

    const input = createUserInputSchema.parse(rawInput);
    const result = await createUser(input);

    expect(result.preferences.language).toEqual('fr'); // provided
    expect(result.preferences.timezone).toEqual('Europe/Paris'); // provided
    expect(result.preferences.voice_enabled).toEqual(true); // provided
    expect(result.preferences.ai_assistance_level).toEqual('moderate'); // default from Zod
    expect(result.preferences.encryption_enabled).toEqual(true); // default from Zod
  });

  it('should fail with duplicate email', async () => {
    const rawInput = {
      email: 'test@example.com',
      display_name: 'Test User',
      preferences: {
        timezone: 'America/New_York'
      }
    };

    const input = createUserInputSchema.parse(rawInput);
    
    // Create first user
    await createUser(input);

    // Try to create another user with same email
    const duplicateRawInput = {
      email: 'test@example.com', // same email
      display_name: 'Duplicate User',
      preferences: {
        timezone: 'UTC'
      }
    };

    const duplicateInput = createUserInputSchema.parse(duplicateRawInput);
    await expect(createUser(duplicateInput)).rejects.toThrow(/unique constraint/i);
  });

  it('should generate unique IDs for multiple users', async () => {
    const user1RawInput = {
      email: 'user1@example.com',
      display_name: 'User 1',
      preferences: { timezone: 'UTC' }
    };

    const user2RawInput = {
      email: 'user2@example.com',
      display_name: 'User 2',
      preferences: { timezone: 'UTC' }
    };

    const user1 = await createUser(createUserInputSchema.parse(user1RawInput));
    const user2 = await createUser(createUserInputSchema.parse(user2RawInput));

    expect(user1.id).toBeDefined();
    expect(user2.id).toBeDefined();
    expect(user1.id).not.toEqual(user2.id);

    // Verify both are in database
    const allUsers = await db.select().from(usersTable).execute();
    expect(allUsers).toHaveLength(2);
  });

  it('should handle preferences with only timezone required field', async () => {
    const rawInput = {
      email: 'timezone-only@example.com',
      display_name: 'Timezone Only User',
      preferences: {
        timezone: 'Asia/Tokyo'
      }
    };

    const input = createUserInputSchema.parse(rawInput);
    const result = await createUser(input);

    // Should get defaults for other fields from Zod parsing
    expect(result.preferences.timezone).toEqual('Asia/Tokyo');
    expect(result.preferences.language).toEqual('en');
    expect(result.preferences.ai_assistance_level).toEqual('moderate');
    expect(result.preferences.voice_enabled).toEqual(false);
    expect(result.preferences.encryption_enabled).toEqual(true);
  });
});