import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, aiContextTable } from '../db/schema';
import { type TranslateMessageInput } from '../handlers/translate_message';
import { translateMessage } from '../handlers/translate_message';
import { eq, and } from 'drizzle-orm';

// Test user data
const testUser = {
    email: 'translator@test.com',
    display_name: 'Translation Tester',
    preferences: {
        language: 'en',
        timezone: 'UTC',
        ai_assistance_level: 'moderate' as const,
        voice_enabled: false,
        encryption_enabled: true
    }
};

describe('translateMessage', () => {
    let userId: string;
    
    beforeEach(async () => {
        await createDB();
        
        // Create test user
        const users = await db.insert(usersTable)
            .values(testUser)
            .returning()
            .execute();
        
        userId = users[0].id;
    });
    
    afterEach(resetDB);

    it('should translate English to Spanish', async () => {
        const input: TranslateMessageInput = {
            message: 'Hello world',
            from_language: 'en',
            to_language: 'es',
            user_id: userId,
            preserve_tone: true
        };

        const result = await translateMessage(input);

        expect(result.translated_text).toEqual('Hola mundo');
        expect(result.confidence).toBeGreaterThan(0.9);
        expect(result.tone_preserved).toBe(true);
        expect(result.detected_language).toBeUndefined(); // Not auto-detection
    });

    it('should translate English to French', async () => {
        const input: TranslateMessageInput = {
            message: 'Hello world',
            from_language: 'en',
            to_language: 'fr',
            user_id: userId,
            preserve_tone: true
        };

        const result = await translateMessage(input);

        expect(result.translated_text).toEqual('Bonjour monde');
        expect(result.confidence).toBeGreaterThan(0.9);
        expect(result.tone_preserved).toBe(true);
    });

    it('should translate Spanish to English', async () => {
        const input: TranslateMessageInput = {
            message: 'Hola mundo',
            from_language: 'es',
            to_language: 'en',
            user_id: userId,
            preserve_tone: false
        };

        const result = await translateMessage(input);

        expect(result.translated_text).toEqual('Hello world');
        expect(result.confidence).toBeGreaterThan(0.9);
        expect(result.tone_preserved).toBe(false);
    });

    it('should detect language when from_language is auto', async () => {
        const input: TranslateMessageInput = {
            message: 'Hola mundo',
            from_language: 'auto',
            to_language: 'en',
            user_id: userId,
            preserve_tone: true
        };

        const result = await translateMessage(input);

        expect(result.translated_text).toEqual('Hello world');
        expect(result.detected_language).toEqual('es');
        expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should handle same language translation', async () => {
        const input: TranslateMessageInput = {
            message: 'Hello world',
            from_language: 'en',
            to_language: 'en',
            user_id: userId,
            preserve_tone: true
        };

        const result = await translateMessage(input);

        expect(result.translated_text).toEqual('Hello world');
        expect(result.confidence).toEqual(1.0);
        expect(result.tone_preserved).toBe(true);
    });

    it('should cache translation results', async () => {
        const input: TranslateMessageInput = {
            message: 'Hello world',
            from_language: 'en',
            to_language: 'es',
            user_id: userId,
            preserve_tone: true
        };

        // First translation
        const result1 = await translateMessage(input);
        expect(result1.translated_text).toEqual('Hola mundo');

        // Check that cache entry was created
        const cacheEntries = await db.select()
            .from(aiContextTable)
            .where(and(
                eq(aiContextTable.user_id, userId),
                eq(aiContextTable.context_type, 'translation_cache')
            ))
            .execute();

        expect(cacheEntries).toHaveLength(1);
        expect(parseFloat(cacheEntries[0].relevance_score.toString())).toBeGreaterThan(0.9);

        // Second translation should use cache
        const result2 = await translateMessage(input);
        expect(result2.translated_text).toEqual('Hola mundo');
        expect(result2.confidence).toBeGreaterThan(0.9);

        // Should still have only one cache entry
        const cacheEntriesAfter = await db.select()
            .from(aiContextTable)
            .where(and(
                eq(aiContextTable.user_id, userId),
                eq(aiContextTable.context_type, 'translation_cache')
            ))
            .execute();

        expect(cacheEntriesAfter).toHaveLength(1);
    });

    it('should handle complex phrases with tone preservation', async () => {
        const input: TranslateMessageInput = {
            message: 'Good morning world',
            from_language: 'en',
            to_language: 'es',
            user_id: userId,
            preserve_tone: true
        };

        const result = await translateMessage(input);

        expect(result.translated_text).toEqual('Buenos días mundo');
        expect(result.confidence).toBeGreaterThan(0.9);
        expect(result.tone_preserved).toBe(true);
    });

    it('should handle unknown language combinations gracefully', async () => {
        const input: TranslateMessageInput = {
            message: 'Hello world',
            from_language: 'unknown',
            to_language: 'also_unknown',
            user_id: userId,
            preserve_tone: false
        };

        const result = await translateMessage(input);

        // Should return original text when translation not available
        expect(result.translated_text).toEqual('Hello world');
        expect(result.confidence).toBeLessThan(0.5);
        expect(result.tone_preserved).toBe(false);
    });

    it('should set proper cache expiration', async () => {
        const input: TranslateMessageInput = {
            message: 'Test message',
            from_language: 'en',
            to_language: 'es',
            user_id: userId,
            preserve_tone: true
        };

        await translateMessage(input);

        const cacheEntries = await db.select()
            .from(aiContextTable)
            .where(and(
                eq(aiContextTable.user_id, userId),
                eq(aiContextTable.context_type, 'translation_cache')
            ))
            .execute();

        expect(cacheEntries).toHaveLength(1);
        expect(cacheEntries[0].expires_at).toBeInstanceOf(Date);
        
        // Cache should expire approximately 24 hours from now
        const now = new Date();
        const expiresAt = cacheEntries[0].expires_at!;
        const hoursDiff = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
        
        expect(hoursDiff).toBeGreaterThan(23);
        expect(hoursDiff).toBeLessThan(25);
    });

    it('should handle auto-detection for different languages', async () => {
        const testCases = [
            { message: 'Bonjour monde', expectedLang: 'fr', translation: 'Hello world' },
            { message: 'Hallo welt', expectedLang: 'de', translation: 'Hello world' },
            { message: 'Hello world', expectedLang: 'en', translation: 'Hola mundo' }
        ];

        for (const testCase of testCases) {
            const input: TranslateMessageInput = {
                message: testCase.message,
                from_language: 'auto',
                to_language: testCase.expectedLang === 'en' ? 'es' : 'en',
                user_id: userId,
                preserve_tone: true
            };

            const result = await translateMessage(input);

            expect(result.detected_language).toEqual(testCase.expectedLang);
            expect(result.translated_text).toEqual(testCase.translation);
        }
    });

    it('should store translation metadata correctly in cache', async () => {
        const input: TranslateMessageInput = {
            message: 'Hello world',
            from_language: 'auto',
            to_language: 'es',
            user_id: userId,
            preserve_tone: true
        };

        await translateMessage(input);

        const cacheEntries = await db.select()
            .from(aiContextTable)
            .where(and(
                eq(aiContextTable.user_id, userId),
                eq(aiContextTable.context_type, 'translation_cache')
            ))
            .execute();

        expect(cacheEntries).toHaveLength(1);
        
        // Check that embedding_vector is stored as JSON object (jsonb field)
        expect(cacheEntries[0].embedding_vector).toBeDefined();
        expect(typeof cacheEntries[0].embedding_vector).toBe('object');
        
        const cacheData = cacheEntries[0].embedding_vector as any;
        expect(cacheData.translated_text).toEqual('Hola mundo');
        expect(cacheData.detected_language).toEqual('en');
        expect(cacheData.original_message).toEqual('Hello world');
        expect(cacheData.from_language).toEqual('auto');
        expect(cacheData.to_language).toEqual('es');
    });
});