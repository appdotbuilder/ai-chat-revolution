import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, meetingsTable } from '../db/schema';
import { getUserMeetings } from '../handlers/get_user_meetings';

// Helper function to create test user
const createTestUser = async (email: string, displayName: string) => {
  const result = await db.insert(usersTable)
    .values({
      email,
      display_name: displayName,
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
  
  return result[0];
};

// Helper function to create test meeting
const createTestMeeting = async (
  title: string,
  organizerId: string,
  participants: string[],
  startTime: Date,
  endTime: Date,
  aiSuggested: boolean = false
) => {
  const result = await db.insert(meetingsTable)
    .values({
      title,
      organizer_id: organizerId,
      participants,
      start_time: startTime,
      end_time: endTime,
      timezone: 'UTC',
      ai_suggested: aiSuggested
    })
    .returning()
    .execute();
  
  return result[0];
};

describe('getUserMeetings', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get meetings where user is organizer', async () => {
    // Create test users
    const user1 = await createTestUser('organizer@example.com', 'Test Organizer');
    const user2 = await createTestUser('participant@example.com', 'Test Participant');

    // Create a future meeting where user1 is organizer
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setHours(dayAfter.getHours() + 2);

    const createdMeeting = await createTestMeeting(
      'Team Meeting',
      user1.id,
      [user2.id],
      tomorrow,
      dayAfter,
      false
    );

    // Get upcoming meetings for user1
    const meetings = await getUserMeetings(user1.id, true);

    expect(meetings).toHaveLength(1);
    expect(meetings[0].id).toEqual(createdMeeting.id);
    expect(meetings[0].title).toEqual('Team Meeting');
    expect(meetings[0].organizer_id).toEqual(user1.id);
    expect(meetings[0].participants).toEqual([user2.id]);
  });

  it('should get meetings where user is participant', async () => {
    // Create test users
    const user1 = await createTestUser('organizer@example.com', 'Test Organizer');
    const user2 = await createTestUser('participant@example.com', 'Test Participant');

    // Create a future meeting where user2 is participant
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setHours(dayAfter.getHours() + 2);

    const createdMeeting = await createTestMeeting(
      'Project Review',
      user1.id,
      [user2.id],
      tomorrow,
      dayAfter,
      true
    );

    // Get upcoming meetings for user2 (participant)
    const meetings = await getUserMeetings(user2.id, true);

    expect(meetings).toHaveLength(1);
    expect(meetings[0].id).toEqual(createdMeeting.id);
    expect(meetings[0].title).toEqual('Project Review');
    expect(meetings[0].organizer_id).toEqual(user1.id);
    expect(meetings[0].participants).toEqual([user2.id]);
    expect(meetings[0].ai_suggested).toEqual(true);
  });

  it('should filter upcoming meetings correctly', async () => {
    // Create test users
    const user1 = await createTestUser('organizer@example.com', 'Test Organizer');
    const user2 = await createTestUser('participant@example.com', 'Test Participant');

    // Create a past meeting
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(yesterdayEnd.getHours() + 1);

    // Create a future meeting
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(tomorrowEnd.getHours() + 1);

    await createTestMeeting('Past Meeting', user1.id, [user2.id], yesterday, yesterdayEnd);
    const futureMeeting = await createTestMeeting('Future Meeting', user1.id, [user2.id], tomorrow, tomorrowEnd);

    // Get upcoming meetings only
    const upcomingMeetings = await getUserMeetings(user1.id, true);
    expect(upcomingMeetings).toHaveLength(1);
    expect(upcomingMeetings[0].title).toEqual('Future Meeting');

    // Get past meetings only
    const pastMeetings = await getUserMeetings(user1.id, false);
    expect(pastMeetings).toHaveLength(1);
    expect(pastMeetings[0].title).toEqual('Past Meeting');
  });

  it('should not return meetings for users who are not involved', async () => {
    // Create test users
    const user1 = await createTestUser('organizer@example.com', 'Test Organizer');
    const user2 = await createTestUser('participant@example.com', 'Test Participant');
    const user3 = await createTestUser('other@example.com', 'Other User');

    // Create a meeting between user1 and user2
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setHours(dayAfter.getHours() + 1);

    await createTestMeeting('Private Meeting', user1.id, [user2.id], tomorrow, dayAfter);

    // user3 should not see this meeting
    const meetings = await getUserMeetings(user3.id, true);
    expect(meetings).toHaveLength(0);
  });

  it('should handle multiple participants correctly', async () => {
    // Create test users
    const user1 = await createTestUser('organizer@example.com', 'Test Organizer');
    const user2 = await createTestUser('participant1@example.com', 'Test Participant 1');
    const user3 = await createTestUser('participant2@example.com', 'Test Participant 2');

    // Create a meeting with multiple participants
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setHours(dayAfter.getHours() + 1);

    const createdMeeting = await createTestMeeting(
      'Group Meeting',
      user1.id,
      [user2.id, user3.id],
      tomorrow,
      dayAfter
    );

    // All users should see the meeting
    const organizerMeetings = await getUserMeetings(user1.id, true);
    expect(organizerMeetings).toHaveLength(1);
    expect(organizerMeetings[0].id).toEqual(createdMeeting.id);

    const participant1Meetings = await getUserMeetings(user2.id, true);
    expect(participant1Meetings).toHaveLength(1);
    expect(participant1Meetings[0].id).toEqual(createdMeeting.id);

    const participant2Meetings = await getUserMeetings(user3.id, true);
    expect(participant2Meetings).toHaveLength(1);
    expect(participant2Meetings[0].id).toEqual(createdMeeting.id);
  });

  it('should return meetings ordered by start time', async () => {
    // Create test user
    const user1 = await createTestUser('organizer@example.com', 'Test Organizer');

    const now = new Date();
    
    // Create meetings at different times
    const meeting1Time = new Date(now);
    meeting1Time.setDate(meeting1Time.getDate() + 1);
    const meeting1End = new Date(meeting1Time);
    meeting1End.setHours(meeting1End.getHours() + 1);

    const meeting2Time = new Date(now);
    meeting2Time.setDate(meeting2Time.getDate() + 3);
    const meeting2End = new Date(meeting2Time);
    meeting2End.setHours(meeting2End.getHours() + 1);

    const meeting3Time = new Date(now);
    meeting3Time.setDate(meeting3Time.getDate() + 2);
    const meeting3End = new Date(meeting3Time);
    meeting3End.setHours(meeting3End.getHours() + 1);

    // Create meetings in random order
    await createTestMeeting('Latest Meeting', user1.id, [], meeting2Time, meeting2End);
    await createTestMeeting('Earliest Meeting', user1.id, [], meeting1Time, meeting1End);
    await createTestMeeting('Middle Meeting', user1.id, [], meeting3Time, meeting3End);

    const meetings = await getUserMeetings(user1.id, true);

    expect(meetings).toHaveLength(3);
    expect(meetings[0].title).toEqual('Earliest Meeting');
    expect(meetings[1].title).toEqual('Middle Meeting');
    expect(meetings[2].title).toEqual('Latest Meeting');
    
    // Verify chronological order
    expect(meetings[0].start_time <= meetings[1].start_time).toBe(true);
    expect(meetings[1].start_time <= meetings[2].start_time).toBe(true);
  });

  it('should return empty array when user has no meetings', async () => {
    // Create test user
    const user1 = await createTestUser('lonely@example.com', 'Lonely User');

    const meetings = await getUserMeetings(user1.id, true);
    expect(meetings).toHaveLength(0);
  });
});