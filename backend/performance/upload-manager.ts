import { Request, Response } from 'express';
import { createWriteStream, createReadStream, existsSync, statSync, unlinkSync } from 'fs';
import { join, extname } from 'path';
import { pipeline } from 'stream/promises';
import { createHash } from 'crypto';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import { virusScanner } from '../security/virus-scanner';
import { encryption } from '../security/encryption';
import { auditLogger } from '../security/audit-logger';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

interface ChunkInfo {
  chunkNumber: number;
  totalChunks: number;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  uploadId: string;
  hash: string;
}

interface UploadSession {
  uploadId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  chunksReceived: Set<number>;
  chunks: Map<number, Buffer>;
  startTime: number;
  lastActivity: number;
  metadata: any;
  compressed: boolean;
  encrypted: boolean;
}

interface CacheEntry {
  hash: string;
  filePath: string;
  metadata: any;
  timestamp: number;
  accessCount: number;
  lastAccess: number;
}

export class UploadManager {
  private uploadSessions: Map<string, UploadSession> = new Map();
  private uploadCache: Map<string, CacheEntry> = new Map();
  private readonly CHUNK_SIZE = 1024 * 1024; // 1MB chunks
  private readonly MAX_PARALLEL_UPLOADS = 5;
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private readonly TEMP_DIR = 'temp/uploads';
  private readonly CACHE_DIR = 'temp/cache';
  
  constructor() {
    this.ensureDirectories();
    this.startCleanupScheduler();
  }

  private ensureDirectories(): void {
    const dirs = [this.TEMP_DIR, this.CACHE_DIR, 'uploads'];
    dirs.forEach(dir => {
      if (!existsSync(dir)) {
        require('fs').mkdirSync(dir, { recursive: true });
      }
    });
  }

  private startCleanupScheduler(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
      this.cleanupCache();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [uploadId, session] of this.uploadSessions.entries()) {
      if (now - session.lastActivity > this.SESSION_TIMEOUT) {
        console.log(`[UPLOAD-MANAGER] Cleaning up expired session: ${uploadId}`);
        this.cleanupSession(uploadId);
      }
    }
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [hash, entry] of this.uploadCache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        console.log(`[UPLOAD-MANAGER] Removing expired cache entry: ${hash}`);
        this.uploadCache.delete(hash);
        // Clean up physical file if it exists
        if (existsSync(entry.filePath)) {
          try {
            unlinkSync(entry.filePath);
          } catch (error) {
            console.error(`[UPLOAD-MANAGER] Failed to delete cached file: ${entry.filePath}`, error);
          }
        }
      }
    }
  }

  private cleanupSession(uploadId: string): void {
    const session = this.uploadSessions.get(uploadId);
    if (session) {
      // Clean up temporary chunk files
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = join(this.TEMP_DIR, `${uploadId}_chunk_${i}`);
        if (existsSync(chunkPath)) {
          try {
            unlinkSync(chunkPath);
          } catch (error) {
            console.error(`[UPLOAD-MANAGER] Failed to delete chunk: ${chunkPath}`, error);
          }
        }
      }
      this.uploadSessions.delete(uploadId);
    }
  }

  async initializeUpload(req: Request, res: Response): Promise<void> {
    try {
      const { fileName, fileSize, totalChunks, metadata } = req.body;
      
      if (!fileName || !fileSize || !totalChunks) {
        res.status(400).json({ error: 'Missing required parameters' });
        return;
      }

      // Check if we're at max parallel uploads
      if (this.uploadSessions.size >= this.MAX_PARALLEL_UPLOADS) {
        res.status(429).json({ error: 'Maximum parallel uploads reached. Please try again later.' });
        return;
      }

      // Generate upload ID
      const uploadId = this.generateUploadId();
      
      // Calculate file hash for caching
      const fileHash = createHash('sha256')
        .update(`${fileName}-${fileSize}-${Date.now()}`)
        .digest('hex');

      // Check cache first
      const cachedEntry = this.uploadCache.get(fileHash);
      if (cachedEntry && existsSync(cachedEntry.filePath)) {
        console.log(`[UPLOAD-MANAGER] Cache hit for file: ${fileName}`);
        cachedEntry.accessCount++;
        cachedEntry.lastAccess = Date.now();
        
        res.json({
          uploadId,
          cached: true,
          filePath: cachedEntry.filePath,
          metadata: cachedEntry.metadata
        });
        return;
      }

      // Create upload session
      const session: UploadSession = {
        uploadId,
        fileName,
        fileSize,
        totalChunks,
        chunksReceived: new Set(),
        chunks: new Map(),
        startTime: Date.now(),
        lastActivity: Date.now(),
        metadata: metadata || {},
        compressed: fileSize > 1024 * 1024, // Compress files > 1MB
        encrypted: metadata?.encrypt === true
      };

      this.uploadSessions.set(uploadId, session);

      await auditLogger.logEvent({
        action: 'upload_initialized',
        userId: req.body.userId || 'anonymous',
        resourceId: uploadId,
        details: {
          fileName,
          fileSize,
          totalChunks,
          compressed: session.compressed,
          encrypted: session.encrypted
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        uploadId,
        chunkSize: this.CHUNK_SIZE,
        compressed: session.compressed,
        encrypted: session.encrypted,
        message: 'Upload session initialized'
      });

    } catch (error) {
      console.error('[UPLOAD-MANAGER] Error initializing upload:', error);
      res.status(500).json({ error: 'Failed to initialize upload' });
    }
  }

  async uploadChunk(req: Request, res: Response): Promise<void> {
    try {
      const { uploadId, chunkNumber, totalChunks, hash } = req.body;
      const chunkData = req.file?.buffer;

      if (!uploadId || chunkNumber === undefined || !chunkData) {
        res.status(400).json({ error: 'Missing required chunk data' });
        return;
      }

      const session = this.uploadSessions.get(uploadId);
      if (!session) {
        res.status(404).json({ error: 'Upload session not found' });
        return;
      }

      // Update last activity
      session.lastActivity = Date.now();

      // Verify chunk hash
      const chunkHash = createHash('sha256').update(chunkData).digest('hex');
      if (hash && chunkHash !== hash) {
        res.status(400).json({ error: 'Chunk integrity check failed' });
        return;
      }

      // Process chunk (decompress if needed)
      let processedChunk = chunkData;
      if (session.compressed) {
        try {
          processedChunk = await gunzipAsync(chunkData);
        } catch (error) {
          console.error('[UPLOAD-MANAGER] Decompression failed:', error);
          res.status(400).json({ error: 'Chunk decompression failed' });
          return;
        }
      }

      // Decrypt if needed
      if (session.encrypted && session.metadata.encryptionKey) {
        try {
          processedChunk = await encryption.decryptBuffer(processedChunk, session.metadata.encryptionKey);
        } catch (error) {
          console.error('[UPLOAD-MANAGER] Decryption failed:', error);
          res.status(400).json({ error: 'Chunk decryption failed' });
          return;
        }
      }

      // Store chunk
      session.chunks.set(chunkNumber, processedChunk);
      session.chunksReceived.add(chunkNumber);

      console.log(`[UPLOAD-MANAGER] Chunk ${chunkNumber}/${totalChunks} received for ${uploadId}`);

      // Check if all chunks are received
      if (session.chunksReceived.size === session.totalChunks) {
        await this.assembleFile(session);
        res.json({
          message: 'Upload completed',
          uploadId,
          chunkNumber,
          totalReceived: session.chunksReceived.size,
          completed: true
        });
      } else {
        res.json({
          message: 'Chunk received',
          uploadId,
          chunkNumber,
          totalReceived: session.chunksReceived.size,
          completed: false
        });
      }

    } catch (error) {
      console.error('[UPLOAD-MANAGER] Error uploading chunk:', error);
      res.status(500).json({ error: 'Failed to upload chunk' });
    }
  }

  private async assembleFile(session: UploadSession): Promise<string> {
    const finalPath = join('uploads', `${session.uploadId}_${session.fileName}`);
    
    try {
      // Create write stream for final file
      const writeStream = createWriteStream(finalPath);
      
      // Write chunks in order
      for (let i = 0; i < session.totalChunks; i++) {
        const chunk = session.chunks.get(i);
        if (chunk) {
          writeStream.write(chunk);
        }
      }
      
      writeStream.end();
      
      // Wait for write to complete
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Perform security scan
      const scanResult = await virusScanner.scanFile(finalPath, session.fileName);
      if (!scanResult.isClean) {
        // Move to quarantine
        const quarantinePath = join('quarantine', `${session.uploadId}_${session.fileName}`);
        require('fs').renameSync(finalPath, quarantinePath);
        throw new Error(`File contains threats: ${scanResult.threats.join(', ')}`);
      }

      // Add to cache
      const fileHash = createHash('sha256')
        .update(require('fs').readFileSync(finalPath))
        .digest('hex');
      
      this.uploadCache.set(fileHash, {
        hash: fileHash,
        filePath: finalPath,
        metadata: session.metadata,
        timestamp: Date.now(),
        accessCount: 1,
        lastAccess: Date.now()
      });

      // Log completion
      await auditLogger.logEvent({
        action: 'upload_completed',
        userId: session.metadata.userId || 'anonymous',
        resourceId: session.uploadId,
        details: {
          fileName: session.fileName,
          fileSize: session.fileSize,
          totalChunks: session.totalChunks,
          duration: Date.now() - session.startTime,
          finalPath,
          scanResult
        }
      });

      console.log(`[UPLOAD-MANAGER] File assembled successfully: ${finalPath}`);
      
      // Cleanup session
      this.cleanupSession(session.uploadId);
      
      return finalPath;

    } catch (error) {
      console.error('[UPLOAD-MANAGER] Error assembling file:', error);
      // Cleanup on error
      this.cleanupSession(session.uploadId);
      throw error;
    }
  }

  async getUploadStatus(req: Request, res: Response): Promise<void> {
    try {
      const { uploadId } = req.params;
      const session = this.uploadSessions.get(uploadId);
      
      if (!session) {
        res.status(404).json({ error: 'Upload session not found' });
        return;
      }

      const progress = (session.chunksReceived.size / session.totalChunks) * 100;
      const elapsed = Date.now() - session.startTime;
      const avgChunkTime = elapsed / session.chunksReceived.size;
      const estimatedRemaining = avgChunkTime * (session.totalChunks - session.chunksReceived.size);

      res.json({
        uploadId,
        fileName: session.fileName,
        progress: Math.round(progress * 100) / 100,
        chunksReceived: session.chunksReceived.size,
        totalChunks: session.totalChunks,
        elapsed,
        estimatedRemaining,
        compressed: session.compressed,
        encrypted: session.encrypted
      });

    } catch (error) {
      console.error('[UPLOAD-MANAGER] Error getting upload status:', error);
      res.status(500).json({ error: 'Failed to get upload status' });
    }
  }

  async cancelUpload(req: Request, res: Response): Promise<void> {
    try {
      const { uploadId } = req.params;
      const session = this.uploadSessions.get(uploadId);
      
      if (!session) {
        res.status(404).json({ error: 'Upload session not found' });
        return;
      }

      await auditLogger.logEvent({
        action: 'upload_cancelled',
        userId: session.metadata.userId || 'anonymous',
        resourceId: uploadId,
        details: {
          fileName: session.fileName,
          chunksReceived: session.chunksReceived.size,
          totalChunks: session.totalChunks,
          duration: Date.now() - session.startTime
        }
      });

      this.cleanupSession(uploadId);
      
      res.json({ message: 'Upload cancelled successfully' });

    } catch (error) {
      console.error('[UPLOAD-MANAGER] Error cancelling upload:', error);
      res.status(500).json({ error: 'Failed to cancel upload' });
    }
  }

  // Performance optimization methods
  async compressFile(filePath: string): Promise<string> {
    const compressedPath = `${filePath}.gz`;
    const readStream = createReadStream(filePath);
    const writeStream = createWriteStream(compressedPath);
    const gzipStream = require('zlib').createGzip({ level: 6 });

    await pipeline(readStream, gzipStream, writeStream);
    return compressedPath;
  }

  async optimizeForTransfer(filePath: string, options: {
    compress?: boolean;
    encrypt?: boolean;
    encryptionKey?: string;
  } = {}): Promise<string> {
    let processedPath = filePath;

    // Compress if requested and file is large enough
    if (options.compress && statSync(filePath).size > 1024 * 1024) {
      processedPath = await this.compressFile(processedPath);
      console.log(`[UPLOAD-MANAGER] File compressed: ${processedPath}`);
    }

    // Encrypt if requested
    if (options.encrypt && options.encryptionKey) {
      const encryptedPath = `${processedPath}.enc`;
      await encryption.encryptFile(processedPath, encryptedPath, options.encryptionKey);
      processedPath = encryptedPath;
      console.log(`[UPLOAD-MANAGER] File encrypted: ${processedPath}`);
    }

    return processedPath;
  }

  getCacheStats(): any {
    return {
      totalEntries: this.uploadCache.size,
      totalSize: Array.from(this.uploadCache.values()).reduce((sum, entry) => {
        try {
          return sum + statSync(entry.filePath).size;
        } catch {
          return sum;
        }
      }, 0),
      hitRate: this.calculateCacheHitRate(),
      oldestEntry: this.getOldestCacheEntry(),
      mostAccessed: this.getMostAccessedCacheEntry()
    };
  }

  private calculateCacheHitRate(): number {
    const totalAccesses = Array.from(this.uploadCache.values())
      .reduce((sum, entry) => sum + entry.accessCount, 0);
    return totalAccesses > 0 ? (this.uploadCache.size / totalAccesses) * 100 : 0;
  }

  private getOldestCacheEntry(): any {
    let oldest = null;
    let oldestTime = Date.now();
    
    for (const entry of this.uploadCache.values()) {
      if (entry.timestamp < oldestTime) {
        oldest = entry;
        oldestTime = entry.timestamp;
      }
    }
    
    return oldest ? {
      hash: oldest.hash,
      age: Date.now() - oldest.timestamp,
      accessCount: oldest.accessCount
    } : null;
  }

  private getMostAccessedCacheEntry(): any {
    let mostAccessed = null;
    let maxAccesses = 0;
    
    for (const entry of this.uploadCache.values()) {
      if (entry.accessCount > maxAccresses) {
        mostAccessed = entry;
        maxAccesses = entry.accessCount;
      }
    }
    
    return mostAccessed ? {
      hash: mostAccessed.hash,
      accessCount: mostAccessed.accessCount,
      lastAccess: mostAccessed.lastAccess
    } : null;
  }

  private generateUploadId(): string {
    return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods for monitoring
  getActiveUploads(): any[] {
    return Array.from(this.uploadSessions.values()).map(session => ({
      uploadId: session.uploadId,
      fileName: session.fileName,
      progress: (session.chunksReceived.size / session.totalChunks) * 100,
      elapsed: Date.now() - session.startTime,
      compressed: session.compressed,
      encrypted: session.encrypted
    }));
  }

  getPerformanceMetrics(): any {
    const sessions = Array.from(this.uploadSessions.values());
    const completedUploads = sessions.length;
    
    return {
      activeUploads: sessions.length,
      cacheStats: this.getCacheStats(),
      averageUploadTime: completedUploads > 0 ? 
        sessions.reduce((sum, s) => sum + (Date.now() - s.startTime), 0) / completedUploads : 0,
      totalBandwidthSaved: this.calculateBandwidthSaved(),
      compressionRatio: this.calculateCompressionRatio()
    };
  }

  private calculateBandwidthSaved(): number {
    // Calculate bandwidth saved through caching and compression
    let saved = 0;
    for (const entry of this.uploadCache.values()) {
      if (entry.accessCount > 1) {
        try {
          const fileSize = statSync(entry.filePath).size;
          saved += fileSize * (entry.accessCount - 1);
        } catch (error) {
          // File might not exist anymore
        }
      }
    }
    return saved;
  }

  private calculateCompressionRatio(): number {
    // This would need to track original vs compressed sizes
    // For now, return estimated compression ratio
    return 0.3; // 30% compression on average
  }
}

export const uploadManager = new UploadManager();