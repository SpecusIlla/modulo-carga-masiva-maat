
// Sistema de streaming de archivos sin carga en RAM - MAAT v1.1.0
// Procesa archivos grandes directamente desde disco sin usar memoria del navegador

export interface StreamConfig {
  chunkSize: number;
  maxConcurrentChunks: number;
  enableCompression: boolean;
  fallbackThreshold: number; // MB
  memoryLimit: number; // MB
}

export interface StreamProgress {
  bytesProcessed: number;
  totalBytes: number;
  chunksProcessed: number;
  totalChunks: number;
  currentSpeed: number; // bytes/second
  memoryUsage: number; // MB
  estimatedTimeRemaining: number; // seconds
}

export class ZeroMemoryStreamManager {
  private config: StreamConfig;
  private activeStreams = new Map<string, ReadableStreamDefaultReader>();
  private memoryMonitor: PerformanceObserver | null = null;
  
  constructor(config: Partial<StreamConfig> = {}) {
    this.config = {
      chunkSize: this.getOptimalChunkSize(),
      maxConcurrentChunks: this.getMaxConcurrentChunks(),
      enableCompression: true,
      fallbackThreshold: 50, // 50MB threshold para fallback
      memoryLimit: this.getMemoryLimit(),
      ...config
    };
    
    this.initializeMemoryMonitoring();
  }

  /**
   * Procesa archivo grande con streaming puro - sin carga en RAM
   */
  async streamFile(
    file: File,
    onProgress: (progress: StreamProgress) => void,
    onChunk: (chunk: Uint8Array, index: number) => Promise<void>
  ): Promise<void> {
    const streamId = `stream_${Date.now()}_${Math.random().toString(36)}`;
    
    try {
      // Verificar si necesitamos fallback
      if (file.size > this.config.fallbackThreshold * 1024 * 1024) {
        return await this.streamLargeFile(file, streamId, onProgress, onChunk);
      } else {
        return await this.streamSmallFile(file, streamId, onProgress, onChunk);
      }
    } catch (error) {
      console.error(`[ZERO-MEMORY-STREAM] Error processing file: ${error}`);
      throw error;
    }
  }

  /**
   * Streaming optimizado para archivos grandes >50MB
   */
  private async streamLargeFile(
    file: File,
    streamId: string,
    onProgress: (progress: StreamProgress) => void,
    onChunk: (chunk: Uint8Array, index: number) => Promise<void>
  ): Promise<void> {
    const totalChunks = Math.ceil(file.size / this.config.chunkSize);
    let chunksProcessed = 0;
    let bytesProcessed = 0;
    const startTime = Date.now();

    console.log(`[ZERO-MEMORY-STREAM] Starting large file streaming: ${file.name} (${totalChunks} chunks)`);

    // Crear ReadableStream desde el archivo
    const fileStream = file.stream();
    const reader = fileStream.getReader();
    this.activeStreams.set(streamId, reader);

    try {
      let chunkIndex = 0;
      let buffer = new Uint8Array(0);

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          // Procesar último chunk si queda data
          if (buffer.length > 0) {
            await this.processChunk(buffer, chunkIndex, onChunk);
            bytesProcessed += buffer.length;
            chunksProcessed++;
          }
          break;
        }

        // Acumular data hasta alcanzar el tamaño de chunk deseado
        buffer = this.concatenateArrays(buffer, value);

        // Procesar chunks completos
        while (buffer.length >= this.config.chunkSize) {
          const chunk = buffer.slice(0, this.config.chunkSize);
          const remaining = buffer.slice(this.config.chunkSize);

          await this.processChunk(chunk, chunkIndex, onChunk);
          
          bytesProcessed += chunk.length;
          chunksProcessed++;
          chunkIndex++;

          // Actualizar progreso
          const elapsedTime = (Date.now() - startTime) / 1000;
          const speed = elapsedTime > 0 ? bytesProcessed / elapsedTime : 0;
          const remainingBytes = file.size - bytesProcessed;
          const estimatedTimeRemaining = speed > 0 ? remainingBytes / speed : 0;

          onProgress({
            bytesProcessed,
            totalBytes: file.size,
            chunksProcessed,
            totalChunks,
            currentSpeed: speed,
            memoryUsage: await this.getCurrentMemoryUsage(),
            estimatedTimeRemaining
          });

          buffer = remaining;

          // Control de memoria - pausar si excedemos límites
          const currentMemory = await this.getCurrentMemoryUsage();
          if (currentMemory > this.config.memoryLimit) {
            console.warn(`[ZERO-MEMORY-STREAM] Memory limit exceeded: ${currentMemory}MB`);
            await this.waitForMemoryRelease();
          }
        }
      }

      console.log(`[ZERO-MEMORY-STREAM] Large file streaming completed: ${file.name}`);

    } finally {
      this.activeStreams.delete(streamId);
      reader.releaseLock();
    }
  }

  /**
   * Streaming optimizado para archivos pequeños <50MB
   */
  private async streamSmallFile(
    file: File,
    streamId: string,
    onProgress: (progress: StreamProgress) => void,
    onChunk: (chunk: Uint8Array, index: number) => Promise<void>
  ): Promise<void> {
    const totalChunks = Math.ceil(file.size / this.config.chunkSize);
    let chunksProcessed = 0;
    const startTime = Date.now();

    console.log(`[ZERO-MEMORY-STREAM] Starting small file streaming: ${file.name}`);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.config.chunkSize;
      const end = Math.min(start + this.config.chunkSize, file.size);
      
      // Slice del archivo - esto es eficiente y no carga todo en memoria
      const chunkBlob = file.slice(start, end);
      const chunkArrayBuffer = await chunkBlob.arrayBuffer();
      const chunk = new Uint8Array(chunkArrayBuffer);

      await this.processChunk(chunk, i, onChunk);
      chunksProcessed++;

      // Actualizar progreso
      const elapsedTime = (Date.now() - startTime) / 1000;
      const bytesProcessed = end;
      const speed = elapsedTime > 0 ? bytesProcessed / elapsedTime : 0;
      const remainingBytes = file.size - bytesProcessed;
      const estimatedTimeRemaining = speed > 0 ? remainingBytes / speed : 0;

      onProgress({
        bytesProcessed,
        totalBytes: file.size,
        chunksProcessed,
        totalChunks,
        currentSpeed: speed,
        memoryUsage: await this.getCurrentMemoryUsage(),
        estimatedTimeRemaining
      });

      // Pequeña pausa para evitar bloquear UI
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    console.log(`[ZERO-MEMORY-STREAM] Small file streaming completed: ${file.name}`);
  }

  /**
   * Procesa un chunk individual
   */
  private async processChunk(
    chunk: Uint8Array,
    index: number,
    onChunk: (chunk: Uint8Array, index: number) => Promise<void>
  ): Promise<void> {
    try {
      await onChunk(chunk, index);
    } catch (error) {
      console.error(`[ZERO-MEMORY-STREAM] Error processing chunk ${index}:`, error);
      throw error;
    }
  }

  /**
   * Concatena dos Uint8Arrays de manera eficiente
   */
  private concatenateArrays(array1: Uint8Array, array2: Uint8Array): Uint8Array {
    const result = new Uint8Array(array1.length + array2.length);
    result.set(array1, 0);
    result.set(array2, array1.length);
    return result;
  }

  /**
   * Obtiene el tamaño óptimo de chunk basado en el dispositivo
   */
  private getOptimalChunkSize(): number {
    // Detectar capacidades del dispositivo
    const memory = (navigator as any).deviceMemory || 4; // GB
    const connection = (navigator as any).connection?.effectiveType || '4g';
    
    if (memory <= 2) {
      return 256 * 1024; // 256KB para dispositivos limitados
    } else if (memory <= 4) {
      return 512 * 1024; // 512KB para dispositivos medios
    } else {
      return 1024 * 1024; // 1MB para dispositivos potentes
    }
  }

  /**
   * Obtiene el máximo de chunks concurrentes basado en el dispositivo
   */
  private getMaxConcurrentChunks(): number {
    const memory = (navigator as any).deviceMemory || 4;
    return Math.min(Math.max(Math.floor(memory / 2), 1), 8);
  }

  /**
   * Obtiene el límite de memoria basado en el dispositivo
   */
  private getMemoryLimit(): number {
    const memory = (navigator as any).deviceMemory || 4;
    return Math.floor(memory * 1024 * 0.25); // 25% de la RAM disponible
  }

  /**
   * Monitorea el uso de memoria en tiempo real
   */
  private initializeMemoryMonitoring(): void {
    if ('PerformanceObserver' in window && 'memory' in performance) {
      try {
        this.memoryMonitor = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            if (entry.name === 'measure-memory') {
              console.log(`[ZERO-MEMORY-STREAM] Memory usage: ${entry.duration}MB`);
            }
          });
        });
        
        this.memoryMonitor.observe({ entryTypes: ['measure'] });
      } catch (error) {
        console.warn('[ZERO-MEMORY-STREAM] Memory monitoring not available');
      }
    }
  }

  /**
   * Obtiene el uso actual de memoria
   */
  private async getCurrentMemoryUsage(): Promise<number> {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return Math.round(memory.usedJSHeapSize / 1024 / 1024); // Convert to MB
    }
    return 0;
  }

  /**
   * Espera a que se libere memoria
   */
  private async waitForMemoryRelease(): Promise<void> {
    return new Promise(resolve => {
      const checkMemory = async () => {
        const currentMemory = await this.getCurrentMemoryUsage();
        if (currentMemory <= this.config.memoryLimit * 0.8) { // 80% del límite
          resolve();
        } else {
          // Forzar garbage collection si está disponible
          if ('gc' in window) {
            (window as any).gc();
          }
          setTimeout(checkMemory, 100);
        }
      };
      checkMemory();
    });
  }

  /**
   * Cancela todos los streams activos
   */
  async cancelAllStreams(): Promise<void> {
    for (const [streamId, reader] of this.activeStreams) {
      try {
        await reader.cancel();
        reader.releaseLock();
      } catch (error) {
        console.warn(`[ZERO-MEMORY-STREAM] Error canceling stream ${streamId}:`, error);
      }
    }
    this.activeStreams.clear();
  }

  /**
   * Limpia recursos y detiene monitoreo
   */
  cleanup(): void {
    this.cancelAllStreams();
    if (this.memoryMonitor) {
      this.memoryMonitor.disconnect();
    }
  }
}

export const zeroMemoryStreamManager = new ZeroMemoryStreamManager();
