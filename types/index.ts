
// Tipos principales del módulo de carga masiva - TypeScript Completo v1.1.0
export interface BulkUploadZoneProps {
  projectId: number;
  categories: Array<{
    id: number;
    name: string;
    color: string;
    icon: string;
  }>;
  onUploadComplete: () => void;
  apiBaseUrl?: string;
}

export interface FileUploadItem {
  file: File;
  categoryId: number | null;
  status: 'pending' | 'uploading' | 'success' | 'error' | 'paused';
  progress: number;
  error?: string;
  hash?: string;
  isDuplicate?: boolean;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  estimatedTime?: number;
  uploadSpeed?: number;
  retryCount?: number;
  suggestedCategory?: {
    categoryId: number;
    categoryName: string;
    confidence: number;
    reasoning: string;
  };
}

export interface LinkUploadItem {
  url: string;
  title: string;
  categoryId: number | null;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

export interface UploadStatistics {
  totalFolders: number;
  totalFiles: number;
  filesByType: Record<string, number>;
  totalSize: number;
  averageFileSize: number;
  largestFile: { name: string; size: number };
  smallestFile: { name: string; size: number };
  folderStructure: Array<{
    path: string;
    fileCount: number;
    size: number;
  }>;
  processingTime: number;
}

export interface UploadConfiguration {
  maxFileSize?: number;
  allowedFileTypes?: string[];
  concurrentUploads?: number;
  enableAI?: boolean;
  enableDuplicateDetection?: boolean;
  apiEndpoints?: {
    upload: string;
    batchUpload: string;
    classify: string;
    categories: string;
  };
}

// =================== TIPOS ESPECÍFICOS DE API ===================

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: APIError;
  timestamp: string;
  requestId: string;
}

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

export interface UploadResponse {
  fileId: string;
  fileName: string;
  fileSize: number;
  hash: string;
  mimeType: string;
  url: string;
  categoryId: number;
  scanResults: VirusScanResult;
  metadata: FileMetadata;
}

export interface BatchUploadResponse {
  uploadId: string;
  totalFiles: number;
  successfulUploads: UploadResponse[];
  failedUploads: FailedUpload[];
  summary: UploadSummary;
}

export interface FailedUpload {
  fileName: string;
  error: APIError;
  fileSize: number;
  retryable: boolean;
}

export interface UploadSummary {
  totalSize: number;
  processingTime: number;
  compressionRatio: number;
  duplicatesDetected: number;
  threatsBlocked: number;
}

export interface ClassificationResponse {
  categoryId: number;
  categoryName: string;
  confidence: number;
  reasoning: string;
  alternatives: Array<{
    categoryId: number;
    categoryName: string;
    confidence: number;
  }>;
}

export interface CategoryResponse {
  id: number;
  name: string;
  description: string;
  color: string;
  icon: string;
  fileCount: number;
  totalSize: number;
  allowedTypes: string[];
  rules: CategoryRule[];
}

export interface CategoryRule {
  type: 'extension' | 'mimeType' | 'size' | 'content';
  pattern: string;
  priority: number;
}

// =================== TIPOS DE SEGURIDAD ===================

export interface VirusScanResult {
  clean: boolean;
  engine: string;
  version: string;
  scanTime: number;
  threats: ThreatInfo[];
  quarantined: boolean;
}

export interface ThreatInfo {
  name: string;
  type: 'virus' | 'malware' | 'trojan' | 'suspicious';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  action: 'deleted' | 'quarantined' | 'cleaned';
}

export interface ValidationResult {
  isValid: boolean;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  issues: ValidationIssue[];
  metadata: FileMetadata;
  scanTime: number;
}

export interface ValidationIssue {
  code: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details?: Record<string, unknown>;
}

export interface FileMetadata {
  mimeType: string;
  actualType: string;
  fileSignature: string;
  entropy: number;
  embeddedContent: boolean;
  suspiciousPatterns: string[];
  exifData?: ExifData;
  documentProperties?: DocumentProperties;
}

export interface ExifData {
  camera?: string;
  software?: string;
  dateTime?: string;
  gpsLocation?: {
    latitude: number;
    longitude: number;
  };
  [key: string]: unknown;
}

export interface DocumentProperties {
  author?: string;
  title?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
  pageCount?: number;
  wordCount?: number;
  [key: string]: unknown;
}

// =================== TIPOS DE PERFORMANCE ===================

export interface PerformanceMetrics {
  upload: UploadMetrics;
  compression: CompressionMetrics;
  cache: CacheMetrics;
  system: SystemMetrics;
}

export interface UploadMetrics {
  totalUploads: number;
  successRate: number;
  averageSpeed: number;
  uploadSpeed: MetricData;
  uploadTime: MetricData;
  fileSize: MetricData;
  concurrentUploads: number;
  bandwidthUsage: number;
}

export interface MetricData {
  current: number;
  average: number;
  min: number;
  max: number;
  samples: number[];
  timestamp: number;
}

export interface CompressionMetrics {
  enabled: boolean;
  ratio: number;
  totalSaved: number;
  algorithm: string;
  compressionTime: MetricData;
}

export interface CacheMetrics {
  hitRate: number;
  missRate: number;
  totalRequests: number;
  cacheSize: number;
  evictions: number;
  averageResponseTime: number;
}

export interface SystemMetrics {
  memoryUsage: MemoryUsage;
  cpuUsage: number;
  diskUsage: DiskUsage;
  networkUsage: NetworkUsage;
  uptime: number;
}

export interface MemoryUsage {
  used: number;
  total: number;
  percentage: number;
  heapUsed: number;
  heapTotal: number;
}

export interface DiskUsage {
  used: number;
  total: number;
  percentage: number;
  available: number;
}

export interface NetworkUsage {
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
  errors: number;
}

// =================== TIPOS DE STREAMING ===================

export interface StreamConfig {
  chunkSize: number;
  maxConcurrent: number;
  retryAttempts: number;
  timeout: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
}

export interface ChunkInfo {
  index: number;
  size: number;
  hash: string;
  offset: number;
  uploadId: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  retryCount: number;
}

export interface UploadSession {
  uploadId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  chunksReceived: Set<number>;
  startTime: number;
  lastActivity: number;
  compressed: boolean;
  encrypted: boolean;
  metadata: Partial<FileMetadata>;
}

// =================== TIPOS DE WORKERS ===================

export interface WorkerMessage<T = unknown> {
  type: string;
  payload: T;
  requestId: string;
  timestamp: number;
}

export interface HashWorkerRequest {
  type: 'CALCULATE_HASH';
  payload: {
    buffer: ArrayBuffer;
    algorithm: 'sha256' | 'md5' | 'sha1';
  };
}

export interface HashWorkerResponse {
  type: 'HASH_CALCULATED';
  payload: {
    hash: string;
    algorithm: string;
    processingTime: number;
  };
}

export interface CompressionWorkerRequest {
  type: 'COMPRESS_FILE';
  payload: {
    buffer: ArrayBuffer;
    algorithm: 'gzip' | 'brotli' | 'deflate';
    level: number;
  };
}

export interface CompressionWorkerResponse {
  type: 'FILE_COMPRESSED';
  payload: {
    compressedBuffer: ArrayBuffer;
    originalSize: number;
    compressedSize: number;
    ratio: number;
    processingTime: number;
  };
}

// =================== TIPOS DE EVENTOS ===================

export interface UploadEvent {
  type: 'upload_started' | 'upload_progress' | 'upload_completed' | 'upload_failed' | 'upload_paused' | 'upload_resumed';
  fileId: string;
  fileName: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface ProgressEvent {
  fileId: string;
  progress: number;
  loaded: number;
  total: number;
  speed: number;
  estimatedTime: number;
}

export interface ErrorEvent {
  fileId: string;
  error: APIError;
  retryable: boolean;
  retryCount: number;
  maxRetries: number;
}

// =================== TIPOS UTILITARIOS ===================

export type FileType = 'image' | 'document' | 'video' | 'audio' | 'archive' | 'code' | 'other';

export type SortOrder = 'asc' | 'desc';

export type SortField = 'name' | 'size' | 'type' | 'date' | 'progress' | 'status';

export interface SortConfig {
  field: SortField;
  order: SortOrder;
}

export interface FilterConfig {
  type?: FileType[];
  status?: FileUploadItem['status'][];
  minSize?: number;
  maxSize?: number;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
}

// =================== TIPOS DE CONFIGURACIÓN ===================

export interface SecurityConfig {
  virusScanEnabled: boolean;
  contentValidationEnabled: boolean;
  encryptionEnabled: boolean;
  allowedMimeTypes: string[];
  blockedExtensions: string[];
  maxFileSize: number;
  quarantineThreats: boolean;
  scanTimeout: number;
}

export interface PerformanceConfig {
  chunkSize: number;
  maxConcurrentUploads: number;
  compressionEnabled: boolean;
  compressionLevel: number;
  cacheEnabled: boolean;
  cacheSize: number;
  streamingThreshold: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface UIConfig {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  showProgress: boolean;
  showPreview: boolean;
  autoRetry: boolean;
  notifications: boolean;
  soundEnabled: boolean;
}

// =================== GUARDS DE TIPO ===================

export function isUploadResponse(obj: unknown): obj is UploadResponse {
  return typeof obj === 'object' && obj !== null && 'fileId' in obj && 'fileName' in obj;
}

export function isAPIError(obj: unknown): obj is APIError {
  return typeof obj === 'object' && obj !== null && 'code' in obj && 'message' in obj;
}

export function isValidFileType(file: File, allowedTypes: string[]): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension ? allowedTypes.includes(extension) : false;
}

export function isImageFile(fileName: string): boolean {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'ico'];
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension ? imageExtensions.includes(extension) : false;
}

export function isVideoFile(fileName: string): boolean {
  const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', '3gp'];
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension ? videoExtensions.includes(extension) : false;
}

export function isDocumentFile(fileName: string): boolean {
  const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension ? documentExtensions.includes(extension) : false;
}
