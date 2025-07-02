
// MAAT v1.0.8 - Contratos de Validación: Clasificación
// Esquemas Zod para validación runtime de todas las operaciones

import { z } from 'zod';

// Schema base para documentos
export const ClassificationDocumentSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255),
  content: z.string().optional(),
  category: z.string().min(1).max(100),
  fileType: z.string().min(1).max(50),
  size: z.number().positive(),
  hash: z.string().min(1),
  projectId: z.string().uuid(),
  classificationScore: z.number().min(0).max(1).optional(),
  metadata: z.record(z.any()).optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

// Request schemas
export const ClassifyDocumentRequestSchema = z.object({
  document: ClassificationDocumentSchema.omit({ 
    id: true, 
    createdAt: true, 
    updatedAt: true 
  }),
  options: z.object({
    useCache: z.boolean().default(true),
    confidenceThreshold: z.number().min(0).max(1).default(0.7),
    enableAdvancedAnalysis: z.boolean().default(false)
  }).optional()
});

export const BatchClassifyRequestSchema = z.object({
  documents: z.array(ClassificationDocumentSchema.omit({ 
    id: true, 
    createdAt: true, 
    updatedAt: true 
  })).min(1).max(100),
  options: z.object({
    useCache: z.boolean().default(true),
    confidenceThreshold: z.number().min(0).max(1).default(0.7),
    enableAdvancedAnalysis: z.boolean().default(false),
    parallelProcessing: z.boolean().default(true)
  }).optional()
});

// Response schemas
export const ClassificationResultSchema = z.object({
  documentId: z.string().uuid(),
  predictedCategory: z.string(),
  confidence: z.number().min(0).max(1),
  alternativeCategories: z.array(z.object({
    category: z.string(),
    confidence: z.number().min(0).max(1)
  })).max(5),
  processingTime: z.number().positive(),
  cacheHit: z.boolean(),
  metadata: z.object({
    modelVersion: z.string(),
    features: z.array(z.string()).optional(),
    entities: z.array(z.object({
      type: z.string(),
      value: z.string(),
      confidence: z.number().min(0).max(1)
    })).optional()
  })
});

export const ClassifyDocumentResponseSchema = z.object({
  success: z.boolean(),
  result: ClassificationResultSchema.optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional()
  }).optional(),
  timestamp: z.date(),
  requestId: z.string().uuid()
});

export const BatchClassifyResponseSchema = z.object({
  success: z.boolean(),
  results: z.array(ClassificationResultSchema),
  summary: z.object({
    totalProcessed: z.number().nonnegative(),
    successful: z.number().nonnegative(),
    failed: z.number().nonnegative(),
    averageConfidence: z.number().min(0).max(1),
    totalProcessingTime: z.number().positive(),
    cacheHitRate: z.number().min(0).max(1)
  }),
  errors: z.array(z.object({
    documentIndex: z.number().nonnegative(),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.any().optional()
    })
  })).optional(),
  timestamp: z.date(),
  requestId: z.string().uuid()
});

// Health check schemas
export const ClassificationHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  modelStatus: z.object({
    loaded: z.boolean(),
    version: z.string(),
    accuracy: z.number().min(0).max(1).optional()
  }),
  cache: z.object({
    hitRate: z.number().min(0).max(1),
    size: z.number().nonnegative(),
    maxSize: z.number().positive()
  }),
  performance: z.object({
    averageProcessingTime: z.number().positive(),
    requestsPerMinute: z.number().nonnegative(),
    errorRate: z.number().min(0).max(1)
  }),
  lastUpdated: z.date()
});

// Type exports
export type ClassificationDocument = z.infer<typeof ClassificationDocumentSchema>;
export type ClassifyDocumentRequest = z.infer<typeof ClassifyDocumentRequestSchema>;
export type BatchClassifyRequest = z.infer<typeof BatchClassifyRequestSchema>;
export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;
export type ClassifyDocumentResponse = z.infer<typeof ClassifyDocumentResponseSchema>;
export type BatchClassifyResponse = z.infer<typeof BatchClassifyResponseSchema>;
export type ClassificationHealth = z.infer<typeof ClassificationHealthSchema>;

// Validation utilities
export const validateClassifyRequest = (data: unknown) => {
  return ClassifyDocumentRequestSchema.safeParse(data);
};

export const validateBatchClassifyRequest = (data: unknown) => {
  return BatchClassifyRequestSchema.safeParse(data);
};

export const createSuccessResponse = (
  result: ClassificationResult,
  requestId: string
): ClassifyDocumentResponse => {
  return {
    success: true,
    result,
    timestamp: new Date(),
    requestId
  };
};

export const createErrorResponse = (
  error: { code: string; message: string; details?: any },
  requestId: string
): ClassifyDocumentResponse => {
  return {
    success: false,
    error,
    timestamp: new Date(),
    requestId
  };
};
