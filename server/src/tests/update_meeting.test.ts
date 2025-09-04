import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { meetingsTable, usersTable } from '../db/schema';
import { type UpdateMeetingInput } from '../schema';
import { updateMeeting } from '../handlers/update_meeting';
import { eq } from 'drizzle-orm';

describe('updateMeeting', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUser: any;
  let testMeeting: any;

  beforeEach(async () => {
    // Create a test user first
    const userResult = await db.insert(usersTable)
      .values({
        email: 'organizer@test.com',
        display_name: 'Test Organizer',
        preferences: {
          language: 'en',
          timezone: 'UTC',
          ai_assistance_level: 'moderate',
          voice_enabled: false,
          encryption_enabled: true
        }
      })
      .returning()
      .execute();
    testUser = userResult[0];

    // Create a test meeting
    const startTime = new Date('2024-01-15T10:00:00Z');
    const endTime = new Date('2024-01-15T11:00:00Z');

    const meetingResult = await db.insert(meetingsTable)
      .values({
        title: 'Original Meeting',
        description: 'Original description',
        organizer_id: testUser.id,
        participants: [testUser.id],
        start_time: startTime,
        end_time: endTime,
        timezone: 'UTC',
        meeting_url: 'https://original.example.com',
        ai_suggested: false,
        status: 'scheduled'
      })
      .returning()
      .execute();
    testMeeting = meetingResult[0];
  });

  it('should update meeting title', async () => {
    const input: UpdateMeetingInput = {
      id: testMeeting.id,
      title: 'Updated Meeting Title'
    };

    const result = await updateMeeting(input);

    expect(result.id).toEqual(testMeeting.id);
    expect(result.title).toEqual('Updated Meeting Title');
    expect(result.description).toEqual('Original description'); // Should remain unchanged
    expect(result.organizer_id).toEqual(testUser.id);
    expect(result.status).toEqual('scheduled');
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at > testMeeting.updated_at).toBe(true);
  });

  it('should update meeting description', async () => {
    const input: UpdateMeetingInput = {
      id: testMeeting.id,
      description: 'Updated meeting description'
    };

    const result = await updateMeeting(input);

    expect(result.description).toEqual('Updated meeting description');
    expect(result.title).toEqual('Original Meeting'); // Should remain unchanged
  });

  it('should update meeting description to null', async () => {
    const input: UpdateMeetingInput = {
      id: testMeeting.id,
      description: null
    };

    const result = await updateMeeting(input);

    expect(result.description).toBeNull();
    expect(result.title).toEqual('Original Meeting'); // Should remain unchanged
  });

  it('should update meeting times', async () => {
    const newStartTime = new Date('2024-01-15T14:00:00Z');
    const newEndTime = new Date('2024-01-15T15:30:00Z');

    const input: UpdateMeetingInput = {
      id: testMeeting.id,
      start_time: newStartTime,
      end_time: newEndTime
    };

    const result = await updateMeeting(input);

    expect(result.start_time).toEqual(newStartTime);
    expect(result.end_time).toEqual(newEndTime);
  });

  it('should update meeting timezone', async () => {
    const input: UpdateMeetingInput = {
      id: testMeeting.id,
      timezone: 'America/New_York'
    };

    const result = await updateMeeting(input);

    expect(result.timezone).toEqual('America/New_York');
  });

  it('should update meeting URL', async () => {
    const input: UpdateMeetingInput = {
      id: testMeeting.id,
      meeting_url: 'https://updated.example.com'
    };

    const result = await updateMeeting(input);

    expect(result.meeting_url).toEqual('https://updated.example.com');
  });

  it('should update meeting URL to null', async () => {
    const input: UpdateMeetingInput = {
      id: testMeeting.id,
      meeting_url: null
    };

    const result = await updateMeeting(input);

    expect(result.meeting_url).toBeNull();
  });

  it('should update meeting status', async () => {
    const input: UpdateMeetingInput = {
      id: testMeeting.id,
      status: 'in_progress'
    };

    const result = await updateMeeting(input);

    expect(result.status).toEqual('in_progress');
  });

  it('should update multiple fields at once', async () => {
    const newStartTime = new Date('2024-01-16T09:00:00Z');
    const newEndTime = new Date('2024-01-16T10:00:00Z');

    const input: UpdateMeetingInput = {
      id: testMeeting.id,
      title: 'Completely Updated Meeting',
      description: 'New description',
      start_time: newStartTime,
      end_time: newEndTime,
      timezone: 'Europe/London',
      meeting_url: 'https://newurl.example.com',
      status: 'completed'
    };

    const result = await updateMeeting(input);

    expect(result.title).toEqual('Completely Updated Meeting');
    expect(result.description).toEqual('New description');
    expect(result.start_time).toEqual(newStartTime);
    expect(result.end_time).toEqual(newEndTime);
    expect(result.timezone).toEqual('Europe/London');
    expect(result.meeting_url).toEqual('https://newurl.example.com');
    expect(result.status).toEqual('completed');
    expect(result.organizer_id).toEqual(testUser.id); // Should remain unchanged
  });

  it('should persist changes to database', async () => {
    const input: UpdateMeetingInput = {
      id: testMeeting.id,
      title: 'Database Persistence Test',
      status: 'cancelled'
    };

    await updateMeeting(input);

    // Query database directly to verify changes
    const meetings = await db.select()
      .from(meetingsTable)
      .where(eq(meetingsTable.id, testMeeting.id))
      .execute();

    expect(meetings).toHaveLength(1);
    expect(meetings[0].title).toEqual('Database Persistence Test');
    expect(meetings[0].status).toEqual('cancelled');
    expect(meetings[0].updated_at).toBeInstanceOf(Date);
    expect(meetings[0].updated_at > testMeeting.updated_at).toBe(true);
  });

  it('should throw error for non-existent meeting', async () => {
    const input: UpdateMeetingInput = {
      id: '00000000-0000-0000-0000-000000000000',
      title: 'Non-existent meeting'
    };

    await expect(updateMeeting(input)).rejects.toThrow(/Meeting with id .* not found/i);
  });

  it('should throw error when start time is after end time', async () => {
    const startTime = new Date('2024-01-15T15:00:00Z');
    const endTime = new Date('2024-01-15T14:00:00Z'); // Before start time

    const input: UpdateMeetingInput = {
      id: testMeeting.id,
      start_time: startTime,
      end_time: endTime
    };

    await expect(updateMeeting(input)).rejects.toThrow(/start time must be before end time/i);
  });

  it('should throw error when updating only start time to be after existing end time', async () => {
    const newStartTime = new Date('2024-01-15T12:00:00Z'); // After original end time (11:00:00Z)

    const input: UpdateMeetingInput = {
      id: testMeeting.id,
      start_time: newStartTime
    };

    await expect(updateMeeting(input)).rejects.toThrow(/start time must be before end time/i);
  });

  it('should throw error when updating only end time to be before existing start time', async () => {
    const newEndTime = new Date('2024-01-15T09:00:00Z'); // Before original start time (10:00:00Z)

    const input: UpdateMeetingInput = {
      id: testMeeting.id,
      end_time: newEndTime
    };

    await expect(updateMeeting(input)).rejects.toThrow(/start time must be before end time/i);
  });

  it('should allow start time equal to current time (edge case)', async () => {
    const sameTime = new Date('2024-01-15T10:30:00Z');

    const input: UpdateMeetingInput = {
      id: testMeeting.id,
      start_time: sameTime,
      end_time: new Date('2024-01-15T11:30:00Z')
    };

    const result = await updateMeeting(input);

    expect(result.start_time).toEqual(sameTime);
    expect(result.end_time).toEqual(new Date('2024-01-15T11:30:00Z'));
  });

  it('should handle updating with no changes', async () => {
    const input: UpdateMeetingInput = {
      id: testMeeting.id
    };

    const result = await updateMeeting(input);

    // Should return the meeting with only updated_at changed
    expect(result.title).toEqual(testMeeting.title);
    expect(result.description).toEqual(testMeeting.description);
    expect(result.organizer_id).toEqual(testMeeting.organizer_id);
    expect(result.status).toEqual(testMeeting.status);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at > testMeeting.updated_at).toBe(true);
  });
});