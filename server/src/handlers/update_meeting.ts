import { db } from '../db';
import { meetingsTable } from '../db/schema';
import { type UpdateMeetingInput, type Meeting } from '../schema';
import { eq } from 'drizzle-orm';

export const updateMeeting = async (input: UpdateMeetingInput): Promise<Meeting> => {
  try {
    // First check if the meeting exists
    const existingMeeting = await db.select()
      .from(meetingsTable)
      .where(eq(meetingsTable.id, input.id))
      .execute();

    if (existingMeeting.length === 0) {
      throw new Error(`Meeting with id ${input.id} not found`);
    }

    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.title !== undefined) {
      updateData.title = input.title;
    }

    if (input.description !== undefined) {
      updateData.description = input.description;
    }

    if (input.start_time !== undefined) {
      updateData.start_time = input.start_time;
    }

    if (input.end_time !== undefined) {
      updateData.end_time = input.end_time;
    }

    if (input.timezone !== undefined) {
      updateData.timezone = input.timezone;
    }

    if (input.meeting_url !== undefined) {
      updateData.meeting_url = input.meeting_url;
    }

    if (input.status !== undefined) {
      updateData.status = input.status;
    }

    // Validate start_time and end_time if both are provided or one is being updated
    const finalStartTime = input.start_time || existingMeeting[0].start_time;
    const finalEndTime = input.end_time || existingMeeting[0].end_time;

    if (finalStartTime >= finalEndTime) {
      throw new Error('Meeting start time must be before end time');
    }

    // Update the meeting
    const result = await db.update(meetingsTable)
      .set(updateData)
      .where(eq(meetingsTable.id, input.id))
      .returning()
      .execute();

    const updatedMeeting = result[0];
    
    // Ensure participants is properly typed as string[]
    return {
      ...updatedMeeting,
      participants: updatedMeeting.participants as string[]
    };
  } catch (error) {
    console.error('Meeting update failed:', error);
    throw error;
  }
};