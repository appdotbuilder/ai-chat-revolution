import { db } from '../db';
import { chatsTable, usersTable } from '../db/schema';
import { type CreateChatInput, type Chat } from '../schema';
import { eq } from 'drizzle-orm';

export const createChat = async (input: CreateChatInput): Promise<Chat> => {
  try {
    // Verify that the creator exists
    const creator = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.created_by))
      .limit(1)
      .execute();

    if (creator.length === 0) {
      throw new Error(`Creator with ID ${input.created_by} does not exist`);
    }

    // Verify that all participants exist
    for (const participantId of input.participants) {
      const participant = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, participantId))
        .limit(1)
        .execute();

      if (participant.length === 0) {
        throw new Error(`Participant with ID ${participantId} does not exist`);
      }
    }

    // Insert chat record
    const result = await db.insert(chatsTable)
      .values({
        name: input.name,
        type: input.type,
        participants: input.participants,
        is_encrypted: true, // Always enable encryption as per requirements
        created_by: input.created_by
      })
      .returning()
      .execute();

    // Cast participants from jsonb to string array for proper typing
    const chat = result[0];
    return {
      ...chat,
      participants: chat.participants as string[]
    };
  } catch (error) {
    console.error('Chat creation failed:', error);
    throw error;
  }
};