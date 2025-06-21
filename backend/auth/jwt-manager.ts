
/**
 * Sistema de Autenticación JWT - MAAT v1.3.0
 * Gestión completa de tokens con refresh y blacklist
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

interface UserPayload {
  userId: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  permissions: string[];
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface RefreshTokenData {
  userId: string;
  tokenId: string;
  issuedAt: number;
  expiresAt: number;
  deviceId?: string;
  ipAddress?: string;
}

export class JWTManager {
  private readonly ACCESS_SECRET: string;
  private readonly REFRESH_SECRET: string;
  private readonly ACCESS_EXPIRES = '15m';
  private readonly REFRESH_EXPIRES = '7d';
  private tokenBlacklist: Set<string> = new Set();
  private refreshTokens: Map<string, RefreshTokenData> = new Map();

  constructor() {
    this.ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || this.generateSecret();
    this.REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || this.generateSecret();
    
    // Limpieza automática de tokens expirados
    setInterval(() => this.cleanupExpiredTokens(), 60 * 60 * 1000); // 1 hora
  }

  private generateSecret(): string {
    return randomBytes(64).toString('hex');
  }

  async generateTokenPair(user: UserPayload, deviceInfo?: {
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<TokenPair> {
    const tokenId = randomBytes(16).toString('hex');
    const now = Date.now();

    // Access Token (corta duración)
    const accessPayload = {
      ...user,
      tokenId,
      type: 'access',
      iat: Math.floor(now / 1000)
    };

    const accessToken = jwt.sign(accessPayload, this.ACCESS_SECRET, {
      expiresIn: this.ACCESS_EXPIRES,
      issuer: 'maat-system',
      audience: 'maat-api'
    });

    // Refresh Token (larga duración)
    const refreshPayload = {
      userId: user.userId,
      tokenId,
      type: 'refresh',
      iat: Math.floor(now / 1000)
    };

    const refreshToken = jwt.sign(refreshPayload, this.REFRESH_SECRET, {
      expiresIn: this.REFRESH_EXPIRES,
      issuer: 'maat-system',
      audience: 'maat-api'
    });

    // Almacenar información del refresh token
    this.refreshTokens.set(tokenId, {
      userId: user.userId,
      tokenId,
      issuedAt: now,
      expiresAt: now + (7 * 24 * 60 * 60 * 1000), // 7 días
      deviceId: deviceInfo?.deviceId,
      ipAddress: deviceInfo?.ipAddress
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60 // 15 minutos en segundos
    };
  }

  async verifyAccessToken(token: string): Promise<UserPayload | null> {
    try {
      // Verificar si el token está en blacklist
      if (this.tokenBlacklist.has(token)) {
        throw new Error('Token revocado');
      }

      const decoded = jwt.verify(token, this.ACCESS_SECRET, {
        issuer: 'maat-system',
        audience: 'maat-api'
      }) as any;

      if (decoded.type !== 'access') {
        throw new Error('Tipo de token inválido');
      }

      return {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        permissions: decoded.permissions
      };
    } catch (error) {
      console.error('[JWT] Error verificando access token:', error);
      return null;
    }
  }

  async refreshTokenPair(refreshToken: string, deviceInfo?: {
    ipAddress?: string;
    userAgent?: string;
  }): Promise<TokenPair | null> {
    try {
      const decoded = jwt.verify(refreshToken, this.REFRESH_SECRET, {
        issuer: 'maat-system',
        audience: 'maat-api'
      }) as any;

      if (decoded.type !== 'refresh') {
        throw new Error('Tipo de token inválido');
      }

      // Verificar si el refresh token existe y es válido
      const tokenData = this.refreshTokens.get(decoded.tokenId);
      if (!tokenData || tokenData.expiresAt < Date.now()) {
        throw new Error('Refresh token expirado o inválido');
      }

      // Invalidar el refresh token actual
      this.refreshTokens.delete(decoded.tokenId);

      // Aquí deberías obtener los datos del usuario desde tu base de datos
      // Por ahora simulamos la respuesta
      const userData: UserPayload = {
        userId: decoded.userId,
        email: 'user@example.com', // Obtener de BD
        role: 'user', // Obtener de BD
        permissions: ['upload', 'view'] // Obtener de BD
      };

      // Generar nuevo par de tokens
      return await this.generateTokenPair(userData, deviceInfo);
    } catch (error) {
      console.error('[JWT] Error refrescando tokens:', error);
      return null;
    }
  }

  revokeToken(token: string): void {
    this.tokenBlacklist.add(token);
    
    // Limpiar automáticamente después de la expiración
    setTimeout(() => {
      this.tokenBlacklist.delete(token);
    }, 15 * 60 * 1000); // 15 minutos
  }

  revokeRefreshToken(tokenId: string): void {
    this.refreshTokens.delete(tokenId);
  }

  revokeAllUserTokens(userId: string): void {
    // Revocar todos los refresh tokens del usuario
    for (const [tokenId, tokenData] of this.refreshTokens.entries()) {
      if (tokenData.userId === userId) {
        this.refreshTokens.delete(tokenId);
      }
    }
  }

  private cleanupExpiredTokens(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [tokenId, tokenData] of this.refreshTokens.entries()) {
      if (tokenData.expiresAt < now) {
        this.refreshTokens.delete(tokenId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[JWT] Limpiados ${cleanedCount} refresh tokens expirados`);
    }
  }

  // Middleware para Express
  authenticateToken() {
    return async (req: any, res: any, next: any) => {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

      if (!token) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'MISSING_TOKEN',
            message: 'Token de acceso requerido'
          }
        });
      }

      const user = await this.verifyAccessToken(token);
      if (!user) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Token inválido o expirado'
          }
        });
      }

      req.user = user;
      next();
    };
  }

  // Middleware para verificar permisos
  requirePermission(permission: string) {
    return (req: any, res: any, next: any) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Usuario no autenticado'
          }
        });
      }

      if (!req.user.permissions.includes(permission) && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: `Permiso requerido: ${permission}`
          }
        });
      }

      next();
    };
  }

  // Middleware para verificar rol
  requireRole(role: string) {
    return (req: any, res: any, next: any) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Usuario no autenticado'
          }
        });
      }

      if (req.user.role !== role && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_ROLE',
            message: `Rol requerido: ${role}`
          }
        });
      }

      next();
    };
  }

  getTokenStats(): {
    activeRefreshTokens: number;
    blacklistedTokens: number;
    tokensByUser: Record<string, number>;
  } {
    const tokensByUser: Record<string, number> = {};
    
    for (const tokenData of this.refreshTokens.values()) {
      tokensByUser[tokenData.userId] = (tokensByUser[tokenData.userId] || 0) + 1;
    }

    return {
      activeRefreshTokens: this.refreshTokens.size,
      blacklistedTokens: this.tokenBlacklist.size,
      tokensByUser
    };
  }
}

export const jwtManager = new JWTManager();
