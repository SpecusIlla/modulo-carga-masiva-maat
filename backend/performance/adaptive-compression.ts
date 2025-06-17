// Sistema de compresión adaptativa
// Módulo de Carga v1.0.0 - Selección automática de algoritmo

import { createGzip, createDeflate, createBrotliCompress } from 'zlib';
import { promisify } from 'util';
import * as path from 'path';

interface CompressionResult {
  algorithm: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  compressionTime: number;
  data: Buffer;
}

interface CompressionStrategy {
  name: string;
  compressor: any;
  options: any;
  bestFor: string[];
}

export class AdaptiveCompressionEngine {
  private strategies: CompressionStrategy[];

  constructor() {
    this.strategies = [
      {
        name: 'gzip',
        compressor: createGzip,
        options: { level: 6, windowBits: 15 },
        bestFor: ['.txt', '.json', '.html', '.css', '.js', '.xml', '.csv']
      },
      {
        name: 'deflate',
        compressor: createDeflate,
        options: { level: 6 },
        bestFor: ['.log', '.sql', '.md']
      },
      {
        name: 'brotli',
        compressor: createBrotliCompress,
        options: { 
          params: {
            [require('zlib').constants.BROTLI_PARAM_QUALITY]: 6,
            [require('zlib').constants.BROTLI_PARAM_SIZE_HINT]: 0
          }
        },
        bestFor: ['.html', '.css', '.js', '.json', '.svg']
      }
    ];
  }

  async compressFile(buffer: Buffer, filename: string): Promise<CompressionResult> {
    const fileExtension = path.extname(filename).toLowerCase();
    const fileSize = buffer.length;

    // No comprimir archivos ya comprimidos o muy pequeños
    if (this.shouldSkipCompression(fileExtension, fileSize)) {
      return {
        algorithm: 'none',
        originalSize: fileSize,
        compressedSize: fileSize,
        compressionRatio: 1.0,
        compressionTime: 0,
        data: buffer
      };
    }

    // Seleccionar estrategia óptima
    const selectedStrategy = this.selectOptimalStrategy(fileExtension, fileSize);
    
    // Si el archivo es muy grande, usar compresión por chunks
    if (fileSize > 10 * 1024 * 1024) { // 10MB
      return await this.compressLargeFile(buffer, selectedStrategy);
    }

    return await this.compressWithStrategy(buffer, selectedStrategy);
  }

  private shouldSkipCompression(extension: string, size: number): boolean {
    const compressedFormats = [
      '.zip', '.rar', '.7z', '.gz', '.bz2', '.xz',
      '.jpg', '.jpeg', '.png', '.gif', '.webp',
      '.mp3', '.mp4', '.avi', '.mov', '.mkv',
      '.pdf', '.docx', '.xlsx', '.pptx'
    ];

    // Saltar archivos ya comprimidos o muy pequeños
    return compressedFormats.includes(extension) || size < 1024; // < 1KB
  }

  private selectOptimalStrategy(extension: string, fileSize: number): CompressionStrategy {
    // Buscar estrategia específica para el tipo de archivo
    for (const strategy of this.strategies) {
      if (strategy.bestFor.includes(extension)) {
        return strategy;
      }
    }

    // Selección basada en tamaño para archivos genéricos
    if (fileSize > 5 * 1024 * 1024) { // > 5MB
      return this.strategies.find(s => s.name === 'gzip')!; // Mejor balance velocidad/compresión
    } else if (fileSize > 100 * 1024) { // > 100KB
      return this.strategies.find(s => s.name === 'brotli')!; // Mejor compresión para archivos medianos
    } else {
      return this.strategies.find(s => s.name === 'deflate')!; // Más rápido para archivos pequeños
    }
  }

  private async compressWithStrategy(buffer: Buffer, strategy: CompressionStrategy): Promise<CompressionResult> {
    const startTime = Date.now();
    const originalSize = buffer.length;

    try {
      let compressedData: Buffer;

      if (strategy.name === 'brotli') {
        const brotliCompress = promisify(require('zlib').brotliCompress);
        compressedData = await brotliCompress(buffer, strategy.options);
      } else {
        const compress = promisify(strategy.name === 'gzip' ? require('zlib').gzip : require('zlib').deflate);
        compressedData = await compress(buffer, strategy.options);
      }

      const compressionTime = Date.now() - startTime;
      const compressionRatio = compressedData.length / originalSize;

      return {
        algorithm: strategy.name,
        originalSize,
        compressedSize: compressedData.length,
        compressionRatio,
        compressionTime,
        data: compressedData
      };

    } catch (error) {
      // Fallback a sin compresión si hay error
      return {
        algorithm: 'none',
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1.0,
        compressionTime: Date.now() - startTime,
        data: buffer
      };
    }
  }

  private async compressLargeFile(buffer: Buffer, strategy: CompressionStrategy): Promise<CompressionResult> {
    const startTime = Date.now();
    const originalSize = buffer.length;
    const chunkSize = 1024 * 1024; // 1MB chunks
    const compressedChunks: Buffer[] = [];

    try {
      // Procesar archivo en chunks
      for (let offset = 0; offset < buffer.length; offset += chunkSize) {
        const chunk = buffer.slice(offset, Math.min(offset + chunkSize, buffer.length));
        const compressedChunk = await this.compressWithStrategy(chunk, strategy);
        compressedChunks.push(compressedChunk.data);
      }

      const finalData = Buffer.concat(compressedChunks);
      const compressionTime = Date.now() - startTime;

      return {
        algorithm: `${strategy.name}-chunked`,
        originalSize,
        compressedSize: finalData.length,
        compressionRatio: finalData.length / originalSize,
        compressionTime,
        data: finalData
      };

    } catch (error) {
      return {
        algorithm: 'none',
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1.0,
        compressionTime: Date.now() - startTime,
        data: buffer
      };
    }
  }

  async decompressFile(data: Buffer, algorithm: string): Promise<Buffer> {
    if (algorithm === 'none' || algorithm.includes('none')) {
      return data;
    }

    try {
      const baseAlgorithm = algorithm.replace('-chunked', '');
      
      switch (baseAlgorithm) {
        case 'gzip':
          const gunzip = promisify(require('zlib').gunzip);
          return await gunzip(data);
          
        case 'deflate':
          const inflate = promisify(require('zlib').inflate);
          return await inflate(data);
          
        case 'brotli':
          const brotliDecompress = promisify(require('zlib').brotliDecompress);
          return await brotliDecompress(data);
          
        default:
          throw new Error(`Algoritmo de descompresión no soportado: ${algorithm}`);
      }
    } catch (error) {
      throw new Error(`Error descomprimiendo con ${algorithm}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  getCompressionStats(): { totalFiles: number; avgCompressionRatio: number; algorithmUsage: Record<string, number> } {
    // En implementación real, esto vendría de métricas almacenadas
    return {
      totalFiles: 0,
      avgCompressionRatio: 0.65, // 35% de reducción promedio
      algorithmUsage: {
        gzip: 60,
        brotli: 30,
        deflate: 10
      }
    };
  }
}

export const adaptiveCompression = new AdaptiveCompressionEngine();