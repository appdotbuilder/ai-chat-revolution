import { z } from 'zod';

// User schema
export const userSchema = z.object({
  id: z.string(), // UUID
  email: z.string().email(),
  display_name: z.string(),
  avatar_url: z.string().nullable(),
  preferences: z.object({
    language: z.string().default('en'),
    timezone: z.string(),
    ai_assistance_level: z.enum(['minimal', 'moderate', 'proactive']).default('moderate'),
    voice_enabled: z.boolean().default(false),
    encryption_enabled: z.boolean().default(true)
  }),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Chat schema
export const chatSchema = z.object({
  id: z.string(), // UUID
  name: z.string(),
  type: z.enum(['direct', 'group', 'ai_assistant']),
  participants: z.array(z.string()), // Array of user IDs
  is_encrypted: z.boolean().default(true),
  created_by: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Chat = z.infer<typeof chatSchema>;

// Message schema with multimodal support
export const messageSchema = z.object({
  id: z.string(), // UUID
  chat_id: z.string(),
  sender_id: z.string(),
  content: z.string(),
  message_type: z.enum(['text', 'voice', 'image', 'file', 'ai_suggestion']),
  metadata: z.object({
    voice_duration: z.number().optional(),
    image_dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
    file_size: z.number().optional(),
    file_name: z.string().optional(),
    ai_context: z.object({
      tone: z.string().optional(),
      intent: z.string().optional(),
      confidence: z.number().optional()
    }).optional()
  }).nullable(),
  reply_to: z.string().nullable(), // Message ID being replied to
  is_edited: z.boolean().default(false),
  is_encrypted: z.boolean().default(true),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Message = z.infer<typeof messageSchema>;

// AI Context schema for RAG and personalization
export const aiContextSchema = z.object({
  id: z.string(), // UUID
  user_id: z.string(),
  chat_id: z.string().nullable(),
  context_type: z.enum(['conversation_summary', 'user_preference', 'meeting_context', 'translation_cache']),
  content: z.string(),
  embedding_vector: z.array(z.number()).nullable(), // Vector embeddings for RAG
  relevance_score: z.number().default(1.0),
  expires_at: z.coerce.date().nullable(),
  created_at: z.coerce.date()
});

export type AIContext = z.infer<typeof aiContextSchema>;

// Meeting/Calendar integration schema
export const meetingSchema = z.object({
  id: z.string(), // UUID
  title: z.string(),
  description: z.string().nullable(),
  organizer_id: z.string(),
  participants: z.array(z.string()), // Array of user IDs
  start_time: z.coerce.date(),
  end_time: z.coerce.date(),
  timezone: z.string(),
  meeting_url: z.string().nullable(),
  chat_id: z.string().nullable(), // Associated chat
  ai_suggested: z.boolean().default(false),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).default('scheduled'),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Meeting = z.infer<typeof meetingSchema>;

// Input schemas for creating/updating entities

// User input schemas
export const createUserInputSchema = z.object({
  email: z.string().email(),
  display_name: z.string(),
  avatar_url: z.string().nullable().optional(),
  preferences: z.object({
    language: z.string().default('en'),
    timezone: z.string(),
    ai_assistance_level: z.enum(['minimal', 'moderate', 'proactive']).default('moderate'),
    voice_enabled: z.boolean().default(false),
    encryption_enabled: z.boolean().default(true)
  }).optional()
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z.object({
  id: z.string(),
  display_name: z.string().optional(),
  avatar_url: z.string().nullable().optional(),
  preferences: z.object({
    language: z.string().optional(),
    timezone: z.string().optional(),
    ai_assistance_level: z.enum(['minimal', 'moderate', 'proactive']).optional(),
    voice_enabled: z.boolean().optional(),
    encryption_enabled: z.boolean().optional()
  }).optional()
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

// Chat input schemas
export const createChatInputSchema = z.object({
  name: z.string(),
  type: z.enum(['direct', 'group', 'ai_assistant']),
  participants: z.array(z.string()),
  created_by: z.string()
});

export type CreateChatInput = z.infer<typeof createChatInputSchema>;

// Message input schemas
export const createMessageInputSchema = z.object({
  chat_id: z.string(),
  sender_id: z.string(),
  content: z.string(),
  message_type: z.enum(['text', 'voice', 'image', 'file', 'ai_suggestion']),
  metadata: z.object({
    voice_duration: z.number().optional(),
    image_dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
    file_size: z.number().optional(),
    file_name: z.string().optional(),
    ai_context: z.object({
      tone: z.string().optional(),
      intent: z.string().optional(),
      confidence: z.number().optional()
    }).optional()
  }).nullable().optional(),
  reply_to: z.string().nullable().optional()
});

export type CreateMessageInput = z.infer<typeof createMessageInputSchema>;

// AI Context input schemas
export const createAIContextInputSchema = z.object({
  user_id: z.string(),
  chat_id: z.string().nullable().optional(),
  context_type: z.enum(['conversation_summary', 'user_preference', 'meeting_context', 'translation_cache']),
  content: z.string(),
  embedding_vector: z.array(z.number()).nullable().optional(),
  relevance_score: z.number().default(1.0),
  expires_at: z.coerce.date().nullable().optional()
});

export type CreateAIContextInput = z.infer<typeof createAIContextInputSchema>;

// Meeting input schemas
export const createMeetingInputSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  organizer_id: z.string(),
  participants: z.array(z.string()),
  start_time: z.coerce.date(),
  end_time: z.coerce.date(),
  timezone: z.string(),
  meeting_url: z.string().nullable().optional(),
  chat_id: z.string().nullable().optional(),
  ai_suggested: z.boolean().default(false)
});

export type CreateMeetingInput = z.infer<typeof createMeetingInputSchema>;

export const updateMeetingInputSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  start_time: z.coerce.date().optional(),
  end_time: z.coerce.date().optional(),
  timezone: z.string().optional(),
  meeting_url: z.string().nullable().optional(),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional()
});

export type UpdateMeetingInput = z.infer<typeof updateMeetingInputSchema>;

// Query schemas
export const getChatMessagesInputSchema = z.object({
  chat_id: z.string(),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0),
  before: z.coerce.date().optional()
});

export type GetChatMessagesInput = z.infer<typeof getChatMessagesInputSchema>;

export const searchAIContextInputSchema = z.object({
  user_id: z.string(),
  query: z.string(),
  context_type: z.enum(['conversation_summary', 'user_preference', 'meeting_context', 'translation_cache']).optional(),
  limit: z.number().int().positive().default(10)
});

export type SearchAIContextInput = z.infer<typeof searchAIContextInputSchema>;

// AI Processing schemas
export const aiChatCompletionInputSchema = z.object({
  chat_id: z.string(),
  user_id: z.string(),
  message: z.string(),
  context_window: z.number().int().positive().default(10), // Number of recent messages to include
  tone: z.enum(['professional', 'casual', 'empathetic', 'concise', 'detailed']).optional(),
  include_suggestions: z.boolean().default(true)
});

export type AIChatCompletionInput = z.infer<typeof aiChatCompletionInputSchema>;

export const voiceTranscriptionInputSchema = z.object({
  audio_data: z.string(), // Base64 encoded audio
  language: z.string().default('auto'),
  user_id: z.string()
});

export type VoiceTranscriptionInput = z.infer<typeof voiceTranscriptionInputSchema>;

export const imageAnalysisInputSchema = z.object({
  image_data: z.string(), // Base64 encoded image
  user_id: z.string(),
  analysis_type: z.enum(['describe', 'text_extract', 'sentiment', 'context']).default('describe')
});

export type ImageAnalysisInput = z.infer<typeof imageAnalysisInputSchema>;