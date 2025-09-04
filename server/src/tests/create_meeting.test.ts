import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { meetingsTable, usersTable, chatsTable } from '../db/schema';
import { type CreateMeetingInput } from '../schema';
import { createMeeting } from '../handlers/create_meeting';
import { eq } from 'drizzle-orm';

// Test data setup
const testOrganizer = {
  email: 'organizer@example.com',
  display_name: 'Meeting Organizer',
  preferences: {
    language: 'en',
    timezone: 'UTC',
    ai_assistance_level: 'moderate' as const,
    voice_enabled: false,
    encryption_enabled: true
  }
};

const testParticipant = {
  email: 'participant@example.com',
  display_name: 'Meeting Participant',
  preferences: {
    language: 'en',
    timezone: 'UTC',
    ai_assistance_level: 'moderate' as const,
    voice_enabled: false,
    encryption_enabled: true
  }
};

const testChat = {
  name: 'Team Chat',
  type: 'group' as const,
  participants: [] as string[], // Will be populated with user IDs
  created_by: '' // Will be populated with organizer ID
};

describe('createMeeting', () => {
  let organizerId: string;
  let participantId: string;
  let chatId: string;

  beforeEach(async () => {
    await createDB();

    // Create test users
    const organizerResult = await db.insert(usersTable)
      .values(testOrganizer)
      .returning()
      .execute();
    organizerId = organizerResult[0].id;

    const participantResult = await db.insert(usersTable)
      .values(testParticipant)
      .returning()
      .execute();
    participantId = participantResult[0].id;

    // Create test chat
    const chatResult = await db.insert(chatsTable)
      .values({
        ...testChat,
        participants: [organizerId, participantId],
        created_by: organizerId
      })
      .returning()
      .execute();
    chatId = chatResult[0].id;
  });

  afterEach(resetDB);

  it('should create a basic meeting successfully', async () => {
    const startTime = new Date('2024-12-01T10:00:00Z');
    const endTime = new Date('2024-12-01T11:00:00Z');

    const testInput: CreateMeetingInput = {
      title: 'Team Standup',
      description: 'Daily team sync meeting',
      organizer_id: organizerId,
      participants: [organizerId, participantId],
      start_time: startTime,
      end_time: endTime,
      timezone: 'UTC',
      meeting_url: 'https://meet.example.com/123',
      chat_id: chatId,
      ai_suggested: false
    };

    const result = await createMeeting(testInput);

    // Verify all fields are correct
    expect(result.id).toBeDefined();
    expect(result.title).toEqual('Team Standup');
    expect(result.description).toEqual('Daily team sync meeting');
    expect(result.organizer_id).toEqual(organizerId);
    expect(result.participants).toEqual([organizerId, participantId]);
    expect(result.start_time).toEqual(startTime);
    expect(result.end_time).toEqual(endTime);
    expect(result.timezone).toEqual('UTC');
    expect(result.meeting_url).toEqual('https://meet.example.com/123');
    expect(result.chat_id).toEqual(chatId);
    expect(result.ai_suggested).toEqual(false);
    expect(result.status).toEqual('scheduled');
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create meeting without optional fields', async () => {
    const startTime = new Date('2024-12-01T14:00:00Z');
    const endTime = new Date('2024-12-01T15:00:00Z');

    const testInput: CreateMeetingInput = {
      title: 'Quick Chat',
      organizer_id: organizerId,
      participants: [organizerId],
      start_time: startTime,
      end_time: endTime,
      timezone: 'America/New_York',
      ai_suggested: true
    };

    const result = await createMeeting(testInput);

    expect(result.title).toEqual('Quick Chat');
    expect(result.description).toBeNull();
    expect(result.meeting_url).toBeNull();
    expect(result.chat_id).toBeNull();
    expect(result.ai_suggested).toEqual(true);
    expect(result.timezone).toEqual('America/New_York');
    expect(result.status).toEqual('scheduled');
  });

  it('should save meeting to database correctly', async () => {
    const startTime = new Date('2024-12-01T16:00:00Z');
    const endTime = new Date('2024-12-01T17:00:00Z');

    const testInput: CreateMeetingInput = {
      title: 'Project Review',
      organizer_id: organizerId,
      participants: [organizerId, participantId],
      start_time: startTime,
      end_time: endTime,
      timezone: 'Europe/London',
      ai_suggested: false
    };

    const result = await createMeeting(testInput);

    // Query database to verify the meeting was saved
    const meetings = await db.select()
      .from(meetingsTable)
      .where(eq(meetingsTable.id, result.id))
      .execute();

    expect(meetings).toHaveLength(1);
    const savedMeeting = meetings[0];
    expect(savedMeeting.title).toEqual('Project Review');
    expect(savedMeeting.organizer_id).toEqual(organizerId);
    expect(Array.isArray(savedMeeting.participants)).toBe(true);
    expect(savedMeeting.participants).toEqual([organizerId, participantId]);
    expect(savedMeeting.start_time).toEqual(startTime);
    expect(savedMeeting.end_time).toEqual(endTime);
    expect(savedMeeting.timezone).toEqual('Europe/London');
    expect(savedMeeting.status).toEqual('scheduled');
  });

  it('should throw error when organizer does not exist', async () => {
    const testInput: CreateMeetingInput = {
      title: 'Invalid Meeting',
      organizer_id: '00000000-0000-0000-0000-000000000000', // Non-existent UUID
      participants: [organizerId],
      start_time: new Date('2024-12-01T10:00:00Z'),
      end_time: new Date('2024-12-01T11:00:00Z'),
      timezone: 'UTC',
      ai_suggested: false
    };

    await expect(createMeeting(testInput)).rejects.toThrow(/organizer not found/i);
  });

  it('should throw error when participant does not exist', async () => {
    const testInput: CreateMeetingInput = {
      title: 'Invalid Meeting',
      organizer_id: organizerId,
      participants: [organizerId, '00000000-0000-0000-0000-000000000000'], // Non-existent UUID
      start_time: new Date('2024-12-01T10:00:00Z'),
      end_time: new Date('2024-12-01T11:00:00Z'),
      timezone: 'UTC',
      ai_suggested: false
    };

    await expect(createMeeting(testInput)).rejects.toThrow(/participant.*not found/i);
  });

  it('should throw error when chat_id does not exist', async () => {
    const testInput: CreateMeetingInput = {
      title: 'Invalid Meeting',
      organizer_id: organizerId,
      participants: [organizerId],
      start_time: new Date('2024-12-01T10:00:00Z'),
      end_time: new Date('2024-12-01T11:00:00Z'),
      timezone: 'UTC',
      chat_id: '00000000-0000-0000-0000-000000000000', // Non-existent UUID
      ai_suggested: false
    };

    await expect(createMeeting(testInput)).rejects.toThrow(/associated chat not found/i);
  });

  it('should throw error when start time is after end time', async () => {
    const startTime = new Date('2024-12-01T12:00:00Z');
    const endTime = new Date('2024-12-01T11:00:00Z'); // Earlier than start time

    const testInput: CreateMeetingInput = {
      title: 'Invalid Time Meeting',
      organizer_id: organizerId,
      participants: [organizerId],
      start_time: startTime,
      end_time: endTime,
      timezone: 'UTC',
      ai_suggested: false
    };

    await expect(createMeeting(testInput)).rejects.toThrow(/start time must be before end time/i);
  });

  it('should throw error when start time equals end time', async () => {
    const sameTime = new Date('2024-12-01T12:00:00Z');

    const testInput: CreateMeetingInput = {
      title: 'Zero Duration Meeting',
      organizer_id: organizerId,
      participants: [organizerId],
      start_time: sameTime,
      end_time: sameTime,
      timezone: 'UTC',
      ai_suggested: false
    };

    await expect(createMeeting(testInput)).rejects.toThrow(/start time must be before end time/i);
  });

  it('should handle multiple participants correctly', async () => {
    // Create additional participants
    const participant2Result = await db.insert(usersTable)
      .values({
        email: 'participant2@example.com',
        display_name: 'Second Participant',
        preferences: {
          language: 'en',
          timezone: 'UTC',
          ai_assistance_level: 'moderate' as const,
          voice_enabled: false,
          encryption_enabled: true
        }
      })
      .returning()
      .execute();
    const participant2Id = participant2Result[0].id;

    const testInput: CreateMeetingInput = {
      title: 'Team Meeting',
      organizer_id: organizerId,
      participants: [organizerId, participantId, participant2Id],
      start_time: new Date('2024-12-01T09:00:00Z'),
      end_time: new Date('2024-12-01T10:00:00Z'),
      timezone: 'UTC',
      ai_suggested: false
    };

    const result = await createMeeting(testInput);

    expect(result.participants).toHaveLength(3);
    expect(result.participants).toContain(organizerId);
    expect(result.participants).toContain(participantId);
    expect(result.participants).toContain(participant2Id);
  });

  it('should handle AI-suggested meetings correctly', async () => {
    const testInput: CreateMeetingInput = {
      title: 'AI Suggested Follow-up',
      description: 'Generated based on chat analysis',
      organizer_id: organizerId,
      participants: [organizerId, participantId],
      start_time: new Date('2024-12-02T15:00:00Z'),
      end_time: new Date('2024-12-02T15:30:00Z'),
      timezone: 'UTC',
      chat_id: chatId,
      ai_suggested: true
    };

    const result = await createMeeting(testInput);

    expect(result.ai_suggested).toEqual(true);
    expect(result.chat_id).toEqual(chatId);
    expect(result.description).toEqual('Generated based on chat analysis');

    // Verify in database
    const savedMeeting = await db.select()
      .from(meetingsTable)
      .where(eq(meetingsTable.id, result.id))
      .execute();

    expect(savedMeeting[0].ai_suggested).toEqual(true);
    expect(savedMeeting[0].chat_id).toEqual(chatId);
  });
});