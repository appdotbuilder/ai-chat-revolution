import { db } from '../db';
import { usersTable } from '../db/schema';
import { type User } from '../schema';
import { eq } from 'drizzle-orm';

export const getUser = async (userId: string): Promise<User | null> => {
  try {
    // Query user by ID
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    // Return null if user not found
    if (users.length === 0) {
      return null;
    }

    const user = users[0];
    
    // Return the user data - preferences are already in JSON format
    return {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      preferences: user.preferences as any, // JSON field, cast to match schema
      created_at: user.created_at,
      updated_at: user.updated_at
    };
  } catch (error) {
    console.error('User retrieval failed:', error);
    throw error;
  }
};