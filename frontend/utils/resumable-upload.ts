
// Sistema de upload resumible para archivos grandes - MAAT v1.1.0
// Permite recuperar uploads interrumpidos y continuar desde el último chunk exitoso

import { networkErrorHandler } from './network-error-handler';

export interface ResumableUploadSession {
  readonly uploadId: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly chunkSize: number;
  readonly totalChunks: number;
  readonly completedChunks: Set<number>;
  readonly failedChunks: Set<number>;
  readonly priority: 'urgent' | 'high' | 'normal' | 'low';
  readonly startTime: number;
  readonly lastActivity: number;
  readonly checksum: string;
  readonly metadata: Record<string, unknown>;
}

export interface UploadProgress {
  readonly uploadId: string;
  readonly percentage: number;
  readonly uploadedBytes: number;
  readonly totalBytes: number;
  readonly chunksCompleted: number;
  readonly totalChunks: number;
  readonly speed: number; // bytes/second
  readonly estimatedTimeRemaining: number; // seconds
  readonly currentChunk: number;
  readonly retryCount: number;
}

export interface ChunkUploadResult {
  readonly success: boolean;
  readonly chunkIndex: number;
  readonly hash?: string;
  readonly error?: string;
  readonly retryable: boolean;
}

export class ResumableUploadManager {
  private readonly sessions = new Map<string, ResumableUploadSession>();
  private readonly progressCallbacks = new Map<string, (progress: UploadProgress) => void>();
  private readonly activeUploads = new Set<string>();
  
  private readonly DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1MB
  private readonly LARGE_FILE_THRESHOLD = 25 * 1024 * 1024; // 25MB
  private readonly MAX_CONCURRENT_CHUNKS = 8; // Aumentado de 3 a 8
  private readonly STORAGE_KEY = 'maat_resumable_sessions';

  constructor() {
    this.loadSessions();
    this.startPeriodicSave();
  }

  /**
   * Inicia un upload resumible
   */
  async startResumableUpload(
    file: File,
    options: {
      priority?: 'urgent' | 'high' | 'normal' | 'low';
      chunkSize?: number;
      metadata?: Record<string, unknown>;
      onProgress?: (progress: UploadProgress) => void;
    } = {}
  ): Promise<string> {
    const uploadId = `resumable_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const chunkSize = options.chunkSize || this.getOptimalChunkSize(file.size);
    const totalChunks = Math.ceil(file.size / chunkSize);
    
    // Calcular checksum del archivo
    const checksum = await this.calculateFileChecksum(file);
    
    // Verificar si ya existe una sesión para este archivo
    const existingSession = this.findExistingSession(file.name, file.size, checksum);
    if (existingSession) {
      console.log(`[RESUMABLE-UPLOAD] Reanudando upload existente: ${existingSession.uploadId}`);
      return this.resumeUpload(existingSession.uploadId, file, options.onProgress);
    }

    const session: ResumableUploadSession = {
      uploadId,
      fileName: file.name,
      fileSize: file.size,
      chunkSize,
      totalChunks,
      completedChunks: new Set(),
      failedChunks: new Set(),
      priority: options.priority || 'normal',
      startTime: Date.now(),
      lastActivity: Date.now(),
      checksum,
      metadata: options.metadata || {}
    };

    this.sessions.set(uploadId, session);
    
    if (options.onProgress) {
      this.progressCallbacks.set(uploadId, options.onProgress);
    }

    console.log(`[RESUMABLE-UPLOAD] Iniciando upload resumible: ${uploadId} (${totalChunks} chunks)`);

    // Inicializar sesión en el servidor
    await this.initializeServerSession(session);
    
    // Comenzar upload
    this.uploadFileChunks(uploadId, file);
    
    return uploadId;
  }

  /**
   * Reanuda un upload interrumpido
   */
  async resumeUpload(
    uploadId: string, 
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<string> {
    const session = this.sessions.get(uploadId);
    if (!session) {
      throw new Error(`Sesión de upload no encontrada: ${uploadId}`);
    }

    if (this.activeUploads.has(uploadId)) {
      console.warn(`[RESUMABLE-UPLOAD] Upload ya está activo: ${uploadId}`);
      return uploadId;
    }

    // Verificar integridad del archivo
    const currentChecksum = await this.calculateFileChecksum(file);
    if (currentChecksum !== session.checksum) {
      throw new Error('El archivo ha sido modificado desde el último upload');
    }

    if (onProgress) {
      this.progressCallbacks.set(uploadId, onProgress);
    }

    console.log(`[RESUMABLE-UPLOAD] Reanudando upload: ${uploadId} (${session.completedChunks.size}/${session.totalChunks} chunks completados)`);

    // Verificar estado en el servidor
    await this.verifyServerSession(session);
    
    // Continuar upload desde donde se quedó
    this.uploadFileChunks(uploadId, file);
    
    return uploadId;
  }

  /**
   * Upload de chunks con manejo robusto de errores
   */
  private async uploadFileChunks(uploadId: string, file: File): Promise<void> {
    const session = this.sessions.get(uploadId);
    if (!session) {
      throw new Error(`Sesión no encontrada: ${uploadId}`);
    }

    this.activeUploads.add(uploadId);
    
    try {
      // Obtener chunks pendientes
      const pendingChunks = this.getPendingChunks(session);
      console.log(`[RESUMABLE-UPLOAD] ${pendingChunks.length} chunks pendientes para ${uploadId}`);

      // Upload chunks en paralelo con límite de concurrencia
      const chunkPromises: Promise<void>[] = [];
      let currentIndex = 0;

      const processNextChunk = async (): Promise<void> => {
        if (currentIndex >= pendingChunks.length) return;
        
        const chunkIndex = pendingChunks[currentIndex++];
        await this.uploadSingleChunk(uploadId, file, chunkIndex);
        
        // Procesar siguiente chunk
        if (currentIndex < pendingChunks.length) {
          return processNextChunk();
        }
      };

      // Iniciar workers concurrentes
      for (let i = 0; i < Math.min(this.MAX_CONCURRENT_CHUNKS, pendingChunks.length); i++) {
        chunkPromises.push(processNextChunk());
      }

      await Promise.all(chunkPromises);

      // Verificar si el upload está completo
      if (session.completedChunks.size === session.totalChunks) {
        await this.finalizeUpload(uploadId);
      }

    } finally {
      this.activeUploads.delete(uploadId);
    }
  }

  /**
   * Upload de un chunk individual con reintentos
   */
  private async uploadSingleChunk(uploadId: string, file: File, chunkIndex: number): Promise<void> {
    const session = this.sessions.get(uploadId)!;
    const start = chunkIndex * session.chunkSize;
    const end = Math.min(start + session.chunkSize, session.fileSize);
    const chunk = file.slice(start, end);

    try {
      const result = await networkErrorHandler.executeWithRetry(
        async () => {
          const formData = new FormData();
          formData.append('chunk', chunk);
          formData.append('uploadId', uploadId);
          formData.append('chunkIndex', chunkIndex.toString());
          formData.append('chunkHash', await this.calculateChunkHash(chunk));

          const response = await fetch('/api/upload/chunk', {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(30000) // 30 segundos timeout
          });

          if (!response.ok) {
            throw new Error(`Chunk upload failed: ${response.status} ${response.statusText}`);
          }

          return response.json();
        },
        {
          maxRetries: 5,
          baseDelay: 1000,
          maxDelay: 10000,
          exponentialBackoff: true,
          jitterEnabled: true
        },
        {
          uploadId,
          chunkIndex,
          priority: session.priority
        }
      );

      // Marcar chunk como completado
      session.completedChunks.add(chunkIndex);
      session.failedChunks.delete(chunkIndex);
      session.lastActivity = Date.now();

      // Actualizar progreso
      this.updateProgress(uploadId);

      console.log(`[RESUMABLE-UPLOAD] Chunk ${chunkIndex} completado para ${uploadId}`);

    } catch (error) {
      // Marcar chunk como fallido
      session.failedChunks.add(chunkIndex);
      session.lastActivity = Date.now();
      
      console.error(`[RESUMABLE-UPLOAD] Chunk ${chunkIndex} falló para ${uploadId}:`, error);
      
      // Si es un error crítico, pausar upload
      if (error instanceof Error && error.message.includes('401') || error.message.includes('403')) {
        throw error; // Error de autorización, no reintentar
      }
    }
  }

  /**
   * Finaliza el upload cuando todos los chunks están completos
   */
  private async finalizeUpload(uploadId: string): Promise<void> {
    const session = this.sessions.get(uploadId)!;
    
    try {
      const result = await networkErrorHandler.executeWithRetry(
        async () => {
          const response = await fetch('/api/upload/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uploadId,
              expectedChunks: session.totalChunks,
              fileChecksum: session.checksum
            })
          });

          if (!response.ok) {
            throw new Error(`Finalization failed: ${response.status}`);
          }

          return response.json();
        },
        { maxRetries: 3 }
      );

      console.log(`[RESUMABLE-UPLOAD] Upload finalizado exitosamente: ${uploadId}`);
      
      // Limpiar sesión
      this.sessions.delete(uploadId);
      this.progressCallbacks.delete(uploadId);
      this.saveSessions();

    } catch (error) {
      console.error(`[RESUMABLE-UPLOAD] Error finalizando upload ${uploadId}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene chunks pendientes (no completados)
   */
  private getPendingChunks(session: ResumableUploadSession): number[] {
    const pending: number[] = [];
    for (let i = 0; i < session.totalChunks; i++) {
      if (!session.completedChunks.has(i)) {
        pending.push(i);
      }
    }
    return pending;
  }

  /**
   * Determina el tamaño óptimo de chunk basado en el tamaño del archivo
   */
  private getOptimalChunkSize(fileSize: number): number {
    if (fileSize < this.LARGE_FILE_THRESHOLD) {
      return this.DEFAULT_CHUNK_SIZE;
    } else if (fileSize < 100 * 1024 * 1024) { // <100MB
      return 2 * 1024 * 1024; // 2MB chunks
    } else if (fileSize < 500 * 1024 * 1024) { // <500MB
      return 5 * 1024 * 1024; // 5MB chunks
    } else {
      return 10 * 1024 * 1024; // 10MB chunks para archivos muy grandes
    }
  }

  /**
   * Calcula checksum del archivo completo
   */
  private async calculateFileChecksum(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Calcula hash de un chunk individual
   */
  private async calculateChunkHash(chunk: Blob): Promise<string> {
    const buffer = await chunk.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Busca sesión existente para el mismo archivo
   */
  private findExistingSession(fileName: string, fileSize: number, checksum: string): ResumableUploadSession | null {
    for (const session of this.sessions.values()) {
      if (session.fileName === fileName && 
          session.fileSize === fileSize && 
          session.checksum === checksum) {
        return session;
      }
    }
    return null;
  }

  /**
   * Actualiza progreso del upload
   */
  private updateProgress(uploadId: string): void {
    const session = this.sessions.get(uploadId);
    const callback = this.progressCallbacks.get(uploadId);
    
    if (!session || !callback) return;

    const uploadedBytes = session.completedChunks.size * session.chunkSize;
    const percentage = (session.completedChunks.size / session.totalChunks) * 100;
    const elapsedTime = (Date.now() - session.startTime) / 1000;
    const speed = elapsedTime > 0 ? uploadedBytes / elapsedTime : 0;
    const remainingBytes = session.fileSize - uploadedBytes;
    const estimatedTimeRemaining = speed > 0 ? remainingBytes / speed : 0;

    const progress: UploadProgress = {
      uploadId,
      percentage: Math.min(percentage, 100),
      uploadedBytes,
      totalBytes: session.fileSize,
      chunksCompleted: session.completedChunks.size,
      totalChunks: session.totalChunks,
      speed,
      estimatedTimeRemaining,
      currentChunk: Math.max(...session.completedChunks, 0),
      retryCount: session.failedChunks.size
    };

    callback(progress);
  }

  /**
   * Inicializa sesión en el servidor
   */
  private async initializeServerSession(session: ResumableUploadSession): Promise<void> {
    await fetch('/api/upload/resumable/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId: session.uploadId,
        fileName: session.fileName,
        fileSize: session.fileSize,
        totalChunks: session.totalChunks,
        chunkSize: session.chunkSize,
        checksum: session.checksum,
        metadata: session.metadata
      })
    });
  }

  /**
   * Verifica estado de sesión en el servidor
   */
  private async verifyServerSession(session: ResumableUploadSession): Promise<void> {
    const response = await fetch(`/api/upload/resumable/status/${session.uploadId}`);
    if (response.ok) {
      const serverStatus = await response.json();
      // Sincronizar chunks completados con el servidor
      session.completedChunks.clear();
      serverStatus.completedChunks.forEach((chunk: number) => {
        session.completedChunks.add(chunk);
      });
    }
  }

  /**
   * Obtiene todas las sesiones de upload activas
   */
  getActiveSessions(): ResumableUploadSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Pausa un upload
   */
  pauseUpload(uploadId: string): void {
    this.activeUploads.delete(uploadId);
    console.log(`[RESUMABLE-UPLOAD] Upload pausado: ${uploadId}`);
  }

  /**
   * Cancela un upload y limpia recursos
   */
  async cancelUpload(uploadId: string): Promise<void> {
    this.activeUploads.delete(uploadId);
    this.sessions.delete(uploadId);
    this.progressCallbacks.delete(uploadId);
    
    // Notificar al servidor
    try {
      await fetch(`/api/upload/resumable/cancel/${uploadId}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`[RESUMABLE-UPLOAD] Error cancelando en servidor: ${error}`);
    }
    
    this.saveSessions();
    console.log(`[RESUMABLE-UPLOAD] Upload cancelado: ${uploadId}`);
  }

  /**
   * Guarda sesiones en localStorage
   */
  private saveSessions(): void {
    try {
      const sessionData = Array.from(this.sessions.entries()).map(([id, session]) => [
        id,
        {
          ...session,
          completedChunks: Array.from(session.completedChunks),
          failedChunks: Array.from(session.failedChunks)
        }
      ]);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessionData));
    } catch (error) {
      console.warn('[RESUMABLE-UPLOAD] Failed to save sessions:', error);
    }
  }

  /**
   * Carga sesiones desde localStorage
   */
  private loadSessions(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const sessionData = JSON.parse(saved);
        sessionData.forEach(([id, data]: [string, any]) => {
          const session: ResumableUploadSession = {
            ...data,
            completedChunks: new Set(data.completedChunks),
            failedChunks: new Set(data.failedChunks)
          };
          this.sessions.set(id, session);
        });
        console.log(`[RESUMABLE-UPLOAD] ${sessionData.length} sesiones cargadas`);
      }
    } catch (error) {
      console.warn('[RESUMABLE-UPLOAD] Failed to load sessions:', error);
    }
  }

  /**
   * Guarda sesiones periódicamente
   */
  private startPeriodicSave(): void {
    setInterval(() => {
      this.saveSessions();
    }, 30000); // Guardar cada 30 segundos
  }
}

export const resumableUploadManager = new ResumableUploadManager();
