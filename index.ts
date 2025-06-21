// Sistema MAAT v1.4.0 - Módulo de Carga Masiva Empresarial
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