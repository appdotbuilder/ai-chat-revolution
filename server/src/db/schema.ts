import { pgTable, text, timestamp, boolean, jsonb, pgEnum, real, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const chatTypeEnum = pgEnum('chat_type', ['direct', 'group', 'ai_assistant']);
export const messageTypeEnum = pgEnum('message_type', ['text', 'voice', 'image', 'file', 'ai_suggestion']);
export const aiAssistanceLevelEnum = pgEnum('ai_assistance_level', ['minimal', 'moderate', 'proactive']);
export const aiContextTypeEnum = pgEnum('ai_context_type', ['conversation_summary', 'user_preference', 'meeting_context', 'translation_cache']);
export const meetingStatusEnum = pgEnum('meeting_status', ['scheduled', 'in_progress', 'completed', 'cancelled']);

// Users table
export const usersTable = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  display_name: text('display_name').notNull(),
  avatar_url: text('avatar_url'),
  preferences: jsonb('preferences').notNull().default({
    language: 'en',
    timezone: 'UTC',
    ai_assistance_level: 'moderate',
    voice_enabled: false,
    encryption_enabled: true
  }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Chats table
export const chatsTable = pgTable('chats', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: chatTypeEnum('type').notNull(),
  participants: jsonb('participants').notNull(), // Array of user IDs
  is_encrypted: boolean('is_encrypted').default(true).notNull(),
  created_by: uuid('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Messages table with multimodal support
export const messagesTable = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  chat_id: uuid('chat_id').notNull(),
  sender_id: uuid('sender_id').notNull(),
  content: text('content').notNull(),
  message_type: messageTypeEnum('message_type').notNull(),
  metadata: jsonb('metadata'), // Nullable - stores voice duration, image dimensions, AI context, etc.
  reply_to: uuid('reply_to'), // Nullable - Message ID being replied to
  is_edited: boolean('is_edited').default(false).notNull(),
  is_encrypted: boolean('is_encrypted').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// AI Context table for RAG and personalization
export const aiContextTable = pgTable('ai_context', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull(),
  chat_id: uuid('chat_id'), // Nullable - can be global context
  context_type: aiContextTypeEnum('context_type').notNull(),
  content: text('content').notNull(),
  embedding_vector: jsonb('embedding_vector'), // Nullable - Vector embeddings for RAG
  relevance_score: real('relevance_score').default(1.0).notNull(),
  expires_at: timestamp('expires_at'), // Nullable - for temporary context
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Meetings/Calendar integration table
export const meetingsTable = pgTable('meetings', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'), // Nullable
  organizer_id: uuid('organizer_id').notNull(),
  participants: jsonb('participants').notNull(), // Array of user IDs
  start_time: timestamp('start_time').notNull(),
  end_time: timestamp('end_time').notNull(),
  timezone: text('timezone').notNull(),
  meeting_url: text('meeting_url'), // Nullable
  chat_id: uuid('chat_id'), // Nullable - Associated chat
  ai_suggested: boolean('ai_suggested').default(false).notNull(),
  status: meetingStatusEnum('status').default('scheduled').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  sentMessages: many(messagesTable, { relationName: 'sender' }),
  createdChats: many(chatsTable, { relationName: 'creator' }),
  aiContext: many(aiContextTable, { relationName: 'user_context' }),
  organizedMeetings: many(meetingsTable, { relationName: 'organizer' })
}));

export const chatsRelations = relations(chatsTable, ({ one, many }) => ({
  creator: one(usersTable, {
    fields: [chatsTable.created_by],
    references: [usersTable.id],
    relationName: 'creator'
  }),
  messages: many(messagesTable, { relationName: 'chat_messages' }),
  aiContext: many(aiContextTable, { relationName: 'chat_context' }),
  meetings: many(meetingsTable, { relationName: 'chat_meetings' })
}));

export const messagesRelations = relations(messagesTable, ({ one }) => ({
  chat: one(chatsTable, {
    fields: [messagesTable.chat_id],
    references: [chatsTable.id],
    relationName: 'chat_messages'
  }),
  sender: one(usersTable, {
    fields: [messagesTable.sender_id],
    references: [usersTable.id],
    relationName: 'sender'
  }),
  replyTo: one(messagesTable, {
    fields: [messagesTable.reply_to],
    references: [messagesTable.id],
    relationName: 'message_reply'
  })
}));

export const aiContextRelations = relations(aiContextTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [aiContextTable.user_id],
    references: [usersTable.id],
    relationName: 'user_context'
  }),
  chat: one(chatsTable, {
    fields: [aiContextTable.chat_id],
    references: [chatsTable.id],
    relationName: 'chat_context'
  })
}));

export const meetingsRelations = relations(meetingsTable, ({ one }) => ({
  organizer: one(usersTable, {
    fields: [meetingsTable.organizer_id],
    references: [usersTable.id],
    relationName: 'organizer'
  }),
  chat: one(chatsTable, {
    fields: [meetingsTable.chat_id],
    references: [chatsTable.id],
    relationName: 'chat_meetings'
  })
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type Chat = typeof chatsTable.$inferSelect;
export type NewChat = typeof chatsTable.$inferInsert;

export type Message = typeof messagesTable.$inferSelect;
export type NewMessage = typeof messagesTable.$inferInsert;

export type AIContext = typeof aiContextTable.$inferSelect;
export type NewAIContext = typeof aiContextTable.$inferInsert;

export type Meeting = typeof meetingsTable.$inferSelect;
export type NewMeeting = typeof meetingsTable.$inferInsert;

// Export all tables and relations for proper query building
export const tables = {
  users: usersTable,
  chats: chatsTable,
  messages: messagesTable,
  aiContext: aiContextTable,
  meetings: meetingsTable
};

export const tableRelations = {
  usersRelations,
  chatsRelations,
  messagesRelations,
  aiContextRelations,
  meetingsRelations
};