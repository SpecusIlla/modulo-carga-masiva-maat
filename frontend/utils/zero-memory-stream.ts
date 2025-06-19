
// Streaming verdaderamente zero-memory para archivos grandes - MAAT v1.1.1
// Sin carga completa en RAM - Chunks máximos de 1MB

export interface StreamConfig {
  readonly chunkSize: number;
  readonly maxBufferSize: number;
  readonly enableBackpressure: boolean;
  readonly compressionLevel: number;
}

export interface StreamProgress {
  readonly bytesProcessed: number;
  readonly totalBytes: number;
  readonly currentChunk: number;
  readonly totalChunks: number;
  readonly speed: number; // bytes/second
  readonly estimatedTimeRemaining: number;
}

export interface StreamResult {
  readonly success: boolean;
  readonly bytesProcessed: number;
  readonly processingTime: number;
  readonly chunks: number;
  readonly hash: string;
  readonly compressionRatio?: number;
  readonly error?: string;
}

export class ZeroMemoryStreamer {
  private readonly config: StreamConfig;
  private readonly activeStreams = new Map<string, AbortController>();
  private readonly ABSOLUTE_CHUNK_LIMIT = 1024 * 1024; // 1MB límite absoluto

  constructor(config: Partial<StreamConfig> = {}) {
    this.config = {
      chunkSize: Math.min(512 * 1024, config.chunkSize || 512 * 1024), // 512KB por defecto, máximo 1MB
      maxBufferSize: Math.min(2 * 1024 * 1024, config.maxBufferSize || 1024 * 1024), // 1MB buffer máximo
      enableBackpressure: config.enableBackpressure ?? true,
      compressionLevel: config.compressionLevel || 6,
      ...config
    };

    // Forzar límites seguros
    if (this.config.chunkSize > this.ABSOLUTE_CHUNK_LIMIT) {
      this.config = { ...this.config, chunkSize: this.ABSOLUTE_CHUNK_LIMIT };
      console.warn(`[ZERO-MEMORY-STREAM] Chunk size limitado a ${this.ABSOLUTE_CHUNK_LIMIT} bytes para seguridad`);
    }
  }

  /**
   * Procesa archivo con streaming real sin cargar en memoria
   */
  async streamFile(
    file: File,
    onProgress?: (progress: StreamProgress) => void,
    onChunk?: (chunk: Uint8Array, index: number) => Promise<void>
  ): Promise<StreamResult> {
    const streamId = `stream_${Date.now()}_${Math.random().toString(36)}`;
    const abortController = new AbortController();
    this.activeStreams.set(streamId, abortController);

    const startTime = Date.now();
    const totalBytes = file.size;
    const totalChunks = Math.ceil(totalBytes / this.config.chunkSize);
    
    let bytesProcessed = 0;
    let currentChunk = 0;
    let hashCalculator: any = null;

    try {
      // Inicializar hash calculator en worker si está disponible
      if (typeof Worker !== 'undefined') {
        hashCalculator = await this.initializeHashWorker();
      }

      // Crear reader del archivo
      const reader = file.stream().getReader();
      let buffer = new Uint8Array(0);
      
      while (true) {
        // Verificar si fue cancelado
        if (abortController.signal.aborted) {
          throw new Error('Streaming cancelado por el usuario');
        }

        // Leer siguiente chunk del stream
        const { done, value } = await reader.read();
        
        if (done && buffer.length === 0) {
          break; // Terminar si no hay más datos
        }

        // Combinar con buffer existente si es necesario
        if (value) {
          const newBuffer = new Uint8Array(buffer.length + value.length);
          newBuffer.set(buffer);
          newBuffer.set(value, buffer.length);
          buffer = newBuffer;
        }

        // Procesar chunks completos del buffer
        while (buffer.length >= this.config.chunkSize || (done && buffer.length > 0)) {
          const chunkSize = Math.min(this.config.chunkSize, buffer.length);
          const chunk = buffer.slice(0, chunkSize);
          
          // Actualizar hash de forma incremental
          if (hashCalculator) {
            hashCalculator.postMessage({ type: 'update', data: chunk });
          }

          // Procesar chunk (upload, análisis, etc.)
          if (onChunk) {
            await onChunk(chunk, currentChunk);
          }

          // Actualizar progreso
          bytesProcessed += chunkSize;
          currentChunk++;
          
          const speed = bytesProcessed / ((Date.now() - startTime) / 1000);
          const estimatedTimeRemaining = speed > 0 ? (totalBytes - bytesProcessed) / speed : 0;

          if (onProgress) {
            onProgress({
              bytesProcessed,
              totalBytes,
              currentChunk,
              totalChunks,
              speed,
              estimatedTimeRemaining
            });
          }

          // Remover chunk procesado del buffer
          buffer = buffer.slice(chunkSize);

          // Implementar backpressure si está habilitado
          if (this.config.enableBackpressure && buffer.length > this.config.maxBufferSize) {
            await this.sleep(10); // Pausa pequeña para permitir que se libere memoria
          }

          // Si terminamos y no hay más buffer, salir
          if (done && buffer.length === 0) {
            break;
          }
        }

        if (done) {
          break;
        }
      }

      reader.releaseLock();

      // Finalizar hash
      let finalHash = '';
      if (hashCalculator) {
        finalHash = await this.finalizeHash(hashCalculator);
      }

      const processingTime = Date.now() - startTime;

      console.log(`[ZERO-MEMORY-STREAM] Archivo procesado: ${bytesProcessed} bytes en ${currentChunk} chunks`);

      return {
        success: true,
        bytesProcessed,
        processingTime,
        chunks: currentChunk,
        hash: finalHash,
        compressionRatio: undefined
      };

    } catch (error) {
      console.error('[ZERO-MEMORY-STREAM] Error en streaming:', error);
      
      return {
        success: false,
        bytesProcessed,
        processingTime: Date.now() - startTime,
        chunks: currentChunk,
        hash: '',
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    } finally {
      this.activeStreams.delete(streamId);
      
      // Cleanup hash worker
      if (hashCalculator) {
        hashCalculator.terminate();
      }
    }
  }

  /**
   * Cancela un stream activo
   */
  cancelStream(streamId?: string): void {
    if (streamId && this.activeStreams.has(streamId)) {
      this.activeStreams.get(streamId)?.abort();
      this.activeStreams.delete(streamId);
    } else {
      // Cancelar todos los streams activos
      for (const [id, controller] of this.activeStreams.entries()) {
        controller.abort();
        this.activeStreams.delete(id);
      }
    }
    console.log(`[ZERO-MEMORY-STREAM] Stream(s) cancelado(s)`);
  }

  /**
   * Inicializa worker para cálculo de hash
   */
  private async initializeHashWorker(): Promise<Worker> {
    try {
      const worker = new Worker(
        new URL('../workers/hash-calculator.ts', import.meta.url),
        { type: 'module' }
      );
      
      worker.postMessage({ type: 'init', algorithm: 'SHA-256' });
      return worker;
    } catch (error) {
      console.warn('[ZERO-MEMORY-STREAM] Hash worker no disponible, usando fallback');
      throw error;
    }
  }

  /**
   * Finaliza el cálculo de hash
   */
  private async finalizeHash(worker: Worker): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Hash calculation timeout'));
      }, 5000);

      worker.onmessage = (e) => {
        if (e.data.type === 'result') {
          clearTimeout(timeout);
          resolve(e.data.hash);
        }
      };

      worker.onerror = (error) => {
        clearTimeout(timeout);
        reject(error);
      };

      worker.postMessage({ type: 'finalize' });
    });
  }

  /**
   * Obtiene estadísticas de memoria actual
   */
  getMemoryStats(): {
    activeStreams: number;
    estimatedMemoryUsage: number;
    maxChunkSize: number;
    maxBufferSize: number;
  } {
    return {
      activeStreams: this.activeStreams.size,
      estimatedMemoryUsage: this.activeStreams.size * this.config.maxBufferSize,
      maxChunkSize: this.config.chunkSize,
      maxBufferSize: this.config.maxBufferSize
    };
  }

  /**
   * Verifica si el sistema puede manejar un archivo de cierto tamaño
   */
  canHandleFile(fileSize: number): {
    canHandle: boolean;
    reason?: string;
    recommendedChunkSize?: number;
  } {
    // Verificar memoria disponible aproximada
    const estimatedMemoryNeed = this.config.maxBufferSize;
    const memoryInfo = (performance as any).memory;
    
    if (memoryInfo) {
      const availableMemory = memoryInfo.jsHeapSizeLimit - memoryInfo.usedJSHeapSize;
      
      if (estimatedMemoryNeed > availableMemory * 0.8) { // Usar máximo 80% de memoria disponible
        const recommendedChunkSize = Math.min(
          Math.floor(availableMemory * 0.1), // 10% de memoria disponible por chunk
          512 * 1024 // Máximo 512KB
        );
        
        return {
          canHandle: false,
          reason: 'Memoria insuficiente para el tamaño de chunk actual',
          recommendedChunkSize
        };
      }
    }

    // Verificar si el archivo es demasiado pequeño (overhead innecesario)
    if (fileSize < this.config.chunkSize / 4) {
      return {
        canHandle: true,
        reason: 'Archivo pequeño - considerar carga directa en lugar de streaming'
      };
    }

    return { canHandle: true };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const zeroMemoryStreamer = new ZeroMemoryStreamer();
