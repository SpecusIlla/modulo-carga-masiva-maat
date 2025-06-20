
// Sistema de Control de Versiones para archivos - MAAT v1.2.0
// Permite tracking de cambios, rollback y versionado automático

import { createHash } from 'crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, copyFileSync, statSync } from 'fs';
import { promises as fs } from 'fs';
import { join, dirname, extname, basename } from 'path';

export interface FileVersion {
  readonly versionId: string;
  readonly fileId: string;
  readonly fileName: string;
  readonly versionNumber: number;
  readonly hash: string;
  readonly size: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly comment: string;
  readonly parentVersion?: string;
  readonly tags: readonly string[];
  readonly metadata: Record<string, unknown>;
}

export interface VersionDiff {
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly changes: {
    readonly added: number;
    readonly modified: number;
    readonly deleted: number;
    readonly sizeChange: number;
  };
  readonly similarity: number; // 0-1
}

export interface VersionBranch {
  readonly branchId: string;
  readonly name: string;
  readonly baseVersion: string;
  readonly head: string;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly description: string;
}

class VersionControlManager {
  private readonly versionsPath: string;
  private readonly metadataPath: string;
  private readonly versions = new Map<string, FileVersion>();
  private readonly branches = new Map<string, VersionBranch>();

  constructor(basePath: string = './storage/versions') {
    this.versionsPath = basePath;
    this.metadataPath = join(basePath, '.metadata');
    this.ensureDirectories();
    this.loadMetadata();
  }

  private ensureDirectories(): void {
    if (!existsSync(this.versionsPath)) {
      mkdirSync(this.versionsPath, { recursive: true });
    }
    if (!existsSync(this.metadataPath)) {
      mkdirSync(this.metadataPath, { recursive: true });
    }
  }

  private async loadMetadata(): Promise<void> {
    try {
      const versionsFile = join(this.metadataPath, 'versions.json');
      if (existsSync(versionsFile)) {
        const data = await fs.readFile(versionsFile, 'utf-8');
        const versions = JSON.parse(data);
        for (const version of versions) {
          this.versions.set(version.versionId, {
            ...version,
            createdAt: new Date(version.createdAt),
            tags: Object.freeze(version.tags || [])
          });
        }
      }

      const branchesFile = join(this.metadataPath, 'branches.json');
      if (existsSync(branchesFile)) {
        const data = await fs.readFile(branchesFile, 'utf-8');
        const branches = JSON.parse(data);
        for (const branch of branches) {
          this.branches.set(branch.branchId, {
            ...branch,
            createdAt: new Date(branch.createdAt)
          });
        }
      }
    } catch (error) {
      console.error('[VERSION_CONTROL] Failed to load metadata:', error);
    }
  }

  private async saveMetadata(): Promise<void> {
    try {
      const versionsData = Array.from(this.versions.values());
      await fs.writeFile(
        join(this.metadataPath, 'versions.json'),
        JSON.stringify(versionsData, null, 2)
      );

      const branchesData = Array.from(this.branches.values());
      await fs.writeFile(
        join(this.metadataPath, 'branches.json'),
        JSON.stringify(branchesData, null, 2)
      );
    } catch (error) {
      console.error('[VERSION_CONTROL] Failed to save metadata:', error);
      throw error;
    }
  }

  async createVersion(
    filePath: string,
    fileId: string,
    userId: string,
    comment: string = 'Auto-generated version',
    tags: string[] = []
  ): Promise<FileVersion> {
    try {
      // Calculate file hash
      const hash = await this.calculateFileHash(filePath);
      const stats = statSync(filePath);
      
      // Check if this exact version already exists
      const existingVersion = Array.from(this.versions.values()).find(
        v => v.fileId === fileId && v.hash === hash
      );
      
      if (existingVersion) {
        console.log(`[VERSION_CONTROL] Version already exists: ${existingVersion.versionId}`);
        return existingVersion;
      }

      // Get current latest version for this file
      const currentVersions = Array.from(this.versions.values())
        .filter(v => v.fileId === fileId)
        .sort((a, b) => b.versionNumber - a.versionNumber);
      
      const latestVersion = currentVersions[0];
      const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;
      
      const versionId = `${fileId}_v${versionNumber}_${Date.now()}`;
      const fileName = basename(filePath);
      
      // Store version file
      const versionFilePath = join(this.versionsPath, versionId + extname(filePath));
      copyFileSync(filePath, versionFilePath);

      const version: FileVersion = {
        versionId,
        fileId,
        fileName,
        versionNumber,
        hash,
        size: stats.size,
        createdAt: new Date(),
        createdBy: userId,
        comment,
        parentVersion: latestVersion?.versionId,
        tags: Object.freeze([...tags]),
        metadata: {}
      };

      this.versions.set(versionId, version);
      await this.saveMetadata();

      console.log(`[VERSION_CONTROL] Created version ${versionNumber} for file ${fileName}`);
      return version;
    } catch (error) {
      console.error('[VERSION_CONTROL] Failed to create version:', error);
      throw error;
    }
  }

  async getVersionHistory(fileId: string): Promise<readonly FileVersion[]> {
    const versions = Array.from(this.versions.values())
      .filter(v => v.fileId === fileId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    return Object.freeze(versions);
  }

  async getVersion(versionId: string): Promise<FileVersion | null> {
    return this.versions.get(versionId) || null;
  }

  async restoreVersion(versionId: string, targetPath: string): Promise<boolean> {
    try {
      const version = this.versions.get(versionId);
      if (!version) {
        throw new Error(`Version not found: ${versionId}`);
      }

      const versionFilePath = join(this.versionsPath, versionId + extname(version.fileName));
      if (!existsSync(versionFilePath)) {
        throw new Error(`Version file not found: ${versionFilePath}`);
      }

      // Ensure target directory exists
      mkdirSync(dirname(targetPath), { recursive: true });
      
      // Copy version file to target
      copyFileSync(versionFilePath, targetPath);

      console.log(`[VERSION_CONTROL] Restored version ${version.versionNumber} to ${targetPath}`);
      return true;
    } catch (error) {
      console.error('[VERSION_CONTROL] Failed to restore version:', error);
      return false;
    }
  }

  async compareVersions(fromVersionId: string, toVersionId: string): Promise<VersionDiff> {
    const fromVersion = this.versions.get(fromVersionId);
    const toVersion = this.versions.get(toVersionId);

    if (!fromVersion || !toVersion) {
      throw new Error('One or both versions not found');
    }

    // Simple comparison based on file size and hash
    const sizeChange = toVersion.size - fromVersion.size;
    const similarity = fromVersion.hash === toVersion.hash ? 1.0 : 0.0;

    return {
      fromVersion: fromVersionId,
      toVersion: toVersionId,
      changes: {
        added: sizeChange > 0 ? sizeChange : 0,
        modified: similarity < 1.0 ? 1 : 0,
        deleted: sizeChange < 0 ? Math.abs(sizeChange) : 0,
        sizeChange
      },
      similarity
    };
  }

  async deleteVersion(versionId: string): Promise<boolean> {
    try {
      const version = this.versions.get(versionId);
      if (!version) {
        return false;
      }

      // Check if this version is referenced by other versions
      const dependentVersions = Array.from(this.versions.values())
        .filter(v => v.parentVersion === versionId);
      
      if (dependentVersions.length > 0) {
        throw new Error('Cannot delete version with dependent versions');
      }

      // Delete version file
      const versionFilePath = join(this.versionsPath, versionId + extname(version.fileName));
      if (existsSync(versionFilePath)) {
        await fs.unlink(versionFilePath);
      }

      this.versions.delete(versionId);
      await this.saveMetadata();

      console.log(`[VERSION_CONTROL] Deleted version: ${versionId}`);
      return true;
    } catch (error) {
      console.error('[VERSION_CONTROL] Failed to delete version:', error);
      return false;
    }
  }

  async tagVersion(versionId: string, tags: string[]): Promise<boolean> {
    try {
      const version = this.versions.get(versionId);
      if (!version) {
        return false;
      }

      const updatedVersion = {
        ...version,
        tags: Object.freeze([...new Set([...version.tags, ...tags])])
      };

      this.versions.set(versionId, updatedVersion);
      await this.saveMetadata();

      return true;
    } catch (error) {
      console.error('[VERSION_CONTROL] Failed to tag version:', error);
      return false;
    }
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async cleanup(retentionDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      let deletedCount = 0;
      for (const [versionId, version] of this.versions.entries()) {
        if (version.createdAt < cutoffDate && !version.tags.includes('keep')) {
          const success = await this.deleteVersion(versionId);
          if (success) deletedCount++;
        }
      }

      console.log(`[VERSION_CONTROL] Cleanup completed: ${deletedCount} old versions deleted`);
      return deletedCount;
    } catch (error) {
      console.error('[VERSION_CONTROL] Cleanup failed:', error);
      return 0;
    }
  }
}

export const versionControl = new VersionControlManager();
