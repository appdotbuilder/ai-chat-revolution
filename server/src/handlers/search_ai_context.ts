import { db } from '../db';
import { aiContextTable } from '../db/schema';
import { type SearchAIContextInput, type AIContext } from '../schema';
import { eq, and, ilike, desc, SQL } from 'drizzle-orm';

export const searchAIContext = async (input: SearchAIContextInput): Promise<AIContext[]> => {
  try {
    // Build conditions array
    const conditions: SQL<unknown>[] = [];

    // Filter by user_id (required)
    conditions.push(eq(aiContextTable.user_id, input.user_id));

    // Filter by context_type if provided
    if (input.context_type) {
      conditions.push(eq(aiContextTable.context_type, input.context_type));
    }

    // Add content search using case-insensitive LIKE
    conditions.push(ilike(aiContextTable.content, `%${input.query}%`));

    // Build and execute query
    const results = await db.select()
      .from(aiContextTable)
      .where(and(...conditions))
      .orderBy(desc(aiContextTable.relevance_score), desc(aiContextTable.created_at))
      .limit(input.limit)
      .execute();

    // Convert numeric fields and ensure proper return type
    return results.map(result => ({
      ...result,
      relevance_score: parseFloat(result.relevance_score.toString()),
      embedding_vector: result.embedding_vector as number[] | null
    }));

  } catch (error) {
    console.error('AI context search failed:', error);
    throw error;
  }
};