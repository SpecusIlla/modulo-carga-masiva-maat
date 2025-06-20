
// Tipos específicos para respuestas de API - MAAT v1.1.0
// Elimina completamente los tipos implícitos 'any'

export interface BaseAPIResponse {
  readonly success: boolean;
  readonly timestamp: string;
  readonly requestId: string;
  readonly version: string;
}

export interface SuccessAPIResponse<TData = unknown> extends BaseAPIResponse {
  readonly success: true;
  readonly data: TData;
}

export interface ErrorAPIResponse extends BaseAPIResponse {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
    readonly stack?: string;
    readonly timestamp: string;
  };
}

export type APIResponse<TData = unknown> = SuccessAPIResponse<TData> | ErrorAPIResponse;

// Tipos específicos para endpoints de upload
export interface UploadEndpointResponse {
  readonly fileId: string;
  readonly fileName: string;
  readonly originalName: string;
  readonly fileSize: number;
  readonly mimeType: string;
  readonly hash: string;
  readonly url: string;
  readonly thumbnailUrl?: string;
  readonly categoryId: number;
  readonly uploadedAt: string;
  readonly scanResults: {
    readonly clean: boolean;
    readonly engine: string;
    readonly version: string;
    readonly scanTime: number;
    readonly threats: ReadonlyArray<{
      readonly name: string;
      readonly type: 'virus' | 'malware' | 'trojan' | 'suspicious';
      readonly severity: 'low' | 'medium' | 'high' | 'critical';
    }>;
  };
  readonly metadata: {
    readonly actualMimeType: string;
    readonly fileSignature: string;
    readonly entropy: number;
    readonly embeddedContent: boolean;
    readonly exifData?: Record<string, string | number>;
    readonly documentProperties?: Record<string, string | number>;
  };
}

export interface BatchUploadEndpointResponse {
  readonly batchId: string;
  readonly totalFiles: number;
  readonly processedFiles: number;
  readonly successfulUploads: ReadonlyArray<UploadEndpointResponse>;
  readonly failedUploads: ReadonlyArray<{
    readonly fileName: string;
    readonly error: {
      readonly code: string;
      readonly message: string;
    };
    readonly retryable: boolean;
  }>;
  readonly summary: {
    readonly totalSize: number;
    readonly processedSize: number;
    readonly processingTime: number;
    readonly compressionRatio: number;
    readonly duplicatesDetected: number;
    readonly threatsBlocked: number;
  };
}

export interface ClassificationEndpointResponse {
  readonly fileId: string;
  readonly classification: {
    readonly categoryId: number;
    readonly categoryName: string;
    readonly confidence: number;
    readonly reasoning: string;
    readonly processingTime: number;
  };
  readonly alternatives: ReadonlyArray<{
    readonly categoryId: number;
    readonly categoryName: string;
    readonly confidence: number;
  }>;
  readonly contentAnalysis: {
    readonly language?: string;
    readonly pageCount?: number;
    readonly wordCount?: number;
    readonly imageCount?: number;
    readonly hasText: boolean;
    readonly hasImages: boolean;
    readonly hasCode: boolean;
  }
}

export interface VersionControlEndpointResponse {
  readonly versionId: string;
  readonly fileId: string;
  readonly versionNumber: number;
  readonly hash: string;
  readonly size: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly comment: string;
  readonly parentVersion?: string;
  readonly tags: readonly string[];
}

export interface VersionHistoryEndpointResponse {
  readonly success: boolean;
  readonly fileId: string;
  readonly totalVersions: number;
  readonly versions: readonly VersionControlEndpointResponse[];
}

export interface VersionComparisonEndpointResponse {
  readonly success: boolean;
  readonly comparison: {
    readonly fromVersion: string;
    readonly toVersion: string;
    readonly changes: {
      readonly added: number;
      readonly modified: number;
      readonly deleted: number;
      readonly sizeChange: number;
    };
    readonly similarity: number;
  };
};
}

export interface CategoriesEndpointResponse {
  readonly categories: ReadonlyArray<{
    readonly id: number;
    readonly name: string;
    readonly description: string;
    readonly color: string;
    readonly icon: string;
    readonly fileCount: number;
    readonly totalSize: number;
    readonly allowedTypes: ReadonlyArray<string>;
    readonly rules: ReadonlyArray<{
      readonly type: 'extension' | 'mimeType' | 'size' | 'content';
      readonly pattern: string;
      readonly priority: number;
    }>;
    readonly parentId?: number;
    readonly isActive: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;
  }>;
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface StreamingUploadResponse {
  readonly uploadId: string;
  readonly sessionUrl: string;
  readonly chunkSize: number;
  readonly totalChunks: number;
  readonly expiresAt: string;
  readonly supportedFormats: ReadonlyArray<string>;
  readonly maxFileSize: number;
  readonly encryptionEnabled: boolean;
  readonly compressionEnabled: boolean;
}

export interface ChunkUploadResponse {
  readonly uploadId: string;
  readonly chunkIndex: number;
  readonly chunkHash: string;
  readonly received: boolean;
  readonly progress: {
    readonly chunksReceived: number;
    readonly totalChunks: number;
    readonly percentage: number;
    readonly estimatedTimeRemaining: number;
  };
}

export interface UploadStatusResponse {
  readonly uploadId: string;
  readonly status: 'initializing' | 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';
  readonly progress: {
    readonly percentage: number;
    readonly uploadedBytes: number;
    readonly totalBytes: number;
    readonly chunksUploaded: number;
    readonly totalChunks: number;
    readonly averageSpeed: number;
    readonly estimatedTimeRemaining: number;
  };
  readonly file: {
    readonly name: string;
    readonly size: number;
    readonly type: string;
  };
  readonly timestamps: {
    readonly started: string;
    readonly lastActivity: string;
    readonly estimated_completion?: string;
  };
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
}

// Tipos para request bodies
export interface UploadRequestBody {
  readonly file: File;
  readonly title: string;
  readonly projectId: number;
  readonly categoryId?: number;
  readonly metadata?: Record<string, string | number | boolean>;
  readonly tags?: ReadonlyArray<string>;
  readonly description?: string;
}

export interface BatchUploadRequestBody {
  readonly files: ReadonlyArray<File>;
  readonly projectId: number;
  readonly defaultCategoryId?: number;
  readonly enableAIClassification: boolean;
  readonly enableDuplicateDetection: boolean;
  readonly metadata?: Record<string, string | number | boolean>;
}

export interface ClassificationRequestBody {
  readonly fileId?: string;
  readonly fileContent?: ArrayBuffer;
  readonly fileName: string;
  readonly mimeType: string;
  readonly enableDeepAnalysis: boolean;
  readonly customRules?: ReadonlyArray<{
    readonly pattern: string;
    readonly categoryId: number;
    readonly priority: number;
  }>;
}

// Tipos para parámetros de query
export interface ListCategoriesParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly parentId?: number;
  readonly isActive?: boolean;
  readonly sortBy?: 'name' | 'fileCount' | 'totalSize' | 'createdAt';
  readonly sortOrder?: 'asc' | 'desc';
}

export interface UploadHistoryParams {
  readonly projectId?: number;
  readonly categoryId?: number;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly status?: 'completed' | 'failed' | 'processing';
  readonly page?: number;
  readonly pageSize?: number;
}

// Guards de tipo para respuestas de API
export function isSuccessResponse<T>(response: APIResponse<T>): response is SuccessAPIResponse<T> {
  return response.success === true;
}

export function isErrorResponse(response: APIResponse<unknown>): response is ErrorAPIResponse {
  return response.success === false;
}

export function isUploadResponse(data: unknown): data is UploadEndpointResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'fileId' in data &&
    'fileName' in data &&
    'fileSize' in data &&
    typeof (data as Record<string, unknown>).fileId === 'string'
  );
}

export function isBatchUploadResponse(data: unknown): data is BatchUploadEndpointResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'batchId' in data &&
    'totalFiles' in data &&
    'successfulUploads' in data &&
    Array.isArray((data as Record<string, unknown>).successfulUploads)
  );
}

// Constantes para códigos de error específicos
export const API_ERROR_CODES = {
  // Errores de validación
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_CORRUPTED: 'FILE_CORRUPTED',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  
  // Errores de seguridad
  VIRUS_DETECTED: 'VIRUS_DETECTED',
  MALWARE_DETECTED: 'MALWARE_DETECTED',
  SUSPICIOUS_CONTENT: 'SUSPICIOUS_CONTENT',
  ENCRYPTION_FAILED: 'ENCRYPTION_FAILED',
  
  // Errores de procesamiento
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  COMPRESSION_FAILED: 'COMPRESSION_FAILED',
  HASH_CALCULATION_FAILED: 'HASH_CALCULATION_FAILED',
  CLASSIFICATION_FAILED: 'CLASSIFICATION_FAILED',
  
  // Errores de sistema
  STORAGE_FULL: 'STORAGE_FULL',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  
  // Errores de autorización
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND'
} as const;

export type APIErrorCode = typeof API_ERROR_CODES[keyof typeof API_ERROR_CODES];
