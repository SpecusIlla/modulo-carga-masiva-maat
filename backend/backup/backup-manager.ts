
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';

interface BackupConfig {
  outputDir: string;
  retentionDays: number;
  includePatterns: string[];
  excludePatterns: string[];
}

interface BackupResult {
  filename: string;
  size: number;
  timestamp: Date;
  integrity: boolean;
  buildHash: string;
}

export class BackupManager {
  private config: BackupConfig;

  constructor(config?: Partial<BackupConfig>) {
    this.config = {
      outputDir: './backups',
      retentionDays: 30,
      includePatterns: [
        'backend/**',
        'frontend/**',
        'components/**',
        'database/**',
        'lib/**',
        'types/**',
        'docs/**',
        '*.ts',
        '*.js',
        '*.json',
        '*.md',
        'package.json',
        'tsconfig.json',
        'drizzle.config.ts'
      ],
      excludePatterns: [
        'node_modules/**',
        'uploads/**',
        'temp/**',
        'logs/**',
        'backups/**',
        'attached_assets/**',
        '.git/**',
        '*.log'
      ],
      ...config
    };
  }

  async createBackup(): Promise<BackupResult> {
    const timestamp = new Date();
    const dateStr = timestamp.toISOString().slice(0, 19).replace(/[:-]/g, '');
    const filename = `maat-v1.0.5-complete-backup-${dateStr}.tar.gz`;
    const outputPath = path.join(this.config.outputDir, filename);

    // Ensure backup directory exists
    await fs.promises.mkdir(this.config.outputDir, { recursive: true });

    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: {
        level: 6
      }
    });

    const output = fs.createWriteStream(outputPath);
    archive.pipe(output);

    // Add files based on patterns
    for (const pattern of this.config.includePatterns) {
      if (pattern.endsWith('/**')) {
        const dir = pattern.slice(0, -3);
        if (await this.directoryExists(dir)) {
          archive.directory(dir, dir);
        }
      } else if (pattern.includes('*')) {
        archive.glob(pattern);
      } else {
        if (await this.fileExists(pattern)) {
          archive.file(pattern, { name: pattern });
        }
      }
    }

    await archive.finalize();

    return new Promise((resolve, reject) => {
      output.on('close', async () => {
        const stats = await fs.promises.stat(outputPath);
        const integrity = await this.verifyBackupIntegrity(outputPath);
        
        resolve({
          filename,
          size: stats.size,
          timestamp,
          integrity,
          buildHash: 'a9e7d1f3'
        });
      });

      output.on('error', reject);
      archive.on('error', reject);
    });
  }

  async verifyBackupIntegrity(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.size > 0;
    } catch {
      return false;
    }
  }

  async cleanupOldBackups(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    try {
      const files = await fs.promises.readdir(this.config.outputDir);
      
      for (const file of files) {
        if (file.startsWith('maat-') && file.endsWith('.tar.gz')) {
          const filePath = path.join(this.config.outputDir, file);
          const stats = await fs.promises.stat(filePath);
          
          if (stats.mtime < cutoffDate) {
            await fs.promises.unlink(filePath);
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up old backups:', error);
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}

export const backupManager = new BackupManager();
