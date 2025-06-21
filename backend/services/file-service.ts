import { db } from '../database/connection';
import { files, users } from '../database/schema';
import { eq, desc, and } from 'drizzle-orm';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { uploadManager } from '../performance/upload-manager';
import { virusScanner } from '../security/virus-scanner';
import { versionControl } from '../versioning/version-control-manager';
import { auditLogger } from '../security/audit-logger';

export interface FileMetadata {
  id: string;
  fileName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  fileHash: string;
  userId: string;
  status: string;
  tags?: string[];
  createdAt: Date;
}

export class FileService {
  private uploadManager = new UploadManager();
  private virusScanner = new VirusScanner();

  async saveFile(fileData: {
    fileName: string;
    originalName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    userId: string;
    uploadSessionId?: string;
    tags?: string[];
  }): Promise<FileMetadata> {
    try {
      // SEGURIDAD: Escanear archivo antes de guardarlo
      const scanResult = await this.virusScanner.scanFile(fileData.filePath, fileData.originalName);
      if (!scanResult.isClean) {
        await auditLogger.logEvent({
          action: 'file_quarantined',
          userId: fileData.userId,
          resourceId: fileData.fileName,
          details: { threats: scanResult.threats, fileName: fileData.originalName }
        });
        throw new Error(`Security threat detected: ${scanResult.threats.join(', ')}`);
      }

      // Calcular hash del archivo
      const fileBuffer = await fs.readFile(fileData.filePath);
      const fileHash = createHash('sha256').update(fileBuffer).digest('hex');

      // Verificar si el archivo ya existe
      const [existingFile] = await db.select()
        .from(files)
        .where(eq(files.fileHash, fileHash))
        .limit(1);

      if (existingFile) {
        throw new Error('File already exists (duplicate hash)');
      }

      // Guardar archivo en base de datos
      const [savedFile] = await db.insert(files).values({
        fileName: fileData.fileName,
        originalName: fileData.originalName,
        filePath: fileData.filePath,
        fileSize: fileData.fileSize,
        mimeType: fileData.mimeType,
        fileHash,
        userId: fileData.userId,
        uploadSessionId: fileData.uploadSessionId,
        tags: fileData.tags || [],
        status: 'uploaded'
      }).returning();

      // VERSIONADO: Crear versión automática
      try {
        await versionControl.createVersion(
          fileData.filePath,
          savedFile.id,
          fileData.userId,
          `Auto-save: ${fileData.originalName}`,
          ['auto-generated', 'upload', ...(fileData.tags || [])]
        );
      } catch (versionError) {
        console.warn('[FILE-SERVICE] Version creation failed:', versionError);
      }

      // AUDITORIA: Registrar evento de guardado
      await auditLogger.logEvent({
        action: 'file_saved',
        userId: fileData.userId,
        resourceId: savedFile.id,
        details: {
          fileName: fileData.originalName,
          fileSize: fileData.fileSize,
          mimeType: fileData.mimeType,
          scanResult: scanResult.isClean ? 'clean' : 'threat_detected'
        }
      });

      return {
        id: savedFile.id,
        fileName: savedFile.fileName,
        originalName: savedFile.originalName,
        fileSize: savedFile.fileSize,
        mimeType: savedFile.mimeType,
        fileHash: savedFile.fileHash,
        userId: savedFile.userId,
        status: savedFile.status,
        tags: savedFile.tags,
        createdAt: savedFile.createdAt
      };
    } catch (error) {
      console.error('Error saving file:', error);
      throw new Error('Failed to save file metadata');
    }
  }

  async getFilesByUser(userId: string, limit: number = 50): Promise<FileMetadata[]> {
    try {
      const userFiles = await db.select()
        .from(files)
        .where(eq(files.userId, userId))
        .orderBy(desc(files.createdAt))
        .limit(limit);

      return userFiles.map(file => ({
        id: file.id,
        fileName: file.fileName,
        originalName: file.originalName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        fileHash: file.fileHash,
        userId: file.userId,
        status: file.status,
        tags: file.tags,
        createdAt: file.createdAt
      }));
    } catch (error) {
      console.error('Error getting user files:', error);
      throw new Error('Failed to retrieve user files');
    }
  }

  async getFileById(fileId: string): Promise<FileMetadata | null> {
    try {
      const [file] = await db.select()
        .from(files)
        .where(eq(files.id, fileId))
        .limit(1);

      if (!file) return null;

      return {
        id: file.id,
        fileName: file.fileName,
        originalName: file.originalName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        fileHash: file.fileHash,
        userId: file.userId,
        status: file.status,
        tags: file.tags,
        createdAt: file.createdAt
      };
    } catch (error) {
      console.error('Error getting file by ID:', error);
      return null;
    }
  }

  async updateFileStatus(fileId: string, status: string): Promise<boolean> {
    try {
      const result = await db.update(files)
        .set({ 
          status,
          updatedAt: new Date()
        })
        .where(eq(files.id, fileId));

      return true;
    } catch (error) {
      console.error('Error updating file status:', error);
      return false;
    }
  }

  async deleteFile(fileId: string): Promise<boolean> {
    try {
      // Obtener información del archivo antes de eliminarlo
      const file = await this.getFileById(fileId);
      if (!file) return false;

      // Eliminar archivo físico
      try {
        const [dbFile] = await db.select()
          .from(files)
          .where(eq(files.id, fileId))
          .limit(1);

        if (dbFile?.filePath) {
          await fs.unlink(dbFile.filePath);
        }
      } catch (fsError) {
        console.warn('Could not delete physical file:', fsError);
      }

      // Eliminar registro de base de datos
      await db.delete(files).where(eq(files.id, fileId));

      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  async getStorageStats(userId: string): Promise<{
    totalFiles: number;
    totalSize: number;
    averageSize: number;
  }> {
    try {
      const userFiles = await db.select({
        fileSize: files.fileSize
      })
      .from(files)
      .where(eq(files.userId, userId));

      const totalFiles = userFiles.length;
      const totalSize = userFiles.reduce((sum, file) => sum + file.fileSize, 0);
      const averageSize = totalFiles > 0 ? totalSize / totalFiles : 0;

      return {
        totalFiles,
        totalSize,
        averageSize
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return { totalFiles: 0, totalSize: 0, averageSize: 0 };
    }
  }
}

export const fileService = new FileService();