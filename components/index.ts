// Componentes principales del módulo de carga masiva
export { default as BulkUploadZone } from './BulkUploadZone';

// Re-exportar tipos para facilitar la importación
export type { 
  BulkUploadZoneProps, 
  FileUploadItem, 
  LinkUploadItem, 
  UploadStatistics, 
  UploadConfiguration 
} from '../types';