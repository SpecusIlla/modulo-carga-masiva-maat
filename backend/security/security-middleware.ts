import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import { virusScanner } from './virus-scanner';
import { encryption } from './encryption';
import { auditLogger } from './audit-logger';

interface SecureRequest extends Request {
  securityContext?: {
    fileScanned: boolean;
    encryptionEnabled: boolean;
    riskLevel: string;
    scanResults?: any;
  };
  user?: {
    id: string;
    username: string;
  };
}

interface SecurityConfig {
  enableVirusScanning: boolean;
  enableEncryption: boolean;
  enableAuditing: boolean;
  maxFileSize: number;
  allowedMimeTypes: string[];
  quarantineThreats: boolean;
}

export class SecurityMiddleware {
  private config: SecurityConfig;
  private upload: multer.Multer;

  constructor() {
    this.config = {
      enableVirusScanning: true,
      enableEncryption: true,
      enableAuditing: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      allowedMimeTypes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/bmp',
        'image/webp',
        'image/tiff',
        'image/heic',
        'image/heif',
        'video/mp4',
        'video/avi',
        'video/mov',
        'video/wmv',
        'video/webm',
        'video/mkv'
      ],
      quarantineThreats: true
    };

    this.initializeUploadHandler();
    console.log('[SECURITY] Security middleware initialized');
  }

  private initializeUploadHandler() {
    const storage = multer.diskStorage({
      destination: async (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), 'temp-uploads');
        await fs.mkdir(uploadDir, { recursive: true });
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${uniqueSuffix}-${sanitizedName}`);
      }
    });

    this.upload = multer({
      storage,
      limits: {
        fileSize: this.config.maxFileSize,
        files: 50 // Maximum 50 files per request
      },
      fileFilter: (req, file, cb) => {
        // Basic MIME type validation
        if (this.config.allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`File type ${file.mimetype} not allowed`));
        }
      }
    });
  }

  // Audit logging middleware
  auditMiddleware() {
    return async (req: SecureRequest, res: Response, next: NextFunction) => {
      if (!this.config.enableAuditing) {
        return next();
      }

      const startTime = Date.now();
      const originalSend = res.send;

      // Override res.send to capture response
      res.send = function(data) {
        const duration = Date.now() - startTime;
        const success = res.statusCode < 400;

        // Log the event asynchronously
        setImmediate(async () => {
          try {
            const userId = req.user?.id || 'anonymous';
            const username = req.user?.username || 'anonymous';
            const action = `${req.method}_${req.path.replace(/\/\d+/g, '/:id')}`;
            const resource = req.path.split('/')[2] || req.path;

            await auditLogger.logEvent(
              userId,
              username,
              action,
              resource,
              req,
              success,
              success ? undefined : `HTTP ${res.statusCode}`,
              req.params?.id,
              { duration }
            );
          } catch (error) {
            console.error('[SECURITY] Audit logging failed:', error);
          }
        });

        return originalSend.call(this, data);
      };

      next();
    };
  }

  // File upload with security scanning
  secureFileUpload() {
    return [
      this.upload.single('file'),
      async (req: SecureRequest, res: Response, next: NextFunction) => {
        if (!req.file) {
          return next();
        }

        try {
          const startTime = Date.now();
          
          // Initialize security context
          req.securityContext = {
            fileScanned: false,
            encryptionEnabled: this.config.enableEncryption,
            riskLevel: 'unknown'
          };

          // Virus scanning
          if (this.config.enableVirusScanning) {
            console.log(`[SECURITY] Scanning file: ${req.file.originalname}`);
            
            const scanResult = await virusScanner.scanFile(req.file.path, req.file.originalname);
            req.securityContext.fileScanned = true;
            req.securityContext.scanResults = scanResult;
            req.securityContext.riskLevel = scanResult.isClean ? 'low' : 'critical';

            if (!scanResult.isClean) {
              // Remove the uploaded file
              await fs.unlink(req.file.path).catch(console.error);
              
              // Log security event
              if (this.config.enableAuditing) {
                await auditLogger.logEvent(
                  req.user?.id || 'anonymous',
                  req.user?.username || 'anonymous',
                  'FILE_UPLOAD_BLOCKED',
                  'file_security',
                  req,
                  false,
                  `Malicious file detected: ${scanResult.threats.join(', ')}`,
                  undefined,
                  { 
                    fileName: req.file.originalname,
                    threats: scanResult.threats,
                    scanTime: scanResult.scanTime
                  }
                );
              }

              return res.status(400).json({
                error: 'File rejected by security scan',
                threats: scanResult.threats,
                scanEngine: scanResult.scanEngine
              });
            }

            console.log(`[SECURITY] File scan completed: ${req.file.originalname} - CLEAN (${scanResult.scanTime}ms)`);
          }

          // File encryption (if enabled)
          if (this.config.enableEncryption && req.body.encrypt === 'true') {
            try {
              const password = req.body.encryptionPassword || process.env.DEFAULT_FILE_ENCRYPTION_KEY || 'default-key';
              const encryptionResult = await encryption.encryptFileForTransfer(req.file.path, password);
              
              // Replace original file with encrypted version
              await fs.unlink(req.file.path);
              req.file.path = encryptionResult.encryptedPath;
              req.file.filename = req.file.filename + '.encrypted';
              
              // Store encryption metadata
              req.securityContext.encryptionEnabled = true;
              
              console.log(`[SECURITY] File encrypted: ${req.file.originalname}`);
            } catch (error) {
              console.error('[SECURITY] File encryption failed:', error);
              await fs.unlink(req.file.path).catch(console.error);
              return res.status(500).json({ error: 'File encryption failed' });
            }
          }

          // Log successful security processing
          if (this.config.enableAuditing) {
            await auditLogger.logEvent(
              req.user?.id || 'anonymous',
              req.user?.username || 'anonymous',
              'FILE_UPLOAD_PROCESSED',
              'file_security',
              req,
              true,
              undefined,
              undefined,
              {
                fileName: req.file.originalname,
                fileSize: req.file.size,
                processingTime: Date.now() - startTime,
                scanned: req.securityContext.fileScanned,
                encrypted: req.securityContext.encryptionEnabled
              }
            );
          }

          next();

        } catch (error) {
          console.error('[SECURITY] File security processing failed:', error);
          
          // Clean up file on error
          if (req.file?.path) {
            await fs.unlink(req.file.path).catch(console.error);
          }

          res.status(500).json({ error: 'Security processing failed' });
        }
      }
    ];
  }

  // Bulk file upload with security scanning
  secureBulkUpload() {
    return [
      this.upload.array('files', 50),
      async (req: SecureRequest, res: Response, next: NextFunction) => {
        if (!req.files || !Array.isArray(req.files)) {
          return next();
        }

        try {
          const startTime = Date.now();
          const results: any[] = [];
          
          req.securityContext = {
            fileScanned: false,
            encryptionEnabled: this.config.enableEncryption,
            riskLevel: 'unknown'
          };

          // Process each file
          for (const file of req.files) {
            const fileResult: any = {
              originalName: file.originalname,
              filename: file.filename,
              path: file.path,
              size: file.size,
              secure: false,
              threats: []
            };

            // Virus scanning
            if (this.config.enableVirusScanning) {
              const scanResult = await virusScanner.scanFile(file.path, file.originalname);
              fileResult.scanResult = scanResult;
              fileResult.secure = scanResult.isClean;
              fileResult.threats = scanResult.threats;

              if (!scanResult.isClean) {
                // Remove malicious file
                await fs.unlink(file.path).catch(console.error);
                fileResult.rejected = true;
                fileResult.reason = 'Malicious content detected';
              }
            } else {
              fileResult.secure = true;
            }

            results.push(fileResult);
          }

          // Filter out rejected files
          const acceptedFiles = results.filter(r => !r.rejected);
          const rejectedFiles = results.filter(r => r.rejected);

          // Log bulk upload event
          if (this.config.enableAuditing) {
            await auditLogger.logEvent(
              req.user?.id || 'anonymous',
              req.user?.username || 'anonymous',
              'BULK_FILE_UPLOAD',
              'file_security',
              req,
              true,
              undefined,
              undefined,
              {
                totalFiles: req.files.length,
                acceptedFiles: acceptedFiles.length,
                rejectedFiles: rejectedFiles.length,
                processingTime: Date.now() - startTime
              }
            );
          }

          // Update request with security results
          req.securityContext.fileScanned = true;
          req.securityContext.riskLevel = rejectedFiles.length > 0 ? 'medium' : 'low';
          
          // Attach results to request for further processing
          (req as any).securityResults = results;
          
          console.log(`[SECURITY] Bulk upload processed: ${acceptedFiles.length}/${req.files.length} files accepted`);
          
          next();

        } catch (error) {
          console.error('[SECURITY] Bulk security processing failed:', error);
          
          // Clean up files on error
          if (req.files && Array.isArray(req.files)) {
            for (const file of req.files) {
              await fs.unlink(file.path).catch(console.error);
            }
          }

          res.status(500).json({ error: 'Bulk security processing failed' });
        }
      }
    ];
  }

  // Security headers middleware
  securityHeaders() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Set security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      
      // Content Security Policy
      res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'"
      ].join('; '));

      next();
    };
  }

  // Rate limiting middleware
  rateLimitMiddleware() {
    const requestCounts = new Map<string, { count: number; resetTime: number }>();
    const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
    const MAX_REQUESTS = 1000; // Per IP per window

    return (req: Request, res: Response, next: NextFunction) => {
      const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
      const now = Date.now();
      
      // Clean up old entries
      for (const [ip, data] of requestCounts.entries()) {
        if (now > data.resetTime) {
          requestCounts.delete(ip);
        }
      }

      // Check current IP
      const current = requestCounts.get(clientIP);
      if (!current) {
        requestCounts.set(clientIP, { count: 1, resetTime: now + WINDOW_MS });
        return next();
      }

      if (now > current.resetTime) {
        requestCounts.set(clientIP, { count: 1, resetTime: now + WINDOW_MS });
        return next();
      }

      if (current.count >= MAX_REQUESTS) {
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil((current.resetTime - now) / 1000)
        });
      }

      current.count++;
      next();
    };
  }

  // IP whitelist middleware
  ipWhitelistMiddleware(allowedIPs: string[] = []) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (allowedIPs.length === 0) {
        return next(); // No restrictions if no IPs specified
      }

      const clientIP = req.ip || req.connection.remoteAddress || '';
      
      if (!allowedIPs.includes(clientIP)) {
        console.warn(`[SECURITY] Blocked request from unauthorized IP: ${clientIP}`);
        return res.status(403).json({ error: 'Access denied: IP not authorized' });
      }

      next();
    };
  }

  // Get security metrics
  async getSecurityMetrics(timeRange?: { start: Date; end: Date }) {
    if (!timeRange) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7); // Last 7 days
      timeRange = { start, end };
    }

    try {
      const metrics = await auditLogger.getSecurityMetrics(timeRange);
      const quarantinedFiles = await virusScanner.getQuarantinedFiles();

      return {
        audit: metrics,
        quarantine: {
          totalFiles: quarantinedFiles.length,
          recentFiles: quarantinedFiles.slice(0, 10)
        },
        systemStatus: {
          virusScannerActive: this.config.enableVirusScanning,
          encryptionActive: this.config.enableEncryption,
          auditingActive: this.config.enableAuditing
        }
      };
    } catch (error) {
      console.error('[SECURITY] Failed to get security metrics:', error);
      throw error;
    }
  }

  // Update security configuration
  updateConfig(newConfig: Partial<SecurityConfig>) {
    this.config = { ...this.config, ...newConfig };
    console.log('[SECURITY] Configuration updated:', newConfig);
  }
}

export const securityMiddleware = new SecurityMiddleware();