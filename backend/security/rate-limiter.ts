
// Rate Limiter para prevenir abuse - MAAT v1.1.1
// Límites por IP, usuario y tipo de operación

import { Request, Response, NextFunction } from 'express';

export interface RateLimitConfig {
  readonly windowMs: number;
  readonly maxRequests: number;
  readonly maxUploadSize: number;
  readonly skipSuccessfulRequests: boolean;
  readonly skipFailedRequests: boolean;
  readonly keyGenerator: (req: Request) => string;
}

export interface RateLimitEntry {
  readonly count: number;
  readonly uploadedBytes: number;
  readonly resetTime: number;
  readonly lastRequestTime: number;
  readonly blocked: boolean;
}

export class RateLimiter {
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly configs = new Map<string, RateLimitConfig>();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Configuraciones por defecto para diferentes tipos de operaciones
    this.configs.set('upload', {
      windowMs: 15 * 60 * 1000, // 15 minutos
      maxRequests: 50,
      maxUploadSize: 500 * 1024 * 1024, // 500MB por ventana
      skipSuccessfulRequests: false,
      skipFailedRequests: true,
      keyGenerator: (req: Request) => `upload_${this.getClientIP(req)}_${req.user?.id || 'anonymous'}`
    });

    this.configs.set('api', {
      windowMs: 60 * 1000, // 1 minuto
      maxRequests: 100,
      maxUploadSize: 0,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (req: Request) => `api_${this.getClientIP(req)}`
    });

    this.configs.set('heavy', {
      windowMs: 60 * 60 * 1000, // 1 hora
      maxRequests: 10,
      maxUploadSize: 1024 * 1024 * 1024, // 1GB por hora
      skipSuccessfulRequests: false,
      skipFailedRequests: true,
      keyGenerator: (req: Request) => `heavy_${req.user?.id || this.getClientIP(req)}`
    });

    // Limpiar entradas expiradas cada 5 minutos
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Middleware para aplicar rate limiting
   */
  createMiddleware(type: string = 'api') {
    return (req: Request, res: Response, next: NextFunction): void => {
      const config = this.configs.get(type);
      if (!config) {
        console.error(`[RATE-LIMITER] Configuración no encontrada para tipo: ${type}`);
        return next();
      }

      const key = config.keyGenerator(req);
      const now = Date.now();
      const fileSize = this.getFileSize(req);

      // Obtener o crear entrada
      let entry = this.store.get(key);
      if (!entry || now > entry.resetTime) {
        entry = {
          count: 0,
          uploadedBytes: 0,
          resetTime: now + config.windowMs,
          lastRequestTime: now,
          blocked: false
        };
      }

      // Verificar si está bloqueado
      if (entry.blocked && now < entry.resetTime) {
        this.sendRateLimitResponse(res, entry, config);
        return;
      }

      // Verificar límites
      const wouldExceedRequests = entry.count >= config.maxRequests;
      const wouldExceedUpload = config.maxUploadSize > 0 && 
                                (entry.uploadedBytes + fileSize) > config.maxUploadSize;

      if (wouldExceedRequests || wouldExceedUpload) {
        // Marcar como bloqueado
        entry = {
          ...entry,
          blocked: true,
          lastRequestTime: now
        };
        this.store.set(key, entry);

        // Log intento de abuse
        console.warn(`[RATE-LIMITER] Cliente bloqueado: ${key}`, {
          requests: entry.count,
          uploadedBytes: entry.uploadedBytes,
          fileSize,
          type,
          ip: this.getClientIP(req),
          userAgent: req.get('User-Agent')
        });

        this.sendRateLimitResponse(res, entry, config);
        return;
      }

      // Actualizar contadores
      entry = {
        ...entry,
        count: entry.count + 1,
        uploadedBytes: entry.uploadedBytes + fileSize,
        lastRequestTime: now,
        blocked: false
      };
      this.store.set(key, entry);

      // Añadir headers informativos
      res.set({
        'X-RateLimit-Limit': config.maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, config.maxRequests - entry.count).toString(),
        'X-RateLimit-Reset': new Date(entry.resetTime).toISOString(),
        'X-RateLimit-Upload-Limit': config.maxUploadSize.toString(),
        'X-RateLimit-Upload-Remaining': Math.max(0, config.maxUploadSize - entry.uploadedBytes).toString()
      });

      next();
    };
  }

  /**
   * Añade configuración personalizada para un tipo
   */
  addConfig(type: string, config: Partial<RateLimitConfig>): void {
    const defaultConfig = this.configs.get('api')!;
    this.configs.set(type, { ...defaultConfig, ...config });
    console.log(`[RATE-LIMITER] Configuración añadida para tipo: ${type}`);
  }

  /**
   * Obtiene estadísticas de rate limiting
   */
  getStats(): {
    totalEntries: number;
    blockedIPs: number;
    topClients: Array<{ key: string; requests: number; uploadedMB: number }>;
  } {
    const now = Date.now();
    let blockedIPs = 0;
    const activeEntries: Array<{ key: string; requests: number; uploadedMB: number }> = [];

    for (const [key, entry] of this.store.entries()) {
      // Solo contar entradas activas (no expiradas)
      if (now <= entry.resetTime) {
        if (entry.blocked) {
          blockedIPs++;
        }
        activeEntries.push({
          key,
          requests: entry.count,
          uploadedMB: Math.round(entry.uploadedBytes / (1024 * 1024))
        });
      }
    }

    // Ordenar por número de requests
    const topClients = activeEntries
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    return {
      totalEntries: activeEntries.length,
      blockedIPs,
      topClients
    };
  }

  /**
   * Desbloquea manualmente un cliente (para administradores)
   */
  unblockClient(key: string): boolean {
    const entry = this.store.get(key);
    if (entry) {
      this.store.set(key, { ...entry, blocked: false });
      console.log(`[RATE-LIMITER] Cliente desbloqueado manualmente: ${key}`);
      return true;
    }
    return false;
  }

  /**
   * Limpia entradas expiradas
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[RATE-LIMITER] ${cleaned} entradas expiradas limpiadas`);
    }
  }

  /**
   * Extrae IP del cliente considerando proxies
   */
  private getClientIP(req: Request): string {
    return (req.ip ||
            req.connection.remoteAddress ||
            (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
            (req.headers['x-real-ip'] as string) ||
            'unknown').toString();
  }

  /**
   * Obtiene tamaño del archivo desde la request
   */
  private getFileSize(req: Request): number {
    const contentLength = req.get('content-length');
    return contentLength ? parseInt(contentLength, 10) : 0;
  }

  /**
   * Envía respuesta de rate limit excedido
   */
  private sendRateLimitResponse(res: Response, entry: RateLimitEntry, config: RateLimitConfig): void {
    const retryAfter = Math.ceil((entry.resetTime - Date.now()) / 1000);
    
    res.status(429).set({
      'Retry-After': retryAfter.toString(),
      'X-RateLimit-Limit': config.maxRequests.toString(),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': new Date(entry.resetTime).toISOString()
    }).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests, please try again later',
      retryAfter,
      resetTime: new Date(entry.resetTime).toISOString()
    });
  }

  /**
   * Cleanup al cerrar
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

export const rateLimiter = new RateLimiter();
