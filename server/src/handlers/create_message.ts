import { db } from '../db';
import { messagesTable } from '../db/schema';
import { type CreateMessageInput, type Message } from '../schema';

export const createMessage = async (input: CreateMessageInput): Promise<Message> => {
  try {
    // Insert message record
    const result = await db.insert(messagesTable)
      .values({
        chat_id: input.chat_id,
        sender_id: input.sender_id,
        content: input.content,
        message_type: input.message_type,
        metadata: input.metadata || null,
        reply_to: input.reply_to || null,
        is_encrypted: true, // Default encryption enabled
        is_edited: false // New messages are never edited
      })
      .returning()
      .execute();

    const message = result[0];
    return {
      ...message,
      metadata: message.metadata as any // Type assertion for jsonb field
    };
  } catch (error) {
    console.error('Message creation failed:', error);
    throw error;
  }
};