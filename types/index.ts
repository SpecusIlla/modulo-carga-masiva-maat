// Tipos principales del módulo de carga masiva
export interface BulkUploadZoneProps {
  projectId: number;
  categories: Array<{
    id: number;
    name: string;
    color: string;
    icon: string;
  }>;
  onUploadComplete: () => void;
  apiBaseUrl?: string; // URL base de la API para configuración personalizada
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
  maxFileSize?: number; // Default: 100MB
  allowedFileTypes?: string[];
  concurrentUploads?: number; // Default: 10
  enableAI?: boolean; // Default: true
  enableDuplicateDetection?: boolean; // Default: true
  apiEndpoints?: {
    upload: string;
    batchUpload: string;
    classify: string;
    categories: string;
  };
}