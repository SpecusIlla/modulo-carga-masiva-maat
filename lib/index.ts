
// Funciones utilitarias del módulo de carga masiva - TypeScript Completo v1.1.0
import type { 
  FileUploadItem, 
  UploadStatistics, 
  FileType,
  APIResponse,
  PerformanceMetrics,
  ValidationResult,
  ChunkInfo,
  HashWorkerRequest,
  HashWorkerResponse
} from '../types';

/**
 * Formatea el tamaño de archivo a una cadena legible
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Genera hash SHA-256 de un archivo usando Web Workers
 */
export async function generateFileHash(
  file: File, 
  algorithm: 'sha256' | 'md5' | 'sha1' = 'sha256'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/workers/hash-calculator.js');
    const buffer = file.arrayBuffer();
    
    buffer.then((arrayBuffer) => {
      const message: HashWorkerRequest = {
        type: 'CALCULATE_HASH',
        payload: { buffer: arrayBuffer, algorithm },
        requestId: crypto.randomUUID(),
        timestamp: Date.now()
      };
      
      worker.postMessage(message);
      
      worker.onmessage = (event: MessageEvent<HashWorkerResponse>) => {
        if (event.data.type === 'HASH_CALCULATED') {
          resolve(event.data.payload.hash);
          worker.terminate();
        }
      };
      
      worker.onerror = (error) => {
        reject(new Error(`Hash calculation failed: ${error.message}`));
        worker.terminate();
      };
      
      // Timeout después de 30 segundos
      setTimeout(() => {
        reject(new Error('Hash calculation timeout'));
        worker.terminate();
      }, 30000);
    }).catch(reject);
  });
}

/**
 * Clasifica el tipo de archivo basado en su extensión y MIME type
 */
export function classifyFileType(file: File): FileType {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const mimeType = file.type.toLowerCase();
  
  // Imágenes
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'ico', 'heic'];
  const imageMimes = ['image/'];
  
  // Videos
  const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', '3gp', 'mpg'];
  const videoMimes = ['video/'];
  
  // Audio
  const audioExtensions = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'];
  const audioMimes = ['audio/'];
  
  // Documentos
  const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt'];
  const documentMimes = ['application/pdf', 'application/msword', 'text/'];
  
  // Archivos comprimidos
  const archiveExtensions = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'];
  const archiveMimes = ['application/zip', 'application/x-rar'];
  
  // Código
  const codeExtensions = ['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'json', 'xml', 'yaml', 'py', 'java', 'cpp', 'c', 'h'];
  const codeMimes = ['text/javascript', 'application/json', 'text/html'];
  
  if (extension && imageExtensions.includes(extension) || imageMimes.some(mime => mimeType.startsWith(mime))) {
    return 'image';
  }
  
  if (extension && videoExtensions.includes(extension) || videoMimes.some(mime => mimeType.startsWith(mime))) {
    return 'video';
  }
  
  if (extension && audioExtensions.includes(extension) || audioMimes.some(mime => mimeType.startsWith(mime))) {
    return 'audio';
  }
  
  if (extension && documentExtensions.includes(extension) || documentMimes.some(mime => mimeType.startsWith(mime))) {
    return 'document';
  }
  
  if (extension && archiveExtensions.includes(extension) || archiveMimes.some(mime => mimeType.startsWith(mime))) {
    return 'archive';
  }
  
  if (extension && codeExtensions.includes(extension) || codeMimes.some(mime => mimeType.startsWith(mime))) {
    return 'code';
  }
  
  return 'other';
}

/**
 * Valida el tamaño del archivo contra los límites configurados
 */
export function validateFileSize(file: File, maxSize: number = 100 * 1024 * 1024): boolean {
  return file.size <= maxSize && file.size > 0;
}

/**
 * Crea una cola de upload optimizada con prioridades
 */
export function createUploadQueue(files: FileUploadItem[], maxConcurrent: number = 3): FileUploadItem[][] {
  // Ordenar por prioridad y tamaño
  const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
  
  const sortedFiles = [...files].sort((a, b) => {
    // Primero por prioridad
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    
    // Luego por tamaño (archivos pequeños primero)
    return a.file.size - b.file.size;
  });
  
  // Dividir en batches
  const batches: FileUploadItem[][] = [];
  for (let i = 0; i < sortedFiles.length; i += maxConcurrent) {
    batches.push(sortedFiles.slice(i, i + maxConcurrent));
  }
  
  return batches;
}

/**
 * Detecta archivos duplicados basado en hash y nombre
 */
export async function detectDuplicates(files: FileUploadItem[]): Promise<Map<string, FileUploadItem[]>> {
  const duplicates = new Map<string, FileUploadItem[]>();
  const hashMap = new Map<string, FileUploadItem[]>();
  
  // Calcular hashes para todos los archivos
  const hashPromises = files.map(async (item) => {
    try {
      const hash = await generateFileHash(item.file);
      item.hash = hash;
      
      const existing = hashMap.get(hash) || [];
      existing.push(item);
      hashMap.set(hash, existing);
      
      if (existing.length > 1) {
        duplicates.set(hash, existing);
      }
    } catch (error) {
      console.warn(`Error calculating hash for ${item.file.name}:`, error);
    }
  });
  
  await Promise.allSettled(hashPromises);
  
  return duplicates;
}

/**
 * Procesa la estructura de carpetas de archivos
 */
export function processFileStructure(files: File[]): UploadStatistics {
  const filesByType: Record<string, number> = {};
  const folderStructure: Array<{ path: string; fileCount: number; size: number }> = [];
  let totalSize = 0;
  let largestFile = { name: '', size: 0 };
  let smallestFile = { name: '', size: Number.MAX_SAFE_INTEGER };
  
  const folderMap = new Map<string, { fileCount: number; size: number }>();
  
  files.forEach(file => {
    const fileType = classifyFileType(file);
    filesByType[fileType] = (filesByType[fileType] || 0) + 1;
    
    totalSize += file.size;
    
    if (file.size > largestFile.size) {
      largestFile = { name: file.name, size: file.size };
    }
    
    if (file.size < smallestFile.size) {
      smallestFile = { name: file.name, size: file.size };
    }
    
    // Procesar estructura de carpetas si está disponible
    if ('webkitRelativePath' in file && file.webkitRelativePath) {
      const pathParts = file.webkitRelativePath.split('/');
      const folderPath = pathParts.slice(0, -1).join('/');
      
      if (folderPath) {
        const existing = folderMap.get(folderPath) || { fileCount: 0, size: 0 };
        existing.fileCount++;
        existing.size += file.size;
        folderMap.set(folderPath, existing);
      }
    }
  });
  
  // Convertir mapa de carpetas a array
  folderMap.forEach((stats, path) => {
    folderStructure.push({ path, ...stats });
  });
  
  // Si no hay carpetas, crear entrada raíz
  if (folderStructure.length === 0) {
    folderStructure.push({
      path: '/',
      fileCount: files.length,
      size: totalSize
    });
  }
  
  return {
    totalFolders: folderStructure.length,
    totalFiles: files.length,
    filesByType,
    totalSize,
    averageFileSize: files.length > 0 ? totalSize / files.length : 0,
    largestFile,
    smallestFile: smallestFile.size === Number.MAX_SAFE_INTEGER 
      ? { name: '', size: 0 } 
      : smallestFile,
    folderStructure,
    processingTime: 0 // Se calculará por el llamador
  };
}

/**
 * Calcula métricas de rendimiento en tiempo real
 */
export function calculatePerformanceMetrics(
  uploads: FileUploadItem[],
  startTime: number
): Partial<PerformanceMetrics> {
  const now = Date.now();
  const elapsedTime = (now - startTime) / 1000; // segundos
  
  const completedUploads = uploads.filter(u => u.status === 'success');
  const failedUploads = uploads.filter(u => u.status === 'error');
  const activeUploads = uploads.filter(u => u.status === 'uploading');
  
  const totalBytes = uploads.reduce((sum, u) => sum + u.file.size, 0);
  const uploadedBytes = completedUploads.reduce((sum, u) => sum + u.file.size, 0);
  
  const averageSpeed = elapsedTime > 0 ? uploadedBytes / elapsedTime : 0;
  const successRate = uploads.length > 0 ? (completedUploads.length / uploads.length) * 100 : 0;
  
  return {
    upload: {
      totalUploads: uploads.length,
      successRate,
      averageSpeed,
      uploadSpeed: {
        current: averageSpeed,
        average: averageSpeed,
        min: 0,
        max: averageSpeed,
        samples: [averageSpeed],
        timestamp: now
      },
      uploadTime: {
        current: elapsedTime * 1000,
        average: elapsedTime * 1000,
        min: 0,
        max: elapsedTime * 1000,
        samples: [elapsedTime * 1000],
        timestamp: now
      },
      fileSize: {
        current: totalBytes,
        average: uploads.length > 0 ? totalBytes / uploads.length : 0,
        min: Math.min(...uploads.map(u => u.file.size)),
        max: Math.max(...uploads.map(u => u.file.size)),
        samples: uploads.map(u => u.file.size),
        timestamp: now
      },
      concurrentUploads: activeUploads.length,
      bandwidthUsage: averageSpeed
    }
  };
}

/**
 * Genera información de chunks para streaming
 */
export function generateChunkInfo(
  file: File, 
  chunkSize: number = 1024 * 1024,
  uploadId: string
): ChunkInfo[] {
  const totalChunks = Math.ceil(file.size / chunkSize);
  const chunks: ChunkInfo[] = [];
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const size = end - start;
    
    chunks.push({
      index: i,
      size,
      hash: '', // Se calculará después
      offset: start,
      uploadId,
      status: 'pending',
      retryCount: 0
    });
  }
  
  return chunks;
}

/**
 * Estima el tiempo de upload basado en velocidad histórica
 */
export function estimateUploadTime(
  fileSize: number, 
  averageSpeed: number = 1024 * 1024
): number {
  if (averageSpeed <= 0) return 0;
  return Math.ceil(fileSize / averageSpeed);
}

/**
 * Convierte respuesta de API a tipo específico con validación
 */
export function parseAPIResponse<T>(response: unknown): APIResponse<T> {
  if (typeof response !== 'object' || response === null) {
    throw new Error('Invalid API response format');
  }
  
  const apiResponse = response as APIResponse<T>;
  
  if (typeof apiResponse.success !== 'boolean') {
    throw new Error('Missing or invalid success field in API response');
  }
  
  if (!apiResponse.timestamp || !apiResponse.requestId) {
    throw new Error('Missing required metadata in API response');
  }
  
  return apiResponse;
}

/**
 * Debounce función para optimizar llamadas frecuentes
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T, 
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle función para limitar frecuencia de ejecución
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T, 
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
