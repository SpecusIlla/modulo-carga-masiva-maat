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
import { versionControl } from '../version-control';

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
  private readonly MAX_PARALLEL_UPLOADS = 20; // Aumentado de 5 a 20
  private readonly CACHE_TTL = 48 * 60 * 60 * 1000; // 48 hours (aumentado)
  private readonly SESSION_TIMEOUT = 60 * 60 * 1000; // 60 minutes (aumentado)
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
        compressed: this.shouldCompressFile(fileName, fileSize),
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

      // Gestión inteligente de memoria - usar disco para archivos grandes
      if (session.fileSize > 50 * 1024 * 1024) { // >50MB
        // Guardar chunk en disco temporal
        const chunkPath = join(this.TEMP_DIR, `${session.uploadId}_chunk_${chunkNumber}`);
        await fs.writeFile(chunkPath, processedChunk);
        console.log(`[UPLOAD-MANAGER] Large file chunk saved to disk: ${chunkPath}`);
      } else {
        // Archivos pequeños en memoria (más rápido)
        session.chunks.set(chunkNumber, processedChunk);
      }

      session.chunksReceived.add(chunkNumber);

      console.log(`[UPLOAD-MANAGER] Chunk ${chunkNumber}/${totalChunks} received for ${uploadId}`);

      // Check if all chunks are received
      if (session.chunksReceived.size === session.totalChunks) {
        await this.assembleFile(session, req);
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

  private async assembleFile(session: UploadSession, req: Request): Promise<string> {
    const finalPath = join('uploads', `${session.uploadId}_${session.fileName}`);

    try {
      // Para archivos grandes, usar streaming directo desde chunks temporales
      if (session.fileSize > 50 * 1024 * 1024) { // >50MB
        return await this.assembleFileStream(session, finalPath, req);
      }

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

      // Clear chunks from memory immediately after assembly
      session.chunks.clear();

      // Create version before security scan
      const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await versionControl.createVersion(
        finalPath,
        fileId,
        req.user?.id || 'anonymous',
        `Upload: ${session.fileName}`,
        ['upload', 'auto-generated']
      );

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

  private async assembleFileStream(session: UploadSession, finalPath: string, req: Request): Promise<string> {
    const writeStream = createWriteStream(finalPath);
    const hashCalculator = createHash('sha256');

    try {
      // Stream chunks en orden sin cargarlos todos en memoria
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = join(this.TEMP_DIR, `${session.uploadId}_chunk_${i}`);

        if (existsSync(chunkPath)) {
          // Stream chunk desde disco directamente
          const chunkStream = createReadStream(chunkPath);

          // Pipeline para hash y escritura simultánea
          await pipeline(
            chunkStream,
            new Transform({
              transform(chunk, encoding, callback) {
                hashCalculator.update(chunk);
                this.push(chunk);
                callback();
              }
            }),
            writeStream,
            { end: false } // No cerrar writeStream entre chunks
          );

          // Limpiar chunk temporal inmediatamente
          await fs.unlink(chunkPath).catch(console.error);
        }
      }

      writeStream.end();

      // Esperar finalización
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      console.log(`[UPLOAD-MANAGER] Large file assembled via streaming: ${finalPath}`);
      return finalPath;

    } catch (error) {
      console.error('[UPLOAD-MANAGER] Streaming assembly failed:', error);
      writeStream.destroy();
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
      if (entry.accessCount > maxAccesses) {
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

  private shouldCompressFile(fileName: string, fileSize: number): boolean {
    const ext = path.extname(fileName).toLowerCase();

    // No comprimir archivos ya comprimidos o binarios
    const skipCompression = ['.zip', '.rar', '.7z', '.gz', '.jpg', '.jpeg', '.png', '.mp4', '.avi'];
    if (skipCompression.includes(ext)) {
      return false;
    }

    // Comprimir archivos de texto grandes
    const textFiles = ['.txt', '.json', '.csv', '.xml', '.html', '.css', '.js', '.ts'];
    if (textFiles.includes(ext) && fileSize > 1024 * 1024) { // >1MB
      return true;
    }

    // Comprimir documentos grandes
    const documentFiles = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
    if (documentFiles.includes(ext) && fileSize > 5 * 1024 * 1024) { // >5MB
      return true;
    }

    return false;
  }

  getPerformanceMetrics(): any {
    const sessions = Array.from(this.uploadSessions.values());
    const completedUploads = sessions.length;

    // Calcular métricas por tamaño de archivo
    const largeFiles = sessions.filter(s => s.fileSize > 50 * 1024 * 1024);
    const smallFiles = sessions.filter(s => s.fileSize <= 50 * 1024 * 1024);

    // Métricas avanzadas de rendimiento
    const now = Date.now();
    const recentSessions = sessions.filter(s => now - s.startTime < 300000); // 5 minutos

    const averageSpeed = recentSessions.length > 0
      ? recentSessions.reduce((sum, s) => {
          const duration = Math.max(1, now - s.startTime);
          return sum + (s.fileSize / 1024 / 1024) / (duration / 1000);
        }, 0) / recentSessions.length
      : 0;

    const memoryUsage = this.calculateMemoryUsage();
    const cacheEfficiency = this.calculateCacheEfficiency();

    return {
      // Métricas básicas
      activeUploads: sessions.length,
      completedUploads,
      averageUploadTime: completedUploads > 0 ?
        sessions.reduce((sum, s) => sum + (Date.now() - s.startTime), 0) / completedUploads : 0,

      // Métricas de rendimiento
      averageSpeed, // MB/s
      peakSpeed: Math.max(...recentSessions.map(s => {
        const duration = Math.max(1, now - s.startTime);
        return (s.fileSize / 1024 / 1024) / (duration / 1000);
      }), 0),

      // Métricas de memoria
      memoryUsage: {
        current: memoryUsage.current,
        peak: memoryUsage.peak,
        efficiency: memoryUsage.efficiency
      },

      // Métricas de caché
      cacheStats: this.getCacheStats(),
      cacheEfficiency,
      totalBandwidthSaved: this.calculateBandwidthSaved(),
      compressionRatio: this.calculateCompressionRatio(),

      // Métricas de calidad
      errorRate: this.calculateErrorRate(),
      successRate: this.calculateSuccessRate(),
      retryRate: this.calculateRetryRate(),

  private calculateTempDirUsage(): number {
    try {
      const files = require('fs').readdirSync(this.TEMP_DIR);
      let totalSize = 0;

      for (const file of files) {
        try {
          const stats = require('fs').statSync(join(this.TEMP_DIR, file));
          totalSize += stats.size;
        } catch (error) {
          // Archivo podría haberse eliminado
        }
      }

      return totalSize;
    } catch (error) {
      return 0;
    }
  }

      largeFileMetrics: {
        count: largeFiles.length,
        averageSize: largeFiles.length > 0 ?
          largeFiles.reduce((sum, s) => sum + s.fileSize, 0) / largeFiles.length : 0,
        streamingActive: largeFiles.filter(s => s.chunksReceived.size < s.totalChunks).length
      },
      memoryOptimization: {
        diskBasedChunks: largeFiles.length,
        memoryBasedChunks: smallFiles.length,
        tempDirUsage: this.calculateTempDirUsage()
      }
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

  private calculateMemoryUsage(): {
    current: number;
    peak: number;
    efficiency: number;
  } {
    const activeSessions = Array.from(this.uploadSessions.values());
    const currentUsage = activeSessions.reduce((sum, session) => {
      return sum + (session.chunks?.length || 0) * this.CHUNK_SIZE;
    }, 0);

    return {
      current: currentUsage / 1024 / 1024, // MB
      peak: this.peakMemoryUsage / 1024 / 1024, // MB
      efficiency: currentUsage > 0 ? (activeSessions.length / currentUsage) * 1000000 : 1
    };
  }

  private peakMemoryUsage = 0;

  private calculateCacheEfficiency(): number {
    const cacheStats = this.getCacheStats();
    const totalRequests = cacheStats.hits + cacheStats.misses;
    return totalRequests > 0 ? (cacheStats.hits / totalRequests) * 100 : 0;
  }

  private calculateErrorRate(): number {
    const sessions = Array.from(this.uploadSessions.values());
    const errors = sessions.filter(s => s.status === 'error').length;
    return sessions.length > 0 ? (errors / sessions.length) * 100 : 0;
  }

  private calculateSuccessRate(): number {
    const sessions = Array.from(this.uploadSessions.values());
    const successful = sessions.filter(s => s.status === 'completed').length;
    return sessions.length > 0 ? (successful / sessions.length) * 100 : 0;
  }

  private calculateRetryRate(): number {
    const sessions = Array.from(this.uploadSessions.values());
    const retries = sessions.reduce((sum, s) => sum + (s.retryCount || 0), 0);
    return sessions.length > 0 ? (retries / sessions.length) * 100 : 0;
  }

  optimizePerformance(): {
    optimizations: string[];
    metrics: any;
  } {
    const optimizations: string[] = [];
    const metrics = this.getPerformanceMetrics();

    // Optimizar caché si hit rate es bajo
    if (metrics.cacheEfficiency < 70) {
      this.optimizeCache();
      optimizations.push('Cache optimization applied');
    }

    // Ajustar chunk size basado en velocidad promedio
    if (metrics.averageSpeed < 1) { // < 1 MB/s
      this.CHUNK_SIZE = Math.max(512 * 1024, this.CHUNK_SIZE * 0.8); // Reducir chunk size
      optimizations.push(`Reduced chunk size to ${this.CHUNK_SIZE / 1024}KB`);
    } else if (metrics.averageSpeed > 10) { // > 10 MB/s
      this.CHUNK_SIZE = Math.min(2 * 1024 * 1024, this.CHUNK_SIZE * 1.2); // Aumentar chunk size
      optimizations.push(`Increased chunk size to ${this.CHUNK_SIZE / 1024}KB`);
    }

    // Limpiar sesiones obsoletas si hay muchas activas
    if (metrics.activeUploads > 50) {
      this.cleanupOldSessions();
      optimizations.push('Cleaned up old sessions');
    }

    return { optimizations, metrics };
  }

  private optimizeCache(): void {
    // Limpiar entradas de caché poco utilizadas
    const cutoff = Date.now() - 10 * 60 * 1000; // 10 minutos
    for (const [hash, entry] of this.uploadCache.entries()) {
      if (entry.lastAccess < cutoff && entry.accessCount < 2) {
        this.uploadCache.delete(hash);
      }
    }
  }

  private cleanupOldSessions(): void {
    const cutoff = Date.now() - 30 * 60 * 1000; // 30 minutos
    for (const [sessionId, session] of this.uploadSessions.entries()) {
      if (session.startTime < cutoff && session.status !== 'uploading') {
        this.uploadSessions.delete(sessionId);
      }
    }
  }
}

export const uploadManager = new UploadManager();