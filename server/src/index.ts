import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  createUserInputSchema,
  updateUserInputSchema,
  createChatInputSchema,
  createMessageInputSchema,
  getChatMessagesInputSchema,
  aiChatCompletionInputSchema,
  voiceTranscriptionInputSchema,
  imageAnalysisInputSchema,
  createAIContextInputSchema,
  searchAIContextInputSchema,
  createMeetingInputSchema,
  updateMeetingInputSchema
} from './schema';

// Import handlers
import { createUser } from './handlers/create_user';
import { updateUser } from './handlers/update_user';
import { getUser } from './handlers/get_user';
import { createChat } from './handlers/create_chat';
import { getUserChats } from './handlers/get_user_chats';
import { createMessage } from './handlers/create_message';
import { getChatMessages } from './handlers/get_chat_messages';
import { aiChatCompletion } from './handlers/ai_chat_completion';
import { voiceTranscription } from './handlers/voice_transcription';
import { imageAnalysis } from './handlers/image_analysis';
import { createAIContext } from './handlers/create_ai_context';
import { searchAIContext } from './handlers/search_ai_context';
import { createMeeting } from './handlers/create_meeting';
import { updateMeeting } from './handlers/update_meeting';
import { getUserMeetings } from './handlers/get_user_meetings';
import { aiMeetingSuggestions } from './handlers/ai_meeting_suggestions';
import { translateMessage } from './handlers/translate_message';
import { summarizeConversation } from './handlers/summarize_conversation';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // User management
  createUser: publicProcedure
    .input(createUserInputSchema)
    .mutation(({ input }) => createUser(input)),

  updateUser: publicProcedure
    .input(updateUserInputSchema)
    .mutation(({ input }) => updateUser(input)),

  getUser: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ input }) => getUser(input.userId)),

  // Chat management
  createChat: publicProcedure
    .input(createChatInputSchema)
    .mutation(({ input }) => createChat(input)),

  getUserChats: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(({ input }) => getUserChats(input.userId)),

  // Message management
  createMessage: publicProcedure
    .input(createMessageInputSchema)
    .mutation(({ input }) => createMessage(input)),

  getChatMessages: publicProcedure
    .input(getChatMessagesInputSchema)
    .query(({ input }) => getChatMessages(input)),

  // AI-powered features
  aiChatCompletion: publicProcedure
    .input(aiChatCompletionInputSchema)
    .mutation(({ input }) => aiChatCompletion(input)),

  voiceTranscription: publicProcedure
    .input(voiceTranscriptionInputSchema)
    .mutation(({ input }) => voiceTranscription(input)),

  imageAnalysis: publicProcedure
    .input(imageAnalysisInputSchema)
    .mutation(({ input }) => imageAnalysis(input)),

  translateMessage: publicProcedure
    .input(z.object({
      message: z.string(),
      from_language: z.string(),
      to_language: z.string(),
      user_id: z.string(),
      preserve_tone: z.boolean().default(true)
    }))
    .mutation(({ input }) => translateMessage(input)),

  summarizeConversation: publicProcedure
    .input(z.object({
      chat_id: z.string(),
      user_id: z.string(),
      time_range: z.object({
        from: z.coerce.date(),
        to: z.coerce.date()
      }).optional(),
      summary_type: z.enum(['brief', 'detailed', 'action_items']).default('brief')
    }))
    .mutation(({ input }) => summarizeConversation(input)),

  // AI Context and RAG
  createAIContext: publicProcedure
    .input(createAIContextInputSchema)
    .mutation(({ input }) => createAIContext(input)),

  searchAIContext: publicProcedure
    .input(searchAIContextInputSchema)
    .query(({ input }) => searchAIContext(input)),

  // Meeting and scheduling
  createMeeting: publicProcedure
    .input(createMeetingInputSchema)
    .mutation(({ input }) => createMeeting(input)),

  updateMeeting: publicProcedure
    .input(updateMeetingInputSchema)
    .mutation(({ input }) => updateMeeting(input)),

  getUserMeetings: publicProcedure
    .input(z.object({ 
      userId: z.string(), 
      upcoming: z.boolean().default(true) 
    }))
    .query(({ input }) => getUserMeetings(input.userId, input.upcoming)),

  aiMeetingSuggestions: publicProcedure
    .input(z.object({ 
      chatId: z.string(), 
      userId: z.string() 
    }))
    .query(({ input }) => aiMeetingSuggestions(input.chatId, input.userId)),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      // Enable CORS for all origins in development
      cors({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
      })(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  
  server.listen(port);
  console.log(`🚀 AI-Native Chat TRPC server listening at port: ${port}`);
  console.log(`📱 Features: Multimodal AI, Voice/Image processing, Real-time translation, Smart scheduling`);
  console.log(`🔒 Privacy: End-to-end encryption, Local inference, Vector RAG`);
}

start();