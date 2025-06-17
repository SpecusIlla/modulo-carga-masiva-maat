// Web Worker para cálculo de hash en background thread
// Evita bloqueo de UI durante procesamiento de archivos grandes
// Módulo de Carga v1.0.0 - Optimización de rendimiento

interface HashRequest {
  id: string;
  buffer: ArrayBuffer;
  algorithm: 'sha256' | 'md5' | 'sha1';
}

interface HashResponse {
  id: string;
  hash: string;
  size: number;
  duration: number;
}

// Función simple de hash sin dependencias externas
async function calculateHash(buffer: ArrayBuffer, algorithm: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(algorithm.toUpperCase().replace('SHA', 'SHA-'), buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

self.onmessage = async (event: MessageEvent<HashRequest>) => {
  const { id, buffer, algorithm } = event.data;
  const startTime = performance.now();
  
  try {
    let hash: string;
    
    // Usar Web Crypto API para mejor rendimiento
    switch (algorithm) {
      case 'sha256':
        hash = await calculateHash(buffer, 'SHA-256');
        break;
      case 'sha1':
        hash = await calculateHash(buffer, 'SHA-1');
        break;
      default:
        throw new Error(`Algoritmo no soportado: ${algorithm}`);
    }
    
    const duration = performance.now() - startTime;
    
    const response: HashResponse = {
      id,
      hash,
      size: buffer.byteLength,
      duration
    };
    
    self.postMessage(response);
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Error calculando hash'
    });
  }
};

export {};