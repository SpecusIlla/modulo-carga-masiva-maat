// Punto de entrada principal del módulo de carga masiva autocontenido
export { BulkUploadZone } from './components';
export type { 
  BulkUploadZoneProps, 
  FileUploadItem, 
  LinkUploadItem, 
  UploadStatistics, 
  UploadConfiguration 
} from './types';
export { 
  formatFileSize, 
  generateFileHash, 
  classifyFileType, 
  validateFileSize,
  createUploadQueue,
  detectDuplicates,
  processFileStructure 
} from './lib';