import { db } from '../db';
import { meetingsTable } from '../db/schema';
import { type Meeting } from '../schema';
import { and, or, eq, gte, lt, sql } from 'drizzle-orm';

export const getUserMeetings = async (userId: string, upcoming: boolean = true): Promise<Meeting[]> => {
  try {
    const now = new Date();

    // Filter by user participation - user can be organizer or participant
    const userConditions = [
      eq(meetingsTable.organizer_id, userId),
      sql`${meetingsTable.participants}::jsonb @> ${JSON.stringify([userId])}`
    ];

    // Build conditions based on upcoming parameter
    const conditions = upcoming
      ? and(or(...userConditions), gte(meetingsTable.start_time, now))
      : and(or(...userConditions), lt(meetingsTable.start_time, now));

    // Execute the query
    const results = await db.select()
      .from(meetingsTable)
      .where(conditions)
      .orderBy(meetingsTable.start_time)
      .execute();

    // Convert participants from unknown to string[] and ensure proper typing
    return results.map(meeting => ({
      ...meeting,
      participants: meeting.participants as string[]
    }));
  } catch (error) {
    console.error('Get user meetings failed:', error);
    throw error;
  }
};