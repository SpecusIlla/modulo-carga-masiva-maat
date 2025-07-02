
// MAAT v1.0.8 - Contratos de Validación: Sistema General
// Esquemas Zod para validación runtime de operaciones generales

import { z } from 'zod';

// Base response schema
export const BaseResponseSchema = z.object({
  success: z.boolean(),
  timestamp: z.date(),
  requestId: z.string().uuid(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/)
});

// Error schema
export const ErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.any().optional(),
  stack: z.string().optional()
});

// Pagination schema
export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

// Project validation schemas
export const ProjectRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  status: z.enum(['active', 'archived', 'draft']).default('active'),
  ownerId: z.string().uuid(),
  settings: z.object({
    autoClassification: z.boolean().default(true),
    retentionDays: z.number().positive().default(365),
    allowedFileTypes: z.array(z.string()).default(['pdf', 'docx', 'txt'])
  })
});

export const ProjectResponseSchema = BaseResponseSchema.extend({
  data: z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().optional(),
    status: z.enum(['active', 'archived', 'draft']),
    ownerId: z.string().uuid(),
    settings: z.object({
      autoClassification: z.boolean(),
      retentionDays: z.number(),
      allowedFileTypes: z.array(z.string())
    }),
    analytics: z.object({
      documentsCount: z.number().default(0),
      totalSize: z.number().default(0),
      lastActivity: z.date().optional()
    }).optional(),
    createdAt: z.date(),
    updatedAt: z.date()
  }).optional(),
  error: ErrorSchema.optional()
});

// Document validation schemas
export const DocumentRequestSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().optional(),
  category: z.string().min(1).max(100),
  fileType: z.string().min(1).max(50),
  size: z.number().positive(),
  hash: z.string().min(1),
  projectId: z.string().uuid(),
  metadata: z.record(z.any()).optional()
});

export const DocumentResponseSchema = BaseResponseSchema.extend({
  data: z.object({
    id: z.string().uuid(),
    title: z.string(),
    content: z.string().optional(),
    category: z.string(),
    fileType: z.string(),
    size: z.number(),
    hash: z.string(),
    projectId: z.string().uuid(),
    metadata: z.record(z.any()).optional(),
    createdAt: z.date(),
    updatedAt: z.date()
  }).optional(),
  error: ErrorSchema.optional()
});

// Category validation schemas
export const CategoryRequestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  parentId: z.string().uuid().optional(),
  rules: z.object({
    keywords: z.array(z.string()).default([]),
    fileTypes: z.array(z.string()).default([]),
    sizeRange: z.object({
      min: z.number().optional(),
      max: z.number().optional()
    }).optional()
  }),
  isActive: z.boolean().default(true),
  sortOrder: z.number().default(0)
});

export const CategoryResponseSchema = BaseResponseSchema.extend({
  data: z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().optional(),
    parentId: z.string().uuid().optional(),
    rules: z.object({
      keywords: z.array(z.string()),
      fileTypes: z.array(z.string()),
      sizeRange: z.object({
        min: z.number().optional(),
        max: z.number().optional()
      }).optional()
    }),
    isActive: z.boolean(),
    sortOrder: z.number(),
    createdAt: z.date(),
    updatedAt: z.date()
  }).optional(),
  error: ErrorSchema.optional()
});

// Bulk operations schemas
export const BulkOperationRequestSchema = z.object({
  operation: z.enum(['create', 'update', 'delete']),
  items: z.array(z.any()).min(1).max(100),
  options: z.object({
    validateOnly: z.boolean().default(false),
    skipErrors: z.boolean().default(false),
    batchSize: z.number().positive().default(10)
  }).optional()
});

export const BulkOperationResponseSchema = BaseResponseSchema.extend({
  data: z.object({
    totalItems: z.number(),
    successful: z.number(),
    failed: z.number(),
    results: z.array(z.object({
      index: z.number(),
      success: z.boolean(),
      data: z.any().optional(),
      error: ErrorSchema.optional()
    })),
    summary: z.object({
      processingTime: z.number(),
      successRate: z.number().min(0).max(1)
    })
  }),
  error: ErrorSchema.optional()
});

// Health check schemas
export const HealthCheckResponseSchema = BaseResponseSchema.extend({
  data: z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    services: z.object({
      database: z.object({
        status: z.enum(['connected', 'disconnected', 'error']),
        responseTime: z.number().optional()
      }),
      classification: z.object({
        status: z.enum(['ready', 'loading', 'error']),
        modelVersion: z.string().optional()
      }),
      storage: z.object({
        status: z.enum(['available', 'full', 'error']),
        usedSpace: z.number().optional(),
        totalSpace: z.number().optional()
      })
    }),
    performance: z.object({
      uptime: z.number(),
      memoryUsage: z.number(),
      cpuUsage: z.number().optional()
    }),
    version: z.string(),
    buildHash: z.string()
  })
});

// Search schemas
export const SearchRequestSchema = z.object({
  query: z.string().min(1),
  filters: z.object({
    category: z.string().optional(),
    projectId: z.string().uuid().optional(),
    fileType: z.string().optional(),
    dateRange: z.object({
      from: z.date().optional(),
      to: z.date().optional()
    }).optional()
  }).optional(),
  pagination: PaginationSchema.optional()
});

export const SearchResponseSchema = BaseResponseSchema.extend({
  data: z.object({
    results: z.array(z.any()),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      pages: z.number()
    }),
    facets: z.object({
      categories: z.array(z.object({
        name: z.string(),
        count: z.number()
      })),
      fileTypes: z.array(z.object({
        type: z.string(),
        count: z.number()
      }))
    }).optional()
  }),
  error: ErrorSchema.optional()
});

// Type exports
export type BaseResponse = z.infer<typeof BaseResponseSchema>;
export type ErrorType = z.infer<typeof ErrorSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type ProjectRequest = z.infer<typeof ProjectRequestSchema>;
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;
export type DocumentRequest = z.infer<typeof DocumentRequestSchema>;
export type DocumentResponse = z.infer<typeof DocumentResponseSchema>;
export type CategoryRequest = z.infer<typeof CategoryRequestSchema>;
export type CategoryResponse = z.infer<typeof CategoryResponseSchema>;
export type BulkOperationRequest = z.infer<typeof BulkOperationRequestSchema>;
export type BulkOperationResponse = z.infer<typeof BulkOperationResponseSchema>;
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
export type SearchRequest = z.infer<typeof SearchRequestSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// Validation utilities
export const validatePagination = (data: unknown) => {
  return PaginationSchema.safeParse(data);
};

export const validateProjectRequest = (data: unknown) => {
  return ProjectRequestSchema.safeParse(data);
};

export const validateDocumentRequest = (data: unknown) => {
  return DocumentRequestSchema.safeParse(data);
};

export const validateCategoryRequest = (data: unknown) => {
  return CategoryRequestSchema.safeParse(data);
};

export const validateSearchRequest = (data: unknown) => {
  return SearchRequestSchema.safeParse(data);
};

// Response builders
export const createSuccessResponse = <T>(
  data: T,
  requestId: string,
  version: string = '1.0.8'
): BaseResponse & { data: T } => {
  return {
    success: true,
    data,
    timestamp: new Date(),
    requestId,
    version
  };
};

export const createErrorResponse = (
  error: ErrorType,
  requestId: string,
  version: string = '1.0.8'
): BaseResponse & { error: ErrorType } => {
  return {
    success: false,
    error,
    timestamp: new Date(),
    requestId,
    version
  };
};

export const createPaginatedResponse = <T>(
  results: T[],
  pagination: { page: number; limit: number; total: number },
  requestId: string,
  version: string = '1.0.8'
) => {
  return {
    success: true,
    data: {
      results,
      pagination: {
        ...pagination,
        pages: Math.ceil(pagination.total / pagination.limit)
      }
    },
    timestamp: new Date(),
    requestId,
    version
  };
};
