// Utilidades principales del módulo de carga masiva

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const generateFileHash = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const classifyFileType = (filename: string): 'document' | 'image' | 'video' | 'other' => {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  
  const documentTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
  const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];
  const videoTypes = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'];
  
  if (documentTypes.includes(extension)) return 'document';
  if (imageTypes.includes(extension)) return 'image';
  if (videoTypes.includes(extension)) return 'video';
  return 'other';
};

export const validateFileSize = (file: File, maxSize: number = 100 * 1024 * 1024): boolean => {
  return file.size <= maxSize;
};

export const createUploadQueue = () => {
  const queue: Array<() => Promise<any>> = [];
  let processing = false;
  let concurrentLimit = 10;
  let activeUploads = 0;

  const processNext = async () => {
    if (processing || activeUploads >= concurrentLimit || queue.length === 0) {
      return;
    }

    processing = true;
    const task = queue.shift();
    
    if (task) {
      activeUploads++;
      try {
        await task();
      } catch (error) {
        console.error('Upload task failed:', error);
      } finally {
        activeUploads--;
        processing = false;
        processNext(); // Procesar siguiente tarea
      }
    } else {
      processing = false;
    }
  };

  return {
    add: (task: () => Promise<any>) => {
      queue.push(task);
      processNext();
    },
    setConcurrency: (limit: number) => {
      concurrentLimit = limit;
    },
    getQueueSize: () => queue.length,
    getActiveCount: () => activeUploads
  };
};

export const detectDuplicates = async (files: File[]): Promise<Map<string, File[]>> => {
  const duplicates = new Map<string, File[]>();
  const hashes = new Map<string, File>();

  for (const file of files) {
    const hash = await generateFileHash(file);
    
    if (hashes.has(hash)) {
      const existingFile = hashes.get(hash)!;
      if (!duplicates.has(hash)) {
        duplicates.set(hash, [existingFile]);
      }
      duplicates.get(hash)!.push(file);
    } else {
      hashes.set(hash, file);
    }
  }

  return duplicates;
};

export const processFileStructure = (files: FileList | File[]): Array<{
  path: string;
  fileCount: number;
  size: number;
}> => {
  const folderStructure = new Map<string, { fileCount: number; size: number }>();

  Array.from(files).forEach(file => {
    const path = (file as any).webkitRelativePath || file.name;
    const folderPath = path.substring(0, path.lastIndexOf('/')) || '/';
    
    if (folderStructure.has(folderPath)) {
      const folder = folderStructure.get(folderPath)!;
      folder.fileCount++;
      folder.size += file.size;
    } else {
      folderStructure.set(folderPath, {
        fileCount: 1,
        size: file.size
      });
    }
  });

  return Array.from(folderStructure.entries()).map(([path, data]) => ({
    path,
    ...data
  }));
};