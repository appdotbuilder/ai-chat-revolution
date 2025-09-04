import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type User } from '../schema';

export const createUser = async (input: CreateUserInput): Promise<User> => {
  try {
    // Set default preferences if not provided - timezone is required but has no default in schema
    const defaultPreferences = {
      language: 'en',
      timezone: 'UTC',
      ai_assistance_level: 'moderate' as const,
      voice_enabled: false,
      encryption_enabled: true
    };

    const preferences = input.preferences 
      ? { ...defaultPreferences, ...input.preferences }
      : defaultPreferences;

    // Insert user record
    const result = await db.insert(usersTable)
      .values({
        email: input.email,
        display_name: input.display_name,
        avatar_url: input.avatar_url || null,
        preferences: preferences
      })
      .returning()
      .execute();

    const user = result[0];
    return {
      ...user,
      preferences: user.preferences as {
        language: string;
        timezone: string;
        ai_assistance_level: 'minimal' | 'moderate' | 'proactive';
        voice_enabled: boolean;
        encryption_enabled: boolean;
      }
    };
  } catch (error) {
    console.error('User creation failed:', error);
    throw error;
  }
};