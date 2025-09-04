import { db } from '../db';
import { usersTable } from '../db/schema';
import { type UpdateUserInput, type User } from '../schema';
import { eq } from 'drizzle-orm';

export const updateUser = async (input: UpdateUserInput): Promise<User> => {
  try {
    // Get the current user to preserve existing data
    const currentUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.id))
      .execute();

    if (!currentUser.length) {
      throw new Error('User not found');
    }

    const user = currentUser[0];

    // Merge preferences if provided, preserving existing values
    const currentPreferences = user.preferences as {
      language: string;
      timezone: string;
      ai_assistance_level: 'minimal' | 'moderate' | 'proactive';
      voice_enabled: boolean;
      encryption_enabled: boolean;
    };
    
    const updatedPreferences = input.preferences 
      ? { ...currentPreferences, ...input.preferences }
      : currentPreferences;

    // Update the user record
    const result = await db.update(usersTable)
      .set({
        display_name: input.display_name ?? user.display_name,
        avatar_url: input.avatar_url !== undefined ? input.avatar_url : user.avatar_url,
        preferences: updatedPreferences,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, input.id))
      .returning()
      .execute();

    if (!result.length) {
      throw new Error('Failed to update user');
    }

    const updatedUser = result[0];
    return {
      ...updatedUser,
      preferences: updatedUser.preferences as {
        language: string;
        timezone: string;
        ai_assistance_level: 'minimal' | 'moderate' | 'proactive';
        voice_enabled: boolean;
        encryption_enabled: boolean;
      }
    };
  } catch (error) {
    console.error('User update failed:', error);
    throw error;
  }
};