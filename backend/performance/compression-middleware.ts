import { Request, Response, NextFunction } from 'express';
import { createGzip, createDeflate, constants } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, statSync } from 'fs';

interface CompressionOptions {
  threshold?: number;
  level?: number;
  memLevel?: number;
  windowBits?: number;
  chunkSize?: number;
  strategy?: number;
}

export class CompressionMiddleware {
  private options: CompressionOptions;

  constructor(options: CompressionOptions = {}) {
    this.options = {
      threshold: 1024, // Only compress files > 1KB
      level: constants.Z_DEFAULT_COMPRESSION,
      memLevel: 8,
      windowBits: 15,
      chunkSize: 16 * 1024,
      strategy: constants.Z_DEFAULT_STRATEGY,
      ...options
    };
  }

  // Middleware for automatic response compression
  compress() {
    return (req: Request, res: Response, next: NextFunction) => {
      const acceptEncoding = req.headers['accept-encoding'] || '';
      const method = req.method;

      // Skip compression for certain methods
      if (method !== 'GET' && method !== 'POST') {
        return next();
      }

      // Check if client accepts compression
      const supportsGzip = acceptEncoding.includes('gzip');
      const supportsDeflate = acceptEncoding.includes('deflate');

      if (!supportsGzip && !supportsDeflate) {
        return next();
      }

      // Override res.json to compress JSON responses
      const originalJson = res.json.bind(res);
      res.json = (data: any) => {
        const jsonString = JSON.stringify(data);
        const buffer = Buffer.from(jsonString, 'utf8');

        if (buffer.length < this.options.threshold!) {
          return originalJson(data);
        }

        return this.compressAndSend(res, buffer, 'application/json', supportsGzip);
      };

      // Override res.send for other responses
      const originalSend = res.send.bind(res);
      res.send = (data: any) => {
        if (typeof data !== 'string' && !Buffer.isBuffer(data)) {
          return originalSend(data);
        }

        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        
        if (buffer.length < this.options.threshold!) {
          return originalSend(data);
        }

        const contentType = res.getHeader('content-type') as string || 'text/html';
        return this.compressAndSend(res, buffer, contentType, supportsGzip);
      };

      next();
    };
  }

  private compressAndSend(res: Response, buffer: Buffer, contentType: string, useGzip: boolean): Response {
    const compressionMethod = useGzip ? 'gzip' : 'deflate';
    const compressor = useGzip ? createGzip(this.options) : createDeflate(this.options);

    res.setHeader('Content-Encoding', compressionMethod);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Vary', 'Accept-Encoding');

    // Remove content-length as it will change
    res.removeHeader('Content-Length');

    const chunks: Buffer[] = [];
    
    compressor.on('data', (chunk) => {
      chunks.push(chunk);
    });

    compressor.on('end', () => {
      const compressed = Buffer.concat(chunks);
      const compressionRatio = (1 - compressed.length / buffer.length) * 100;
      
      console.log(`[COMPRESSION] ${compressionMethod.toUpperCase()} compressed ${buffer.length} bytes to ${compressed.length} bytes (${compressionRatio.toFixed(1)}% reduction)`);
      
      res.setHeader('X-Compression-Ratio', compressionRatio.toFixed(1));
      res.setHeader('X-Original-Size', buffer.length.toString());
      res.setHeader('X-Compressed-Size', compressed.length.toString());
      
      res.end(compressed);
    });

    compressor.on('error', (error) => {
      console.error('[COMPRESSION] Compression error:', error);
      res.removeHeader('Content-Encoding');
      res.end(buffer);
    });

    compressor.end(buffer);
    return res;
  }

  // Compress file for transfer
  async compressFile(filePath: string, outputPath: string): Promise<{
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  }> {
    const originalStats = statSync(filePath);
    const originalSize = originalStats.size;

    const readStream = createReadStream(filePath);
    const gzipStream = createGzip({
      level: this.options.level,
      memLevel: this.options.memLevel,
      windowBits: this.options.windowBits,
      chunkSize: this.options.chunkSize,
      strategy: this.options.strategy
    });

    const writeStream = require('fs').createWriteStream(outputPath);

    await pipeline(readStream, gzipStream, writeStream);

    const compressedStats = statSync(outputPath);
    const compressedSize = compressedStats.size;
    const compressionRatio = (1 - compressedSize / originalSize) * 100;

    console.log(`[COMPRESSION] File compressed: ${filePath} -> ${outputPath}`);
    console.log(`[COMPRESSION] Size: ${originalSize} -> ${compressedSize} bytes (${compressionRatio.toFixed(1)}% reduction)`);

    return {
      originalSize,
      compressedSize,
      compressionRatio
    };
  }

  // Compress buffer
  async compressBuffer(buffer: Buffer): Promise<{
    compressed: Buffer;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  }> {
    return new Promise((resolve, reject) => {
      const gzipStream = createGzip(this.options);
      const chunks: Buffer[] = [];

      gzipStream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      gzipStream.on('end', () => {
        const compressed = Buffer.concat(chunks);
        const originalSize = buffer.length;
        const compressedSize = compressed.length;
        const compressionRatio = (1 - compressedSize / originalSize) * 100;

        resolve({
          compressed,
          originalSize,
          compressedSize,
          compressionRatio
        });
      });

      gzipStream.on('error', reject);
      gzipStream.end(buffer);
    });
  }

  // Check if file should be compressed
  shouldCompress(fileSize: number, mimeType?: string): boolean {
    if (fileSize < this.options.threshold!) {
      return false;
    }

    // Don't compress already compressed formats
    const nonCompressibleTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/avi',
      'audio/mp3',
      'audio/aac',
      'application/zip',
      'application/gzip',
      'application/x-rar-compressed'
    ];

    if (mimeType && nonCompressibleTypes.some(type => mimeType.includes(type))) {
      return false;
    }

    return true;
  }

  // Get compression statistics
  getCompressionStats(): {
    totalRequests: number;
    compressedRequests: number;
    totalBytesSaved: number;
    averageCompressionRatio: number;
  } {
    // This would be implemented with proper metrics collection
    return {
      totalRequests: 0,
      compressedRequests: 0,
      totalBytesSaved: 0,
      averageCompressionRatio: 0
    };
  }
}

export const compressionMiddleware = new CompressionMiddleware({
  threshold: 1024, // 1KB
  level: 6, // Balanced compression level
  chunkSize: 16 * 1024 // 16KB chunks
});