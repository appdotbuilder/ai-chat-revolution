import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { type ImageAnalysisInput } from '../schema';
import { imageAnalysis, type ImageAnalysisResponse } from '../handlers/image_analysis';

// Mock base64 image data for testing
const createMockImageData = (format: string, size: 'small' | 'medium' | 'large'): string => {
    const baseData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    let mockData: string;
    
    switch (size) {
        case 'small':
            mockData = baseData;
            break;
        case 'medium':
            mockData = baseData + baseData.repeat(100);
            break;
        case 'large':
            mockData = baseData + baseData.repeat(500);
            break;
    }
    
    return `data:image/${format};base64,${mockData}`;
};

describe('imageAnalysis', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    describe('input validation', () => {
        it('should reject invalid image data format', async () => {
            const input: ImageAnalysisInput = {
                image_data: 'invalid-data',
                user_id: 'user-123',
                analysis_type: 'describe'
            };

            await expect(imageAnalysis(input)).rejects.toThrow(/invalid image data format/i);
        });

        it('should reject unsupported image formats', async () => {
            const input: ImageAnalysisInput = {
                image_data: 'data:image/bmp;base64,dGVzdA==',
                user_id: 'user-123',
                analysis_type: 'describe'
            };

            await expect(imageAnalysis(input)).rejects.toThrow(/unsupported image format/i);
        });

        it('should reject missing base64 data', async () => {
            const input: ImageAnalysisInput = {
                image_data: 'data:image/jpeg;base64,',
                user_id: 'user-123',
                analysis_type: 'describe'
            };

            await expect(imageAnalysis(input)).rejects.toThrow(/invalid base64 image data/i);
        });

        it('should reject images that are too large', async () => {
            // Create a very large base64 string (simulate >10MB)
            const largeData = 'A'.repeat(15000000); // ~15MB when base64 decoded
            const input: ImageAnalysisInput = {
                image_data: `data:image/jpeg;base64,${largeData}`,
                user_id: 'user-123',
                analysis_type: 'describe'
            };

            await expect(imageAnalysis(input)).rejects.toThrow(/image too large/i);
        });

        it('should reject unknown analysis types', async () => {
            const input = {
                image_data: createMockImageData('jpeg', 'medium'),
                user_id: 'user-123',
                analysis_type: 'unknown_type' as any
            };

            await expect(imageAnalysis(input)).rejects.toThrow(/unknown analysis type/i);
        });
    });

    describe('image description analysis', () => {
        it('should provide description for small image', async () => {
            const input: ImageAnalysisInput = {
                image_data: createMockImageData('jpeg', 'small'),
                user_id: 'user-123',
                analysis_type: 'describe'
            };

            const result = await imageAnalysis(input);

            expect(result.description).toContain('small');
            expect(result.description).toContain('clear');
            expect(result.confidence).toEqual(0.88);
            expect(result.content_type).toEqual('image/jpeg');
            expect(result.extracted_text).toBeUndefined();
            expect(result.sentiment).toBeUndefined();
            expect(result.context_tags).toBeUndefined();
        });

        it('should provide description for medium image', async () => {
            const input: ImageAnalysisInput = {
                image_data: createMockImageData('png', 'medium'),
                user_id: 'user-123',
                analysis_type: 'describe'
            };

            const result = await imageAnalysis(input);

            expect(result.description).toContain('medium-sized');
            expect(result.description).toContain('moderate detail');
            expect(result.confidence).toEqual(0.88);
            expect(result.content_type).toEqual('image/png');
        });

        it('should provide description for large image', async () => {
            const input: ImageAnalysisInput = {
                image_data: createMockImageData('webp', 'large'),
                user_id: 'user-123',
                analysis_type: 'describe'
            };

            const result = await imageAnalysis(input);

            expect(result.description).toContain('high-resolution');
            expect(result.description).toContain('detailed');
            expect(result.confidence).toEqual(0.88);
            expect(result.content_type).toEqual('image/webp');
        });
    });

    describe('text extraction analysis', () => {
        it('should extract text from PNG screenshot', async () => {
            const input: ImageAnalysisInput = {
                image_data: createMockImageData('png', 'large'),
                user_id: 'user-123',
                analysis_type: 'text_extract'
            };

            const result = await imageAnalysis(input);

            expect(result.extracted_text).toContain('Meeting Notes');
            expect(result.extracted_text).toContain('Action items');
            expect(result.confidence).toEqual(0.92);
            expect(result.content_type).toEqual('image/png');
            expect(result.description).toBeUndefined();
        });

        it('should extract text from large JPEG', async () => {
            const input: ImageAnalysisInput = {
                image_data: createMockImageData('jpeg', 'large'),
                user_id: 'user-123',
                analysis_type: 'text_extract'
            };

            const result = await imageAnalysis(input);

            expect(result.extracted_text).toContain('BUSINESS PRESENTATION');
            expect(result.extracted_text).toContain('Revenue growth');
            expect(result.confidence).toEqual(0.92);
        });

        it('should extract basic text from small image', async () => {
            const input: ImageAnalysisInput = {
                image_data: createMockImageData('gif', 'small'),
                user_id: 'user-123',
                analysis_type: 'text_extract'
            };

            const result = await imageAnalysis(input);

            expect(result.extracted_text).toContain('Quick note');
            expect(result.extracted_text).toContain('short text');
            expect(result.confidence).toEqual(0.92);
            expect(result.content_type).toEqual('image/gif');
        });
    });

    describe('sentiment analysis', () => {
        it('should detect neutral sentiment in small image', async () => {
            const input: ImageAnalysisInput = {
                image_data: createMockImageData('png', 'small'),
                user_id: 'user-123',
                analysis_type: 'sentiment'
            };

            const result = await imageAnalysis(input);

            expect(result.sentiment).toEqual('neutral');
            expect(result.description).toContain('neutral content');
            expect(result.confidence).toEqual(0.87);
            expect(result.extracted_text).toBeUndefined();
            expect(result.context_tags).toBeUndefined();
        });

        it('should detect positive sentiment in large JPEG', async () => {
            const input: ImageAnalysisInput = {
                image_data: createMockImageData('jpeg', 'large'),
                user_id: 'user-123',
                analysis_type: 'sentiment'
            };

            const result = await imageAnalysis(input);

            expect(result.sentiment).toEqual('positive');
            expect(result.description).toContain('bright colors');
            expect(result.description).toContain('positive sentiment');
            expect(result.confidence).toEqual(0.91);
        });

        it('should detect mixed sentiment in medium image', async () => {
            const input: ImageAnalysisInput = {
                image_data: createMockImageData('png', 'medium'),
                user_id: 'user-123',
                analysis_type: 'sentiment'
            };

            const result = await imageAnalysis(input);

            expect(result.sentiment).toEqual('mixed');
            expect(result.description).toContain('mixed sentiment');
            expect(result.confidence).toEqual(0.84);
        });
    });

    describe('context analysis', () => {
        it('should identify document context in large PNG', async () => {
            const input: ImageAnalysisInput = {
                image_data: createMockImageData('png', 'large'),
                user_id: 'user-123',
                analysis_type: 'context'
            };

            const result = await imageAnalysis(input);

            expect(result.context_tags).toEqual(['document', 'screenshot', 'presentation', 'business', 'meeting']);
            expect(result.description).toContain('Document or screenshot');
            expect(result.confidence).toEqual(0.93);
            expect(result.sentiment).toBeUndefined();
            expect(result.extracted_text).toBeUndefined();
        });

        it('should identify professional context in large image', async () => {
            const input: ImageAnalysisInput = {
                image_data: createMockImageData('jpeg', 'large'),
                user_id: 'user-123',
                analysis_type: 'context'
            };

            const result = await imageAnalysis(input);

            expect(result.context_tags).toEqual(['photo', 'professional', 'high-quality', 'detailed', 'presentation']);
            expect(result.description).toContain('High-resolution professional');
            expect(result.confidence).toEqual(0.89);
        });

        it('should identify simple UI context in small image', async () => {
            const input: ImageAnalysisInput = {
                image_data: createMockImageData('webp', 'small'),
                user_id: 'user-123',
                analysis_type: 'context'
            };

            const result = await imageAnalysis(input);

            expect(result.context_tags).toEqual(['simple', 'icon', 'graphic', 'minimal', 'ui']);
            expect(result.description).toContain('Simple graphic or icon');
            expect(result.confidence).toEqual(0.86);
        });

        it('should identify general context in medium image', async () => {
            const input: ImageAnalysisInput = {
                image_data: createMockImageData('gif', 'medium'),
                user_id: 'user-123',
                analysis_type: 'context'
            };

            const result = await imageAnalysis(input);

            expect(result.context_tags).toEqual(['general', 'content', 'medium-quality', 'standard']);
            expect(result.description).toContain('Standard image content');
            expect(result.confidence).toEqual(0.82);
        });
    });

    describe('supported formats', () => {
        const supportedFormats = ['jpeg', 'png', 'gif', 'webp'];

        supportedFormats.forEach(format => {
            it(`should handle ${format} format`, async () => {
                const input: ImageAnalysisInput = {
                    image_data: createMockImageData(format, 'medium'),
                    user_id: 'user-123',
                    analysis_type: 'describe'
                };

                const result = await imageAnalysis(input);

                expect(result.content_type).toEqual(`image/${format}`);
                expect(result.confidence).toBeGreaterThan(0);
                expect(result.description).toBeDefined();
            });
        });
    });

    describe('response structure', () => {
        it('should return properly typed response', async () => {
            const input: ImageAnalysisInput = {
                image_data: createMockImageData('jpeg', 'medium'),
                user_id: 'user-123',
                analysis_type: 'describe'
            };

            const result = await imageAnalysis(input);

            expect(typeof result.confidence).toBe('number');
            expect(typeof result.content_type).toBe('string');
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
        });

        it('should have consistent field presence by analysis type', async () => {
            const baseInput = {
                image_data: createMockImageData('png', 'medium'),
                user_id: 'user-123'
            };

            // Test describe type
            const describeResult = await imageAnalysis({
                ...baseInput,
                analysis_type: 'describe'
            });
            expect(describeResult.description).toBeDefined();
            expect(describeResult.extracted_text).toBeUndefined();
            expect(describeResult.sentiment).toBeUndefined();
            expect(describeResult.context_tags).toBeUndefined();

            // Test text_extract type
            const textResult = await imageAnalysis({
                ...baseInput,
                analysis_type: 'text_extract'
            });
            expect(textResult.extracted_text).toBeDefined();
            expect(textResult.description).toBeUndefined();
            expect(textResult.sentiment).toBeUndefined();
            expect(textResult.context_tags).toBeUndefined();

            // Test sentiment type
            const sentimentResult = await imageAnalysis({
                ...baseInput,
                analysis_type: 'sentiment'
            });
            expect(sentimentResult.sentiment).toBeDefined();
            expect(sentimentResult.description).toBeDefined();
            expect(sentimentResult.extracted_text).toBeUndefined();
            expect(sentimentResult.context_tags).toBeUndefined();

            // Test context type
            const contextResult = await imageAnalysis({
                ...baseInput,
                analysis_type: 'context'
            });
            expect(contextResult.context_tags).toBeDefined();
            expect(contextResult.description).toBeDefined();
            expect(contextResult.extracted_text).toBeUndefined();
            expect(contextResult.sentiment).toBeUndefined();
        });
    });
});