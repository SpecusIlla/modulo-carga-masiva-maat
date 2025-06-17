// Procesador de streaming para archivos grandes
// Módulo de Carga v1.0.0 - Optimización de memoria y velocidad

import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { createHash } from 'crypto';
import { createGzip } from 'zlib';

interface StreamConfig {
  chunkSize: number;
  enableCompression: boolean;
  enableEncryption: boolean;
  maxMemoryUsage: number;
}

interface StreamResult {
  outputPath: string;
  originalSize: number;
  processedSize: number;
  hash: string;
  compressionRatio?: number;
  processingTime: number;
}

export class FileStreamProcessor {
  private config: StreamConfig;
  private activeStreams = new Set<string>();

  constructor(config: Partial<StreamConfig> = {}) {
    this.config = {
      chunkSize: 64 * 1024, // 64KB chunks
      enableCompression: true,
      enableEncryption: true,
      maxMemoryUsage: 50 * 1024 * 1024, // 50MB max memory
      ...config
    };
  }

  async processLargeFile(
    inputPath: string,
    outputDir: string,
    filename: string
  ): Promise<StreamResult> {
    const startTime = Date.now();
    const streamId = `stream_${Date.now()}_${Math.random().toString(36)}`;
    
    this.activeStreams.add(streamId);

    try {
      const stats = await fs.stat(inputPath);
      const originalSize = stats.size;
      
      // Determinar si usar streaming basado en tamaño
      if (originalSize < this.config.chunkSize * 10) {
        return await this.processSmallFile(inputPath, outputDir, filename, originalSize);
      }

      const outputPath = path.join(outputDir, filename);
      const hashCalculator = createHash('sha256');
      let processedSize = 0;

      // Crear pipeline de transformación
      const transforms: Transform[] = [];

      // Transform para cálculo de hash
      const hashTransform = new Transform({
        transform(chunk, encoding, callback) {
          hashCalculator.update(chunk);
          processedSize += chunk.length;
          this.push(chunk);
          callback();
        }
      });
      transforms.push(hashTransform);

      // Transform para compresión (opcional)
      if (this.config.enableCompression && this.shouldCompress(filename)) {
        transforms.push(createGzip({ level: 6 }));
      }

      // Crear streams de entrada y salida
      const readStream = createReadStream(inputPath, {
        highWaterMark: this.config.chunkSize
      });

      const writeStream = createWriteStream(outputPath);

      // Ejecutar pipeline
      await pipeline([
        readStream,
        ...transforms,
        writeStream
      ]);

      const hash = hashCalculator.digest('hex');
      const finalStats = await fs.stat(outputPath);
      const processingTime = Date.now() - startTime;

      return {
        outputPath,
        originalSize,
        processedSize: finalStats.size,
        hash,
        compressionRatio: finalStats.size / originalSize,
        processingTime
      };

    } catch (error) {
      throw new Error(`Error procesando archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      this.activeStreams.delete(streamId);
    }
  }

  private async processSmallFile(
    inputPath: string,
    outputDir: string,
    filename: string,
    originalSize: number
  ): Promise<StreamResult> {
    const startTime = Date.now();
    const buffer = await fs.readFile(inputPath);
    const hash = createHash('sha256').update(buffer).digest('hex');
    
    let processedBuffer = buffer;
    
    // Aplicar compresión si es necesario
    if (this.config.enableCompression && this.shouldCompress(filename)) {
      const { promisify } = require('util');
      const gzip = promisify(require('zlib').gzip);
      processedBuffer = await gzip(buffer);
    }

    const outputPath = path.join(outputDir, filename);
    await fs.writeFile(outputPath, processedBuffer);

    return {
      outputPath,
      originalSize,
      processedSize: processedBuffer.length,
      hash,
      compressionRatio: processedBuffer.length / originalSize,
      processingTime: Date.now() - startTime
    };
  }

  private shouldCompress(filename: string): boolean {
    const compressibleExtensions = ['.txt', '.json', '.csv', '.xml', '.html', '.css', '.js'];
    const ext = path.extname(filename).toLowerCase();
    return compressibleExtensions.includes(ext);
  }

  getActiveStreamsCount(): number {
    return this.activeStreams.size;
  }

  async cleanup(): Promise<void> {
    // Esperar a que terminen los streams activos
    while (this.activeStreams.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

export const streamProcessor = new FileStreamProcessor();