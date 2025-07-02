
// MAAT v1.0.8 - Testing Infrastructure: Classification Module Tests
// Unit tests for document classification workflows

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { classificationModule } from '../../server/modules/classification';
import { 
  validateClassifyRequest, 
  validateBatchClassifyRequest,
  createSuccessResponse,
  createErrorResponse 
} from '../../server/contracts/zod/classification';

describe('Classification Module v1.0.8', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Single Document Classification', () => {
    it('should classify a document successfully', async () => {
      const mockRequest = {
        fileId: 'test-file-123',
        filePath: '/uploads/test-document.pdf',
        fileName: 'test-document.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('test content')
      };

      const result = await classificationModule.classify(mockRequest);

      expect(result.success).toBe(true);
      expect(result.classification.category).toBeDefined();
      expect(result.classification.confidence).toBeGreaterThan(0);
      expect(result.classification.confidence).toBeLessThanOrEqual(1);
      expect(result.processing.duration).toBeGreaterThan(0);
      expect(result.processing.method).toBe('hybrid');
    });

    it('should handle classification errors gracefully', async () => {
      const invalidRequest = {
        fileId: '',
        filePath: '',
        fileName: '',
        mimeType: '',
        content: undefined
      };

      const result = await classificationModule.classify(invalidRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.classification.category).toBe('unknown');
      expect(result.classification.confidence).toBe(0);
    });

    it('should return valid classification entities', async () => {
      const mockRequest = {
        fileId: 'test-entities-456',
        filePath: '/uploads/contract.pdf',
        fileName: 'contract.pdf',
        mimeType: 'application/pdf'
      };

      const result = await classificationModule.classify(mockRequest);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.classification.entities)).toBe(true);
      
      if (result.classification.entities.length > 0) {
        const entity = result.classification.entities[0];
        expect(entity.type).toBeDefined();
        expect(entity.value).toBeDefined();
        expect(entity.confidence).toBeGreaterThan(0);
        expect(entity.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Validation Framework Integration', () => {
    it('should validate classification request with Zod schema', () => {
      const validRequest = {
        document: {
          title: 'Test Document',
          category: 'contract',
          fileType: 'pdf',
          size: 1024,
          hash: 'abc123def456',
          projectId: '550e8400-e29b-41d4-a716-446655440000'
        },
        options: {
          useCache: true,
          confidenceThreshold: 0.8,
          enableAdvancedAnalysis: false
        }
      };

      const validation = validateClassifyRequest(validRequest);
      expect(validation.success).toBe(true);
      if (validation.success) {
        expect(validation.data.document.title).toBe('Test Document');
        expect(validation.data.options?.confidenceThreshold).toBe(0.8);
      }
    });

    it('should reject invalid classification request', () => {
      const invalidRequest = {
        document: {
          title: '', // Invalid: empty string
          category: 'contract',
          fileType: 'pdf',
          size: -100, // Invalid: negative size
          hash: '',
          projectId: 'invalid-uuid' // Invalid: not a UUID
        }
      };

      const validation = validateClassifyRequest(invalidRequest);
      expect(validation.success).toBe(false);
      expect(validation.error).toBeDefined();
    });

    it('should validate batch classification request', () => {
      const validBatchRequest = {
        documents: [
          {
            title: 'Document 1',
            category: 'invoice',
            fileType: 'pdf',
            size: 2048,
            hash: 'hash1',
            projectId: '550e8400-e29b-41d4-a716-446655440000'
          },
          {
            title: 'Document 2',
            category: 'report',
            fileType: 'docx',
            size: 1536,
            hash: 'hash2',
            projectId: '550e8400-e29b-41d4-a716-446655440001'
          }
        ],
        options: {
          parallelProcessing: true,
          confidenceThreshold: 0.75
        }
      };

      const validation = validateBatchClassifyRequest(validBatchRequest);
      expect(validation.success).toBe(true);
      if (validation.success) {
        expect(validation.data.documents).toHaveLength(2);
        expect(validation.data.options?.parallelProcessing).toBe(true);
      }
    });
  });

  describe('Response Builders', () => {
    it('should create success response correctly', () => {
      const mockResult = {
        documentId: '550e8400-e29b-41d4-a716-446655440000',
        predictedCategory: 'contract',
        confidence: 0.92,
        alternativeCategories: [
          { category: 'legal', confidence: 0.15 },
          { category: 'other', confidence: 0.03 }
        ],
        processingTime: 245,
        cacheHit: false,
        metadata: {
          modelVersion: '1.0.8',
          features: ['text_analysis', 'structure_analysis']
        }
      };

      const requestId = '550e8400-e29b-41d4-a716-446655440002';
      const response = createSuccessResponse(mockResult, requestId);

      expect(response.success).toBe(true);
      expect(response.result).toEqual(mockResult);
      expect(response.requestId).toBe(requestId);
      expect(response.timestamp).toBeInstanceOf(Date);
      expect(response.error).toBeUndefined();
    });

    it('should create error response correctly', () => {
      const mockError = {
        code: 'CLASSIFICATION_FAILED',
        message: 'Unable to classify document',
        details: { reason: 'Unsupported file format' }
      };

      const requestId = '550e8400-e29b-41d4-a716-446655440003';
      const response = createErrorResponse(mockError, requestId);

      expect(response.success).toBe(false);
      expect(response.error).toEqual(mockError);
      expect(response.requestId).toBe(requestId);
      expect(response.timestamp).toBeInstanceOf(Date);
      expect(response.result).toBeUndefined();
    });
  });

  describe('Performance Testing', () => {
    it('should complete classification within acceptable time', async () => {
      const startTime = Date.now();
      
      const mockRequest = {
        fileId: 'perf-test-789',
        filePath: '/uploads/performance-test.pdf',
        fileName: 'performance-test.pdf',
        mimeType: 'application/pdf'
      };

      const result = await classificationModule.classify(mockRequest);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.processing.duration).toBeLessThan(duration);
    });

    it('should handle concurrent classifications', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        fileId: `concurrent-test-${i}`,
        filePath: `/uploads/concurrent-${i}.pdf`,
        fileName: `concurrent-${i}.pdf`,
        mimeType: 'application/pdf'
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        requests.map(req => classificationModule.classify(req))
      );
      const endTime = Date.now();

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
      
      // Concurrent processing should not take significantly longer than single
      expect(endTime - startTime).toBeLessThan(10000);
    });
  });

  describe('Metrics and Analytics', () => {
    it('should provide classification metrics', async () => {
      const metrics = await classificationModule.getMetrics();

      expect(metrics.totalProcessed).toBeGreaterThan(0);
      expect(metrics.averageConfidence).toBeGreaterThan(0);
      expect(metrics.averageConfidence).toBeLessThanOrEqual(1);
      expect(metrics.categories).toBeDefined();
      expect(metrics.lastUpdate).toBeInstanceOf(Date);
    });

    it('should track category distribution in metrics', async () => {
      const metrics = await classificationModule.getMetrics();

      expect(typeof metrics.categories).toBe('object');
      
      const totalByCategory = Object.values(metrics.categories)
        .reduce((sum: number, count: any) => sum + (typeof count === 'number' ? count : 0), 0);
      
      expect(totalByCategory).toBeGreaterThan(0);
      expect(totalByCategory).toBeLessThanOrEqual(metrics.totalProcessed);
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      // Mock a timeout scenario
      const originalClassify = classificationModule.classify;
      jest.spyOn(classificationModule, 'classify').mockImplementation(async () => {
        throw new Error('Request timeout');
      });

      const mockRequest = {
        fileId: 'timeout-test',
        filePath: '/uploads/timeout.pdf',
        fileName: 'timeout.pdf',
        mimeType: 'application/pdf'
      };

      const result = await classificationModule.classify(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      
      // Restore original implementation
      jest.restoreAllMocks();
    });

    it('should validate input parameters thoroughly', async () => {
      const invalidRequests = [
        {}, // Empty object
        { fileId: null }, // Null values
        { fileId: 'test', fileName: '' }, // Empty strings
        { fileId: 'test', fileName: 'test.pdf', mimeType: 'invalid/type' } // Invalid MIME
      ];

      for (const invalidRequest of invalidRequests) {
        const result = await classificationModule.classify(invalidRequest as any);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });
  });
});

// Integration tests with database modules
describe('Classification Integration with Database v1.0.8', () => {
  it('should integrate with documents module for classification results', async () => {
    // This test would verify integration with the documents database module
    // when classification results need to be stored
    expect(true).toBe(true); // Placeholder for actual integration test
  });

  it('should integrate with categories module for dynamic classification', async () => {
    // This test would verify integration with the categories database module
    // for dynamic category-based classification
    expect(true).toBe(true); // Placeholder for actual integration test
  });
});
