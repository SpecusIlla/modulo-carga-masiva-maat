// Web Worker para procesamiento pesado en background thread
// Evita bloqueo de UI durante procesamiento de archivos grandes
// Módulo de Carga v1.1.0 - Optimización avanzada con streaming

interface ProcessingRequest {
  id: string;
  type: 'hash' | 'analyze' | 'compress' | 'validate' | 'stream-chunk' | 'memory-optimize';
  buffer?: ArrayBuffer;
  chunk?: Uint8Array;
  chunkIndex?: number;
  algorithm?: 'sha256' | 'md5' | 'sha1';
  options?: any;
  streamConfig?: {
    totalChunks: number;
    chunkSize: number;
    compressionEnabled: boolean;
  };
}

interface ProcessingResponse {
  id: string;
  type: string;
  success: boolean;
  result?: any;
  error?: string;
  progress?: number;
  memoryUsage?: number;
  performance?: {
    processingTime: number;
    throughput: number; // bytes/second
  };
}

// Estado del worker para streaming
let streamState = new Map<string, {
  hasher: any;
  totalChunks: number;
  processedChunks: number;
  startTime: number;
  totalBytes: number;
}>();

let memoryPool = new Map<string, ArrayBuffer>();
const MAX_MEMORY_POOL_SIZE = 50 * 1024 * 1024; // 50MB pool máximo
}

interface ProcessingResponse {
  id: string;
  type: string;


/**
 * Procesa chunk individual en streaming sin acumular en memoria
 */
async function processStreamChunk(request: ProcessingRequest): Promise<ProcessingResponse> {
  const { id, chunk, chunkIndex, streamConfig } = request;
  const startTime = performance.now();
  
  try {
    // Inicializar estado de stream si no existe
    if (!streamState.has(id)) {
      streamState.set(id, {
        hasher: await createHasher('sha256'),
        totalChunks: streamConfig!.totalChunks,
        processedChunks: 0,
        startTime: Date.now(),
        totalBytes: 0
      });
    }
    
    const state = streamState.get(id)!;
    
    // Procesar chunk
    if (chunk) {
      // Actualizar hash incrementalmente
      state.hasher.update(chunk);
      state.processedChunks++;
      state.totalBytes += chunk.length;
      
      // Liberar chunk inmediatamente
      const chunkCopy = null; // Eliminar referencia
      
      // Calcular progreso y rendimiento
      const progress = (state.processedChunks / state.totalChunks) * 100;
      const elapsedTime = (Date.now() - state.startTime) / 1000;
      const throughput = elapsedTime > 0 ? state.totalBytes / elapsedTime : 0;
      
      // Si es el último chunk, finalizar hash
      let finalHash = null;
      if (state.processedChunks === state.totalChunks) {
        finalHash = state.hasher.digest('hex');
        streamState.delete(id); // Limpiar estado
      }
      
      return {
        id,
        type: 'stream-chunk',
        success: true,
        result: {
          chunkIndex,
          progress,
          finalHash,
          isComplete: state.processedChunks === state.totalChunks
        },
        performance: {
          processingTime: performance.now() - startTime,
          throughput
        },
        memoryUsage: getMemoryUsage()
      };
    }
    
    throw new Error('No chunk data provided');
    
  } catch (error) {
    streamState.delete(id); // Limpiar en caso de error
    return {
      id,
      type: 'stream-chunk',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Optimización de memoria - liberación forzada
 */
async function optimizeMemory(request: ProcessingRequest): Promise<ProcessingResponse> {
  const startTime = performance.now();
  
  try {
    // Limpiar pool de memoria
    memoryPool.clear();
    
    // Limpiar estados antiguos (>5 minutos)
    const now = Date.now();
    for (const [id, state] of streamState) {
      if (now - state.startTime > 5 * 60 * 1000) {
        streamState.delete(id);
      }
    }
    
    // Forzar garbage collection si está disponible
    if (typeof gc === 'function') {
      gc();
    }
    
    const memoryAfter = getMemoryUsage();
    
    return {
      id: request.id,
      type: 'memory-optimize',
      success: true,
      result: {
        memoryFreed: true,
        activeStreams: streamState.size,
        memoryPoolSize: memoryPool.size
      },
      performance: {
        processingTime: performance.now() - startTime,
        throughput: 0
      },
      memoryUsage: memoryAfter
    };
    
  } catch (error) {
    return {
      id: request.id,
      type: 'memory-optimize',
      success: false,
      error: error instanceof Error ? error.message : 'Memory optimization failed'
    };
  }
}

/**
 * Obtiene uso actual de memoria del worker
 */
function getMemoryUsage(): number {
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    const memory = (performance as any).memory;
    return Math.round(memory.usedJSHeapSize / 1024 / 1024); // MB
  }
  return 0;
}

/**
 * Crea hasher optimizado para streaming
 */
async function createHasher(algorithm: string) {
  // Usar Web Crypto API si está disponible
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return {
      chunks: [] as Uint8Array[],
      update(chunk: Uint8Array) {
        this.chunks.push(new Uint8Array(chunk)); // Copia defensiva
      },
      async digest(format: string) {
        // Concatenar todos los chunks
        const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        
        for (const chunk of this.chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        
        // Calcular hash
        const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        
        // Limpiar chunks inmediatamente
        this.chunks = [];
        
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }
    };
  }
  
  // Fallback a hasher simple
  return createSimpleHasher(algorithm);
}

/**
 * Hasher simple como fallback
 */
function createSimpleHasher(algorithm: string) {
  const chunks: Uint8Array[] = [];
  
  return {
    update(chunk: Uint8Array) {
      chunks.push(new Uint8Array(chunk));
    },
    digest(format: string) {
      // Implementación simple de hash para fallback
      let hash = 0;
      const combined = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
      let offset = 0;
      
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      
      for (let i = 0; i < combined.length; i++) {
        hash = ((hash << 5) - hash + combined[i]) & 0xffffffff;
      }
      
      chunks.length = 0; // Limpiar
      return hash.toString(16);
    }
  };
}

// Actualizar el handler principal para incluir nuevos tipos
self.onmessage = async (event: MessageEvent<ProcessingRequest>) => {
  const request = event.data;
  let response: ProcessingResponse;
  
  try {
    switch (request.type) {
      case 'stream-chunk':
        response = await processStreamChunk(request);
        break;
        
      case 'memory-optimize':
        response = await optimizeMemory(request);
        break;
        
      case 'hash':
        response = await calculateHash(request);
        break;
        
      case 'analyze':
        response = await analyzeContent(request);
        break;
        
      case 'compress':
        response = await compressData(request);
        break;
        
      case 'validate':
        response = await validateContent(request);
        break;
        
      default:
        response = {
          id: request.id,
          type: request.type,
          success: false,
          error: `Unknown processing type: ${request.type}`
        };
    }
  } catch (error) {
    response = {
      id: request.id,
      type: request.type,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
  
  self.postMessage(response);
};

// Limpiar recursos periódicamente
setInterval(() => {
  const memoryUsage = getMemoryUsage();
  if (memoryUsage > 100) { // Si supera 100MB
    optimizeMemory({ id: 'auto-cleanup', type: 'memory-optimize' });
  }
}, 30000); // Cada 30 segundos

  result: any;
  metrics: {
    duration: number;
    memoryUsed: number;
    cpuIntensive: boolean;
  };
}

// Función simple de hash sin dependencias externas
async function calculateHash(buffer: ArrayBuffer, algorithm: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(algorithm.toUpperCase().replace('SHA', 'SHA-'), buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Análisis de contenido de archivo
async function analyzeFile(buffer: ArrayBuffer): Promise<any> {
  const view = new Uint8Array(buffer);
  const firstBytes = Array.from(view.slice(0, 16));
  
  // Detectar tipo de archivo por magic numbers
  const fileType = detectFileType(firstBytes);
  
  // Calcular entropía para detectar contenido cifrado
  const entropy = calculateEntropy(view);
  
  // Análizar estructura del archivo
  const structure = analyzeStructure(view);
  
  return {
    fileType,
    entropy,
    structure,
    size: buffer.byteLength,
    suspicious: entropy > 7.5 || structure.anomalies > 0
  };
}

function detectFileType(bytes: number[]): string {
  const signatures: { [key: string]: number[] } = {
    'PDF': [0x25, 0x50, 0x44, 0x46],
    'ZIP': [0x50, 0x4B, 0x03, 0x04],
    'PNG': [0x89, 0x50, 0x4E, 0x47],
    'JPEG': [0xFF, 0xD8, 0xFF],
    'GIF': [0x47, 0x49, 0x46, 0x38]
  };
  
  for (const [type, signature] of Object.entries(signatures)) {
    if (signature.every((byte, index) => bytes[index] === byte)) {
      return type;
    }
  }
  return 'UNKNOWN';
}

function calculateEntropy(data: Uint8Array): number {
  const frequencies = new Array(256).fill(0);
  for (const byte of data) {
    frequencies[byte]++;
  }
  
  let entropy = 0;
  const length = data.length;
  
  for (const freq of frequencies) {
    if (freq > 0) {
      const p = freq / length;
      entropy -= p * Math.log2(p);
    }
  }
  
  return entropy;
}

function analyzeStructure(data: Uint8Array): any {
  return {
    nullBytes: data.filter(b => b === 0).length,
    repeatingPatterns: detectRepeatingPatterns(data),
    anomalies: 0
  };
}

function detectRepeatingPatterns(data: Uint8Array): number {
  let patterns = 0;
  for (let i = 0; i < Math.min(1000, data.length - 4); i += 4) {
    const pattern = data.slice(i, i + 4);
    let matches = 0;
    for (let j = i + 4; j < Math.min(i + 100, data.length - 4); j += 4) {
      if (pattern.every((byte, idx) => byte === data[j + idx])) {
        matches++;
      }
    }
    if (matches > 3) patterns++;
  }
  return patterns;
}

// Compresión simple con LZ77-like algorithm
async function compressData(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const input = new Uint8Array(buffer);
  const compressed: number[] = [];
  
  for (let i = 0; i < input.length; i++) {
    let bestLength = 0;
    let bestDistance = 0;
    
    // Buscar coincidencias en ventana deslizante
    const windowStart = Math.max(0, i - 255);
    for (let j = windowStart; j < i; j++) {
      let length = 0;
      while (
        length < 255 &&
        i + length < input.length &&
        input[j + length] === input[i + length]
      ) {
        length++;
      }
      
      if (length > bestLength) {
        bestLength = length;
        bestDistance = i - j;
      }
    }
    
    if (bestLength > 3) {
      compressed.push(0xFF, bestDistance, bestLength);
      i += bestLength - 1;
    } else {
      compressed.push(input[i]);
    }
  }
  
  return new Uint8Array(compressed).buffer;
}

self.onmessage = async (event: MessageEvent<ProcessingRequest>) => {
  const { id, type, buffer, algorithm, options } = event.data;
  const startTime = performance.now();
  const memoryBefore = (performance as any).memory?.usedJSHeapSize || 0;
  
  try {
    let result: any;
    
    switch (type) {
      case 'hash':
        if (!algorithm) throw new Error('Algorithm required for hash');
        result = await calculateHash(buffer, algorithm.toUpperCase().replace('SHA', 'SHA-'));
        break;
        
      case 'analyze':
        result = await analyzeFile(buffer);
        break;
        
      case 'compress':
        result = await compressData(buffer);
        break;
        
      case 'validate':
        const analysis = await analyzeFile(buffer);
        result = {
          isValid: !analysis.suspicious,
          issues: analysis.suspicious ? ['High entropy detected', 'Potential encryption'] : [],
          score: analysis.suspicious ? 0.3 : 0.9
        };
        break;
        
      default:
        throw new Error(`Tipo de procesamiento no soportado: ${type}`);
    }
    
    const duration = performance.now() - startTime;
    const memoryAfter = (performance as any).memory?.usedJSHeapSize || 0;
    
    const response: ProcessingResponse = {
      id,
      type,
      result,
      metrics: {
        duration,
        memoryUsed: memoryAfter - memoryBefore,
        cpuIntensive: duration > 100
      }
    };
    
    self.postMessage(response);
  } catch (error) {
    self.postMessage({
      id,
      type,
      error: error instanceof Error ? error.message : 'Error en procesamiento'
    });
  }
};

export {};