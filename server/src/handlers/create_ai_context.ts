import { db } from '../db';
import { aiContextTable } from '../db/schema';
import { type CreateAIContextInput, type AIContext } from '../schema';

export const createAIContext = async (input: CreateAIContextInput): Promise<AIContext> => {
  try {
    // Insert AI context record
    const result = await db.insert(aiContextTable)
      .values({
        user_id: input.user_id,
        chat_id: input.chat_id || null,
        context_type: input.context_type,
        content: input.content,
        embedding_vector: input.embedding_vector || null,
        relevance_score: input.relevance_score,
        expires_at: input.expires_at || null
      })
      .returning()
      .execute();

    const aiContext = result[0];
    return {
      ...aiContext,
      relevance_score: parseFloat(aiContext.relevance_score.toString()), // Convert numeric to number
      embedding_vector: aiContext.embedding_vector as number[] | null // Type assertion for JSONB
    };
  } catch (error) {
    console.error('AI context creation failed:', error);
    throw error;
  }
};