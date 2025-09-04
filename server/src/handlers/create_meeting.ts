import { db } from '../db';
import { meetingsTable, usersTable, chatsTable } from '../db/schema';
import { type CreateMeetingInput, type Meeting } from '../schema';
import { eq } from 'drizzle-orm';

export const createMeeting = async (input: CreateMeetingInput): Promise<Meeting> => {
  try {
    // Verify organizer exists
    const organizer = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.organizer_id))
      .execute();

    if (organizer.length === 0) {
      throw new Error('Organizer not found');
    }

    // Verify all participants exist
    for (const participantId of input.participants) {
      const participant = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, participantId))
        .execute();

      if (participant.length === 0) {
        throw new Error(`Participant ${participantId} not found`);
      }
    }

    // If chat_id is provided, verify the chat exists
    if (input.chat_id) {
      const chat = await db.select()
        .from(chatsTable)
        .where(eq(chatsTable.id, input.chat_id))
        .execute();

      if (chat.length === 0) {
        throw new Error('Associated chat not found');
      }
    }

    // Validate meeting times
    if (input.start_time >= input.end_time) {
      throw new Error('Meeting start time must be before end time');
    }

    // Insert meeting record
    const result = await db.insert(meetingsTable)
      .values({
        title: input.title,
        description: input.description || null,
        organizer_id: input.organizer_id,
        participants: input.participants as unknown as any, // Cast for jsonb field
        start_time: input.start_time,
        end_time: input.end_time,
        timezone: input.timezone,
        meeting_url: input.meeting_url || null,
        chat_id: input.chat_id || null,
        ai_suggested: input.ai_suggested,
        status: 'scheduled'
      })
      .returning()
      .execute();

    const meeting = result[0];
    return {
      ...meeting,
      participants: meeting.participants as string[] // Cast back to string array
    };
  } catch (error) {
    console.error('Meeting creation failed:', error);
    throw error;
  }
};