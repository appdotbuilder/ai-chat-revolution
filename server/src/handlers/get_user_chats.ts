import { db } from '../db';
import { chatsTable } from '../db/schema';
import { type Chat } from '../schema';
import { sql } from 'drizzle-orm';

export const getUserChats = async (userId: string): Promise<Chat[]> => {
  try {
    // Query chats where the user is included in the participants array
    // Using PostgreSQL's jsonb contains operator to check if userId is in participants array
    const results = await db.select()
      .from(chatsTable)
      .where(sql`${chatsTable.participants} @> ${JSON.stringify([userId])}`)
      .orderBy(sql`${chatsTable.updated_at} DESC`)
      .execute();

    // Transform the results to match the Chat schema
    return results.map(chat => ({
      ...chat,
      participants: chat.participants as string[], // Cast jsonb to string array
      created_at: chat.created_at,
      updated_at: chat.updated_at
    }));
  } catch (error) {
    console.error('Failed to get user chats:', error);
    throw error;
  }
};