
// Sistema de localización para MAAT v1.1.1
// Soporte multiidioma con carga dinámica

export type SupportedLanguage = 'es' | 'en' | 'pt' | 'fr';

export interface TranslationSet {
  // Upload messages
  upload: {
    dropZone: string;
    selectFiles: string;
    uploading: string;
    success: string;
    error: string;
    cancelled: string;
    maxSizeExceeded: string;
    invalidFileType: string;
    networkError: string;
    retrying: string;
  };
  // Progress messages
  progress: {
    preparing: string;
    analyzing: string;
    uploading: string;
    processing: string;
    completed: string;
    failed: string;
    paused: string;
    resumed: string;
  };
  // Error messages
  errors: {
    networkTimeout: string;
    serverError: string;
    fileCorrupted: string;
    insufficientSpace: string;
    permissionDenied: string;
    virusDetected: string;
    rateLimitExceeded: string;
    circuitBreakerOpen: string;
  };
  // Performance messages
  performance: {
    memoryUsage: string;
    uploadSpeed: string;
    networkLatency: string;
    compressionRatio: string;
    cacheHitRate: string;
    activeConnections: string;
  };
  // Security messages
  security: {
    scanning: string;
    scanComplete: string;
    threatDetected: string;
    fileEncrypted: string;
    hashVerified: string;
    auditLogged: string;
  };
  // General UI
  ui: {
    cancel: string;
    retry: string;
    pause: string;
    resume: string;
    remove: string;
    download: string;
    details: string;
    close: string;
    save: string;
    load: string;
  };
  // Time and units
  units: {
    bytes: string;
    kb: string;
    mb: string;
    gb: string;
    seconds: string;
    minutes: string;
    hours: string;
    speed: string;
  };
}

const translations: Record<SupportedLanguage, TranslationSet> = {
  es: {
    upload: {
      dropZone: 'Arrastra archivos aquí o haz clic para seleccionar',
      selectFiles: 'Seleccionar archivos',
      uploading: 'Subiendo...',
      success: 'Subida completada',
      error: 'Error en la subida',
      cancelled: 'Subida cancelada',
      maxSizeExceeded: 'Archivo excede el tamaño máximo',
      invalidFileType: 'Tipo de archivo no válido',
      networkError: 'Error de conexión',
      retrying: 'Reintentando...'
    },
    progress: {
      preparing: 'Preparando archivo...',
      analyzing: 'Analizando contenido...',
      uploading: 'Subiendo archivo...',
      processing: 'Procesando en servidor...',
      completed: 'Procesamiento completado',
      failed: 'Procesamiento fallido',
      paused: 'Subida pausada',
      resumed: 'Subida reanudada'
    },
    errors: {
      networkTimeout: 'Tiempo de espera de red agotado',
      serverError: 'Error interno del servidor',
      fileCorrupted: 'Archivo corrupto o dañado',
      insufficientSpace: 'Espacio insuficiente en el servidor',
      permissionDenied: 'Permisos insuficientes',
      virusDetected: 'Amenaza de seguridad detectada',
      rateLimitExceeded: 'Límite de velocidad excedido',
      circuitBreakerOpen: 'Servicio temporalmente no disponible'
    },
    performance: {
      memoryUsage: 'Uso de memoria',
      uploadSpeed: 'Velocidad de subida',
      networkLatency: 'Latencia de red',
      compressionRatio: 'Ratio de compresión',
      cacheHitRate: 'Tasa de acierto de caché',
      activeConnections: 'Conexiones activas'
    },
    security: {
      scanning: 'Escaneando archivo...',
      scanComplete: 'Escaneo de seguridad completado',
      threatDetected: 'Amenaza detectada y bloqueada',
      fileEncrypted: 'Archivo cifrado correctamente',
      hashVerified: 'Integridad del archivo verificada',
      auditLogged: 'Acción registrada en auditoría'
    },
    ui: {
      cancel: 'Cancelar',
      retry: 'Reintentar',
      pause: 'Pausar',
      resume: 'Reanudar',
      remove: 'Eliminar',
      download: 'Descargar',
      details: 'Detalles',
      close: 'Cerrar',
      save: 'Guardar',
      load: 'Cargar'
    },
    units: {
      bytes: 'bytes',
      kb: 'KB',
      mb: 'MB',
      gb: 'GB',
      seconds: 'segundos',
      minutes: 'minutos',
      hours: 'horas',
      speed: 'MB/s'
    }
  },
  en: {
    upload: {
      dropZone: 'Drop files here or click to select',
      selectFiles: 'Select files',
      uploading: 'Uploading...',
      success: 'Upload completed',
      error: 'Upload error',
      cancelled: 'Upload cancelled',
      maxSizeExceeded: 'File exceeds maximum size',
      invalidFileType: 'Invalid file type',
      networkError: 'Connection error',
      retrying: 'Retrying...'
    },
    progress: {
      preparing: 'Preparing file...',
      analyzing: 'Analyzing content...',
      uploading: 'Uploading file...',
      processing: 'Processing on server...',
      completed: 'Processing completed',
      failed: 'Processing failed',
      paused: 'Upload paused',
      resumed: 'Upload resumed'
    },
    errors: {
      networkTimeout: 'Network timeout',
      serverError: 'Internal server error',
      fileCorrupted: 'File corrupted or damaged',
      insufficientSpace: 'Insufficient server space',
      permissionDenied: 'Insufficient permissions',
      virusDetected: 'Security threat detected',
      rateLimitExceeded: 'Rate limit exceeded',
      circuitBreakerOpen: 'Service temporarily unavailable'
    },
    performance: {
      memoryUsage: 'Memory usage',
      uploadSpeed: 'Upload speed',
      networkLatency: 'Network latency',
      compressionRatio: 'Compression ratio',
      cacheHitRate: 'Cache hit rate',
      activeConnections: 'Active connections'
    },
    security: {
      scanning: 'Scanning file...',
      scanComplete: 'Security scan completed',
      threatDetected: 'Threat detected and blocked',
      fileEncrypted: 'File encrypted successfully',
      hashVerified: 'File integrity verified',
      auditLogged: 'Action logged in audit'
    },
    ui: {
      cancel: 'Cancel',
      retry: 'Retry',
      pause: 'Pause',
      resume: 'Resume',
      remove: 'Remove',
      download: 'Download',
      details: 'Details',
      close: 'Close',
      save: 'Save',
      load: 'Load'
    },
    units: {
      bytes: 'bytes',
      kb: 'KB',
      mb: 'MB',
      gb: 'GB',
      seconds: 'seconds',
      minutes: 'minutes',
      hours: 'hours',
      speed: 'MB/s'
    }
  },
  pt: {
    upload: {
      dropZone: 'Arraste arquivos aqui ou clique para selecionar',
      selectFiles: 'Selecionar arquivos',
      uploading: 'Enviando...',
      success: 'Upload concluído',
      error: 'Erro no upload',
      cancelled: 'Upload cancelado',
      maxSizeExceeded: 'Arquivo excede tamanho máximo',
      invalidFileType: 'Tipo de arquivo inválido',
      networkError: 'Erro de conexão',
      retrying: 'Tentando novamente...'
    },
    progress: {
      preparing: 'Preparando arquivo...',
      analyzing: 'Analisando conteúdo...',
      uploading: 'Enviando arquivo...',
      processing: 'Processando no servidor...',
      completed: 'Processamento concluído',
      failed: 'Processamento falhou',
      paused: 'Upload pausado',
      resumed: 'Upload retomado'
    },
    errors: {
      networkTimeout: 'Timeout de rede',
      serverError: 'Erro interno do servidor',
      fileCorrupted: 'Arquivo corrompido ou danificado',
      insufficientSpace: 'Espaço insuficiente no servidor',
      permissionDenied: 'Permissões insuficientes',
      virusDetected: 'Ameaça de segurança detectada',
      rateLimitExceeded: 'Limite de velocidade excedido',
      circuitBreakerOpen: 'Serviço temporariamente indisponível'
    },
    performance: {
      memoryUsage: 'Uso de memória',
      uploadSpeed: 'Velocidade de upload',
      networkLatency: 'Latência de rede',
      compressionRatio: 'Taxa de compressão',
      cacheHitRate: 'Taxa de acerto do cache',
      activeConnections: 'Conexões ativas'
    },
    security: {
      scanning: 'Escaneando arquivo...',
      scanComplete: 'Escaneamento de segurança concluído',
      threatDetected: 'Ameaça detectada e bloqueada',
      fileEncrypted: 'Arquivo criptografado com sucesso',
      hashVerified: 'Integridade do arquivo verificada',
      auditLogged: 'Ação registrada na auditoria'
    },
    ui: {
      cancel: 'Cancelar',
      retry: 'Tentar novamente',
      pause: 'Pausar',
      resume: 'Retomar',
      remove: 'Remover',
      download: 'Baixar',
      details: 'Detalhes',
      close: 'Fechar',
      save: 'Salvar',
      load: 'Carregar'
    },
    units: {
      bytes: 'bytes',
      kb: 'KB',
      mb: 'MB',
      gb: 'GB',
      seconds: 'segundos',
      minutes: 'minutos',
      hours: 'horas',
      speed: 'MB/s'
    }
  },
  fr: {
    upload: {
      dropZone: 'Déposez les fichiers ici ou cliquez pour sélectionner',
      selectFiles: 'Sélectionner des fichiers',
      uploading: 'Téléchargement en cours...',
      success: 'Téléchargement terminé',
      error: 'Erreur de téléchargement',
      cancelled: 'Téléchargement annulé',
      maxSizeExceeded: 'Le fichier dépasse la taille maximale',
      invalidFileType: 'Type de fichier invalide',
      networkError: 'Erreur de connexion',
      retrying: 'Nouvelle tentative...'
    },
    progress: {
      preparing: 'Préparation du fichier...',
      analyzing: 'Analyse du contenu...',
      uploading: 'Téléchargement du fichier...',
      processing: 'Traitement sur le serveur...',
      completed: 'Traitement terminé',
      failed: 'Traitement échoué',
      paused: 'Téléchargement en pause',
      resumed: 'Téléchargement repris'
    },
    errors: {
      networkTimeout: 'Délai d\'attente réseau dépassé',
      serverError: 'Erreur interne du serveur',
      fileCorrupted: 'Fichier corrompu ou endommagé',
      insufficientSpace: 'Espace serveur insuffisant',
      permissionDenied: 'Permissions insuffisantes',
      virusDetected: 'Menace de sécurité détectée',
      rateLimitExceeded: 'Limite de débit dépassée',
      circuitBreakerOpen: 'Service temporairement indisponible'
    },
    performance: {
      memoryUsage: 'Utilisation mémoire',
      uploadSpeed: 'Vitesse de téléchargement',
      networkLatency: 'Latence réseau',
      compressionRatio: 'Taux de compression',
      cacheHitRate: 'Taux de réussite du cache',
      activeConnections: 'Connexions actives'
    },
    security: {
      scanning: 'Analyse du fichier...',
      scanComplete: 'Analyse de sécurité terminée',
      threatDetected: 'Menace détectée et bloquée',
      fileEncrypted: 'Fichier chiffré avec succès',
      hashVerified: 'Intégrité du fichier vérifiée',
      auditLogged: 'Action enregistrée dans l\'audit'
    },
    ui: {
      cancel: 'Annuler',
      retry: 'Réessayer',
      pause: 'Pause',
      resume: 'Reprendre',
      remove: 'Supprimer',
      download: 'Télécharger',
      details: 'Détails',
      close: 'Fermer',
      save: 'Sauvegarder',
      load: 'Charger'
    },
    units: {
      bytes: 'octets',
      kb: 'Ko',
      mb: 'Mo',
      gb: 'Go',
      seconds: 'secondes',
      minutes: 'minutes',
      hours: 'heures',
      speed: 'Mo/s'
    }
  }
};

export class I18nManager {
  private currentLanguage: SupportedLanguage = 'es';
  private fallbackLanguage: SupportedLanguage = 'en';

  constructor() {
    this.detectLanguage();
  }

  /**
   * Detecta automáticamente el idioma del navegador
   */
  private detectLanguage(): void {
    const browserLang = navigator.language.split('-')[0] as SupportedLanguage;
    if (this.isLanguageSupported(browserLang)) {
      this.currentLanguage = browserLang;
    }
    console.log(`[I18N] Idioma detectado: ${this.currentLanguage}`);
  }

  /**
   * Verifica si un idioma está soportado
   */
  private isLanguageSupported(lang: string): lang is SupportedLanguage {
    return ['es', 'en', 'pt', 'fr'].includes(lang);
  }

  /**
   * Cambia el idioma actual
   */
  setLanguage(language: SupportedLanguage): void {
    if (this.isLanguageSupported(language)) {
      this.currentLanguage = language;
      console.log(`[I18N] Idioma cambiado a: ${language}`);
    } else {
      console.warn(`[I18N] Idioma no soportado: ${language}`);
    }
  }

  /**
   * Obtiene el idioma actual
   */
  getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  /**
   * Obtiene todas las traducciones para el idioma actual
   */
  getTranslations(): TranslationSet {
    return translations[this.currentLanguage];
  }

  /**
   * Obtiene una traducción específica por clave
   */
  t(keyPath: string): string {
    const keys = keyPath.split('.');
    let current: any = translations[this.currentLanguage];
    
    for (const key of keys) {
      current = current?.[key];
      if (current === undefined) {
        // Intentar con idioma de fallback
        current = translations[this.fallbackLanguage];
        for (const fallbackKey of keys) {
          current = current?.[fallbackKey];
          if (current === undefined) {
            console.warn(`[I18N] Traducción no encontrada: ${keyPath}`);
            return keyPath; // Devolver la clave si no se encuentra traducción
          }
        }
        break;
      }
    }
    
    return current || keyPath;
  }

  /**
   * Formatea un mensaje con variables
   */
  format(keyPath: string, variables: Record<string, string | number>): string {
    let message = this.t(keyPath);
    
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value.toString());
    }
    
    return message;
  }

  /**
   * Formatea tamaños de archivo
   */
  formatFileSize(bytes: number): string {
    const units = this.getTranslations().units;
    
    if (bytes === 0) return `0 ${units.bytes}`;
    
    const k = 1024;
    const sizes = [units.bytes, units.kb, units.mb, units.gb];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  /**
   * Formatea tiempo restante
   */
  formatTimeRemaining(seconds: number): string {
    const units = this.getTranslations().units;
    
    if (seconds < 60) {
      return `${Math.round(seconds)} ${units.seconds}`;
    } else if (seconds < 3600) {
      return `${Math.round(seconds / 60)} ${units.minutes}`;
    } else {
      return `${Math.round(seconds / 3600)} ${units.hours}`;
    }
  }

  /**
   * Formatea velocidad de transferencia
   */
  formatSpeed(bytesPerSecond: number): string {
    const mbps = bytesPerSecond / (1024 * 1024);
    return `${mbps.toFixed(1)} ${this.getTranslations().units.speed}`;
  }
}

export const i18n = new I18nManager();

// Hook para React (si se usa)
export function useTranslation() {
  return {
    t: (key: string) => i18n.t(key),
    format: (key: string, vars: Record<string, string | number>) => i18n.format(key, vars),
    formatFileSize: (bytes: number) => i18n.formatFileSize(bytes),
    formatTimeRemaining: (seconds: number) => i18n.formatTimeRemaining(seconds),
    formatSpeed: (bytesPerSecond: number) => i18n.formatSpeed(bytesPerSecond),
    currentLanguage: i18n.getCurrentLanguage(),
    setLanguage: (lang: SupportedLanguage) => i18n.setLanguage(lang)
  };
}
