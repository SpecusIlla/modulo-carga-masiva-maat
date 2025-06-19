// Web Worker para procesamiento pesado en background thread
// Evita bloqueo de UI durante procesamiento de archivos grandes
// Módulo de Carga v1.1.0 - Optimización avanzada

interface ProcessingRequest {
  id: string;
  type: 'hash' | 'analyze' | 'compress' | 'validate';
  buffer: ArrayBuffer;
  algorithm?: 'sha256' | 'md5' | 'sha1';
  options?: any;
}

interface ProcessingResponse {
  id: string;
  type: string;
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