import { db } from '../db';
import { aiContextTable } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export interface TranslateMessageInput {
    message: string;
    from_language: string;
    to_language: string;
    user_id: string;
    preserve_tone: boolean;
}

export interface TranslateMessageResponse {
    translated_text: string;
    confidence: number;
    detected_language?: string;
    tone_preserved: boolean;
}

// Mock translation service - in real implementation, this would call external AI service
const mockTranslationService = async (
    text: string, 
    fromLang: string, 
    toLang: string, 
    preserveTone: boolean
): Promise<{ translated: string; confidence: number; detectedLang?: string }> => {
    // Simulate language detection for 'auto' mode
    const detectedLanguage = fromLang === 'auto' ? detectLanguage(text) : undefined;
    const actualFromLang = fromLang === 'auto' ? (detectedLanguage || 'en') : fromLang;
    
    // Simple mock translations for testing with proper capitalization
    let translated = text;
    
    if (actualFromLang === 'en' && toLang === 'es') {
        translated = text.replace(/Hello/g, 'Hola').replace(/hello/g, 'hola')
                        .replace(/World/g, 'Mundo').replace(/world/g, 'mundo')
                        .replace(/Good morning/g, 'Buenos días').replace(/good morning/g, 'buenos días');
    } else if (actualFromLang === 'en' && toLang === 'fr') {
        translated = text.replace(/Hello/g, 'Bonjour').replace(/hello/g, 'bonjour')
                        .replace(/World/g, 'Monde').replace(/world/g, 'monde')
                        .replace(/Good morning/g, 'Bonjour').replace(/good morning/g, 'bonjour');
    } else if (actualFromLang === 'en' && toLang === 'de') {
        translated = text.replace(/Hello/g, 'Hallo').replace(/hello/g, 'hallo')
                        .replace(/World/g, 'Welt').replace(/world/g, 'welt')
                        .replace(/Good morning/g, 'Guten morgen').replace(/good morning/g, 'guten morgen');
    } else if (actualFromLang === 'es' && toLang === 'en') {
        translated = text.replace(/Hola/g, 'Hello').replace(/hola/g, 'hello')
                        .replace(/Mundo/g, 'World').replace(/mundo/g, 'world')
                        .replace(/Buenos días/g, 'Good morning').replace(/buenos días/g, 'good morning');
    } else if (actualFromLang === 'es' && toLang === 'fr') {
        translated = text.replace(/Hola/g, 'Bonjour').replace(/hola/g, 'bonjour')
                        .replace(/Mundo/g, 'Monde').replace(/mundo/g, 'monde');
    } else if (actualFromLang === 'fr' && toLang === 'en') {
        translated = text.replace(/Bonjour/g, 'Hello').replace(/bonjour/g, 'hello')
                        .replace(/Monde/g, 'World').replace(/monde/g, 'world');
    } else if (actualFromLang === 'fr' && toLang === 'es') {
        translated = text.replace(/Bonjour/g, 'Hola').replace(/bonjour/g, 'hola')
                        .replace(/Monde/g, 'Mundo').replace(/monde/g, 'mundo');
    } else if (actualFromLang === 'de' && toLang === 'en') {
        translated = text.replace(/Hallo/g, 'Hello').replace(/hallo/g, 'hello')
                        .replace(/Welt/g, 'World').replace(/welt/g, 'world');
    }
    
    // Return original if same language
    if (actualFromLang === toLang) {
        return { translated: text, confidence: 1.0, detectedLang: detectedLanguage };
    }
    
    const confidence = translated !== text ? 0.95 : 0.3; // Higher confidence for actual translations
    
    return { translated, confidence, detectedLang: detectedLanguage };
};

// Simple language detection mock
const detectLanguage = (text: string): string => {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('hola') || lowerText.includes('mundo') || lowerText.includes('días')) {
        return 'es';
    }
    if (lowerText.includes('bonjour') || lowerText.includes('monde')) {
        return 'fr';
    }
    if (lowerText.includes('hallo') || lowerText.includes('welt')) {
        return 'de';
    }
    return 'en'; // Default to English
};

// Generate cache key for translation
const generateCacheKey = (message: string, fromLang: string, toLang: string): string => {
    // Simple hash-like key generation
    const content = `${message}_${fromLang}_${toLang}`;
    return content.replace(/\s+/g, '_').substring(0, 100);
};

export const translateMessage = async (input: TranslateMessageInput): Promise<TranslateMessageResponse> => {
    try {
        const { message, from_language, to_language, user_id, preserve_tone } = input;
        
        // Generate cache key for this translation
        const cacheKey = generateCacheKey(message, from_language, to_language);
        
        // Check for cached translation in AI context
        const cachedTranslations = await db.select()
            .from(aiContextTable)
            .where(and(
                eq(aiContextTable.user_id, user_id),
                eq(aiContextTable.context_type, 'translation_cache'),
                eq(aiContextTable.content, cacheKey)
            ))
            .limit(1)
            .execute();
        
        if (cachedTranslations.length > 0) {
            const cached = cachedTranslations[0];
            // embedding_vector is stored as jsonb, so it comes back as an object
            const cachedData = cached.embedding_vector as any || {};
            
            return {
                translated_text: cachedData.translated_text || message,
                confidence: parseFloat(cached.relevance_score.toString()),
                detected_language: cachedData.detected_language,
                tone_preserved: preserve_tone
            };
        }
        
        // Perform translation using mock service
        const translationResult = await mockTranslationService(
            message, 
            from_language, 
            to_language, 
            preserve_tone
        );
        
        // Cache the translation result
        const cacheData = {
            translated_text: translationResult.translated,
            detected_language: translationResult.detectedLang,
            original_message: message,
            from_language,
            to_language
        };
        
        // Set cache expiration to 24 hours from now
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        
        await db.insert(aiContextTable)
            .values({
                user_id,
                context_type: 'translation_cache',
                content: cacheKey,
                embedding_vector: cacheData, // Store as object since it's jsonb
                relevance_score: translationResult.confidence,
                expires_at: expiresAt
            })
            .execute();
        
        return {
            translated_text: translationResult.translated,
            confidence: translationResult.confidence,
            detected_language: translationResult.detectedLang,
            tone_preserved: preserve_tone
        };
        
    } catch (error) {
        console.error('Translation failed:', error);
        throw error;
    }
};