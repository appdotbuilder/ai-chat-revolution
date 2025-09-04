import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { type VoiceTranscriptionInput } from '../schema';
import { voiceTranscription } from '../handlers/voice_transcription';

// Test audio data samples (base64 encoded mock data of different lengths)
const shortAudioData = Buffer.from('short audio sample').toString('base64');
const mediumAudioData = Buffer.from('medium length audio sample with more content to simulate longer speech').toString('base64');
const longAudioData = Buffer.from('this is a much longer audio sample that would represent a longer speech segment with multiple sentences and more complex content that would typically take more time to process and transcribe accurately').toString('base64');

describe('voiceTranscription', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    it('should transcribe short audio successfully', async () => {
        const input: VoiceTranscriptionInput = {
            audio_data: shortAudioData,
            language: 'auto',
            user_id: 'test-user-123'
        };

        const result = await voiceTranscription(input);

        expect(result.transcribed_text).toBe('Hello');
        expect(result.language_detected).toBe('en');
        expect(result.confidence).toBeGreaterThanOrEqual(0.60);
        expect(result.confidence).toBeLessThanOrEqual(0.99);
        expect(result.duration).toBeGreaterThan(0);
        expect(result.speaker_id).toBe('test-user-123');
    });

    it('should transcribe medium length audio with appropriate confidence', async () => {
        const input: VoiceTranscriptionInput = {
            audio_data: mediumAudioData,
            language: 'auto',
            user_id: 'test-user-456'
        };

        const result = await voiceTranscription(input);

        expect(result.transcribed_text).toBe('Hello, how are you doing today?');
        expect(result.language_detected).toBe('en');
        expect(result.confidence).toBeGreaterThanOrEqual(0.60);
        expect(result.confidence).toBeLessThanOrEqual(0.99);
        expect(result.duration).toBeGreaterThan(0);
        expect(result.speaker_id).toBe('test-user-456');
    });

    it('should transcribe long audio with lower confidence', async () => {
        const input: VoiceTranscriptionInput = {
            audio_data: longAudioData,
            language: 'auto',
            user_id: 'test-user-789'
        };

        const result = await voiceTranscription(input);

        expect(result.transcribed_text).toContain('Hello, how are you doing today?');
        expect(result.transcribed_text).toContain('upcoming meeting');
        expect(result.transcribed_text).toContain('schedule');
        expect(result.language_detected).toBe('en');
        expect(result.confidence).toBeGreaterThanOrEqual(0.60);
        expect(result.confidence).toBeLessThanOrEqual(0.99);
        expect(result.duration).toBeGreaterThan(0);
        expect(result.speaker_id).toBe('test-user-789');
    });

    it('should respect specified language when not auto', async () => {
        const input: VoiceTranscriptionInput = {
            audio_data: mediumAudioData,
            language: 'es',
            user_id: 'test-user-es'
        };

        const result = await voiceTranscription(input);

        expect(result.language_detected).toBe('es');
        expect(result.transcribed_text).toBeDefined();
        expect(result.confidence).toBeGreaterThanOrEqual(0.60);
        expect(result.speaker_id).toBe('test-user-es');
    });

    it('should use default language when auto is specified', async () => {
        const input: VoiceTranscriptionInput = {
            audio_data: shortAudioData,
            language: 'auto',
            user_id: 'test-user-auto'
        };

        const result = await voiceTranscription(input);

        expect(result.language_detected).toBe('en');
        expect(result.transcribed_text).toBeDefined();
        expect(result.confidence).toBeGreaterThanOrEqual(0.60);
        expect(result.speaker_id).toBe('test-user-auto');
    });

    it('should handle confidence bounds correctly', async () => {
        const input: VoiceTranscriptionInput = {
            audio_data: longAudioData,
            language: 'auto',
            user_id: 'test-user-confidence'
        };

        const result = await voiceTranscription(input);

        expect(result.confidence).toBeGreaterThanOrEqual(0.60);
        expect(result.confidence).toBeLessThanOrEqual(0.99);
        expect(typeof result.confidence).toBe('number');
    });

    it('should calculate duration based on audio data length', async () => {
        const inputs = [
            { audio_data: shortAudioData, user_id: 'user1' },
            { audio_data: mediumAudioData, user_id: 'user2' },
            { audio_data: longAudioData, user_id: 'user3' }
        ];

        const results = await Promise.all(
            inputs.map(input => voiceTranscription({ ...input, language: 'auto' }))
        );

        // Longer audio should generally have longer duration
        expect(results[0].duration).toBeLessThan(results[2].duration);
        expect(results[1].duration).toBeLessThan(results[2].duration);
        
        // All durations should be positive
        results.forEach(result => {
            expect(result.duration).toBeGreaterThan(0);
        });
    });

    it('should throw error for empty audio data', async () => {
        const input: VoiceTranscriptionInput = {
            audio_data: '',
            language: 'auto',
            user_id: 'test-user'
        };

        await expect(voiceTranscription(input)).rejects.toThrow(/audio data is required/i);
    });

    it('should throw error for whitespace-only audio data', async () => {
        const input: VoiceTranscriptionInput = {
            audio_data: '   ',
            language: 'auto',
            user_id: 'test-user'
        };

        await expect(voiceTranscription(input)).rejects.toThrow(/audio data is required/i);
    });

    it('should throw error for empty user_id', async () => {
        const input: VoiceTranscriptionInput = {
            audio_data: shortAudioData,
            language: 'auto',
            user_id: ''
        };

        await expect(voiceTranscription(input)).rejects.toThrow(/user id is required/i);
    });

    it('should throw error for whitespace-only user_id', async () => {
        const input: VoiceTranscriptionInput = {
            audio_data: shortAudioData,
            language: 'auto',
            user_id: '   '
        };

        await expect(voiceTranscription(input)).rejects.toThrow(/user id is required/i);
    });

    it('should handle different language codes correctly', async () => {
        const languages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'];
        
        const results = await Promise.all(
            languages.map(lang => voiceTranscription({
                audio_data: mediumAudioData,
                language: lang,
                user_id: `test-user-${lang}`
            }))
        );

        results.forEach((result, index) => {
            expect(result.language_detected).toBe(languages[index]);
            expect(result.transcribed_text).toBeDefined();
            expect(result.confidence).toBeGreaterThanOrEqual(0.60);
            expect(result.speaker_id).toBe(`test-user-${languages[index]}`);
        });
    });

    it('should maintain consistent response structure', async () => {
        const input: VoiceTranscriptionInput = {
            audio_data: mediumAudioData,
            language: 'auto',
            user_id: 'test-user-structure'
        };

        const result = await voiceTranscription(input);

        // Verify all required fields exist
        expect(result).toHaveProperty('transcribed_text');
        expect(result).toHaveProperty('language_detected');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('duration');
        expect(result).toHaveProperty('speaker_id');

        // Verify field types
        expect(typeof result.transcribed_text).toBe('string');
        expect(typeof result.language_detected).toBe('string');
        expect(typeof result.confidence).toBe('number');
        expect(typeof result.duration).toBe('number');
        expect(typeof result.speaker_id).toBe('string');

        // Verify non-empty values
        expect(result.transcribed_text.length).toBeGreaterThan(0);
        expect(result.language_detected.length).toBeGreaterThan(0);
        expect(result.speaker_id!.length).toBeGreaterThan(0);
    });
});