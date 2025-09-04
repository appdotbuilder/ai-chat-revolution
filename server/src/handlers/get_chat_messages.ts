import { db } from '../db';
import { messagesTable } from '../db/schema';
import { type GetChatMessagesInput, type Message } from '../schema';
import { eq, desc, lt, and } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

export const getChatMessages = async (input: GetChatMessagesInput): Promise<Message[]> => {
  try {
    // Build conditions array
    const conditions: SQL<unknown>[] = [];
    
    // Always filter by chat_id
    conditions.push(eq(messagesTable.chat_id, input.chat_id));
    
    // Apply optional date filter
    if (input.before) {
      conditions.push(lt(messagesTable.created_at, input.before));
    }

    // Build the query with all clauses at once
    const results = await db.select()
      .from(messagesTable)
      .where(and(...conditions))
      .orderBy(desc(messagesTable.created_at))
      .limit(input.limit)
      .offset(input.offset)
      .execute();

    // Transform results to match the Message schema type
    return results.map(message => ({
      id: message.id,
      chat_id: message.chat_id,
      sender_id: message.sender_id,
      content: message.content,
      message_type: message.message_type,
      metadata: message.metadata as Message['metadata'], // Type assertion for metadata
      reply_to: message.reply_to,
      is_edited: message.is_edited,
      is_encrypted: message.is_encrypted,
      created_at: message.created_at,
      updated_at: message.updated_at
    }));
  } catch (error) {
    console.error('Failed to retrieve chat messages:', error);
    throw error;
  }
};