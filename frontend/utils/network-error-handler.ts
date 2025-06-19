
// Manejo robusto de errores de red con reintentos automáticos - MAAT v1.1.0
// Sistema inteligente para redes hospitalarias inestables

export interface RetryConfig {
  readonly maxRetries: number;
  readonly baseDelay: number;
  readonly maxDelay: number;
  readonly exponentialBackoff: boolean;
  readonly jitterEnabled: boolean;
}

export interface NetworkError {
  readonly type: 'timeout' | 'connection' | 'server' | 'unknown';
  readonly code?: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly timestamp: number;
}

export interface RetryAttempt {
  readonly attemptNumber: number;
  readonly delay: number;
  readonly error: NetworkError;
  readonly timestamp: number;
}

export interface RecoverySession {
  readonly sessionId: string;
  readonly uploadId: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly chunksCompleted: number[];
  readonly totalChunks: number;
  readonly lastActivity: number;
  readonly priority: 'urgent' | 'high' | 'normal' | 'low';
  readonly retryCount: number;
  readonly errors: NetworkError[];
}

export class NetworkErrorHandler {
  private readonly defaultConfig: RetryConfig = {
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    exponentialBackoff: true,
    jitterEnabled: true
  };

  private readonly sessions = new Map<string, RecoverySession>();
  private readonly STORAGE_KEY = 'maat_recovery_sessions';

  constructor(private config: Partial<RetryConfig> = {}) {
    this.loadRecoverySessions();
    this.startSessionCleanup();
  }

  /**
   * Ejecuta una operación con reintentos automáticos inteligentes
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>,
    context?: { uploadId?: string; chunkIndex?: number; priority?: 'urgent' | 'high' | 'normal' | 'low' }
  ): Promise<T> {
    const retryConfig = { ...this.defaultConfig, ...config };
    const attempts: RetryAttempt[] = [];
    let lastError: NetworkError;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // Si es exitoso y hay contexto, limpiar sesión de recuperación
        if (context?.uploadId) {
          this.clearRecoverySession(context.uploadId);
        }
        
        return result;
      } catch (error) {
        lastError = this.classifyError(error);
        
        // Guardar información del intento
        attempts.push({
          attemptNumber: attempt + 1,
          delay: this.calculateDelay(attempt, retryConfig),
          error: lastError,
          timestamp: Date.now()
        });

        // Si es el último intento o el error no es reintentable
        if (attempt === retryConfig.maxRetries || !lastError.retryable) {
          // Crear sesión de recuperación para uploads
          if (context?.uploadId && context.chunkIndex !== undefined) {
            this.createRecoverySession({
              uploadId: context.uploadId,
              chunkIndex: context.chunkIndex,
              priority: context.priority || 'normal',
              error: lastError
            });
          }
          break;
        }

        // Esperar antes del siguiente intento
        const delay = this.calculateDelay(attempt, retryConfig);
        await this.sleep(delay);

        console.warn(`[NETWORK-ERROR-HANDLER] Reintento ${attempt + 1}/${retryConfig.maxRetries} en ${delay}ms`, {
          error: lastError,
          context
        });
      }
    }

    throw new Error(`Operación falló después de ${retryConfig.maxRetries} reintentos. Último error: ${lastError.message}`);
  }

  /**
   * Clasifica el tipo de error para determinar estrategia de reintento
   */
  private classifyError(error: unknown): NetworkError {
    const timestamp = Date.now();

    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        type: 'connection',
        message: 'Error de conexión de red',
        retryable: true,
        timestamp
      };
    }

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        type: 'timeout',
        message: 'Timeout de solicitud',
        retryable: true,
        timestamp
      };
    }

    if (error && typeof error === 'object' && 'status' in error) {
      const statusCode = (error as { status: number }).status;
      
      // Errores del servidor (5xx) son reintentables
      if (statusCode >= 500) {
        return {
          type: 'server',
          message: `Error del servidor: ${statusCode}`,
          retryable: true,
          statusCode,
          timestamp
        };
      }

      // Rate limiting (429) es reintentable con delay mayor
      if (statusCode === 429) {
        return {
          type: 'server',
          message: 'Rate limit excedido',
          retryable: true,
          statusCode: 429,
          timestamp
        };
      }

      // Errores de cliente (4xx) generalmente no son reintentables
      if (statusCode >= 400 && statusCode < 500) {
        return {
          type: 'server',
          message: `Error del cliente: ${statusCode}`,
          retryable: false,
          statusCode,
          timestamp
        };
      }
    }

    return {
      type: 'unknown',
      message: error instanceof Error ? error.message : 'Error desconocido',
      retryable: true,
      timestamp
    };
  }

  /**
   * Calcula el delay para el siguiente intento con backoff exponencial
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelay;

    if (config.exponentialBackoff) {
      delay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay);
    }

    // Agregar jitter para evitar efecto thundering herd
    if (config.jitterEnabled) {
      const jitter = Math.random() * 0.3; // ±30% de variación
      delay = delay * (1 + jitter);
    }

    return Math.floor(delay);
  }

  /**
   * Crea una sesión de recuperación para uploads interrumpidos
   */
  createRecoverySession(params: {
    uploadId: string;
    chunkIndex: number;
    priority: 'urgent' | 'high' | 'normal' | 'low';
    error: NetworkError;
  }): void {
    const sessionId = `recovery_${params.uploadId}_${Date.now()}`;
    
    const session: RecoverySession = {
      sessionId,
      uploadId: params.uploadId,
      fileName: '', // Se actualizará desde el contexto
      fileSize: 0,
      chunksCompleted: [], // Se actualizará desde el progreso
      totalChunks: 0,
      lastActivity: Date.now(),
      priority: params.priority,
      retryCount: 0,
      errors: [params.error]
    };

    this.sessions.set(sessionId, session);
    this.saveRecoverySessions();

    console.log(`[NETWORK-ERROR-HANDLER] Sesión de recuperación creada: ${sessionId}`);
  }

  /**
   * Recupera uploads interrumpidos
   */
  async recoverInterruptedUploads(): Promise<RecoverySession[]> {
    const recoverableSessions = Array.from(this.sessions.values())
      .filter(session => {
        const timeSinceLastActivity = Date.now() - session.lastActivity;
        return timeSinceLastActivity < 24 * 60 * 60 * 1000; // Último día
      })
      .sort((a, b) => {
        // Priorizar por urgencia y luego por tiempo
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.lastActivity - a.lastActivity; // Más reciente primero
      });

    console.log(`[NETWORK-ERROR-HANDLER] ${recoverableSessions.length} sesiones de recuperación encontradas`);
    return recoverableSessions;
  }

  /**
   * Limpia una sesión de recuperación exitosa
   */
  clearRecoverySession(uploadId: string): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.uploadId === uploadId) {
        this.sessions.delete(sessionId);
        console.log(`[NETWORK-ERROR-HANDLER] Sesión de recuperación limpiada: ${sessionId}`);
      }
    }
    this.saveRecoverySessions();
  }

  /**
   * Obtiene estadísticas de confiabilidad de red
   */
  getNetworkReliabilityStats(): {
    totalSessions: number;
    successRate: number;
    averageRetryCount: number;
    commonErrors: { type: string; count: number }[];
  } {
    const sessions = Array.from(this.sessions.values());
    const totalSessions = sessions.length;
    const successfulSessions = sessions.filter(s => s.retryCount === 0).length;
    const successRate = totalSessions > 0 ? (successfulSessions / totalSessions) * 100 : 100;
    
    const totalRetries = sessions.reduce((sum, s) => sum + s.retryCount, 0);
    const averageRetryCount = totalSessions > 0 ? totalRetries / totalSessions : 0;

    // Contar tipos de errores más comunes
    const errorCounts = new Map<string, number>();
    sessions.forEach(session => {
      session.errors.forEach(error => {
        const current = errorCounts.get(error.type) || 0;
        errorCounts.set(error.type, current + 1);
      });
    });

    const commonErrors = Array.from(errorCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalSessions,
      successRate,
      averageRetryCount,
      commonErrors
    };
  }

  /**
   * Verifica el estado de la conexión de red
   */
  async checkNetworkHealth(): Promise<{
    online: boolean;
    latency: number;
    bandwidth: number;
    quality: 'excellent' | 'good' | 'fair' | 'poor';
  }> {
    const online = navigator.onLine;
    let latency = 0;
    let bandwidth = 0;

    if (online) {
      try {
        const start = Date.now();
        const response = await fetch('/api/health', { 
          method: 'HEAD',
          cache: 'no-cache'
        });
        latency = Date.now() - start;

        // Estimar bandwidth con un pequeño payload de test
        const testStart = Date.now();
        const testResponse = await fetch('/api/bandwidth-test', {
          method: 'POST',
          body: new Uint8Array(1024), // 1KB test
          cache: 'no-cache'
        });
        const testTime = (Date.now() - testStart) / 1000;
        bandwidth = testResponse.ok ? 1024 / testTime : 0; // bytes/sec
      } catch (error) {
        console.warn('[NETWORK-ERROR-HANDLER] Health check failed:', error);
      }
    }

    // Determinar calidad de red
    let quality: 'excellent' | 'good' | 'fair' | 'poor';
    if (!online || latency > 2000) {
      quality = 'poor';
    } else if (latency > 1000) {
      quality = 'fair';
    } else if (latency > 500) {
      quality = 'good';
    } else {
      quality = 'excellent';
    }

    return { online, latency, bandwidth, quality };
  }

  /**
   * Guarda sesiones de recuperación en localStorage
   */
  private saveRecoverySessions(): void {
    try {
      const sessionData = Array.from(this.sessions.entries());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessionData));
    } catch (error) {
      console.warn('[NETWORK-ERROR-HANDLER] Failed to save recovery sessions:', error);
    }
  }

  /**
   * Carga sesiones de recuperación desde localStorage
   */
  private loadRecoverySessions(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const sessionData = JSON.parse(saved) as [string, RecoverySession][];
        this.sessions.clear();
        sessionData.forEach(([id, session]) => {
          this.sessions.set(id, session);
        });
        console.log(`[NETWORK-ERROR-HANDLER] ${sessionData.length} sesiones de recuperación cargadas`);
      }
    } catch (error) {
      console.warn('[NETWORK-ERROR-HANDLER] Failed to load recovery sessions:', error);
    }
  }

  /**
   * Limpia sesiones de recuperación antiguas
   */
  private startSessionCleanup(): void {
    setInterval(() => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 horas
      let cleaned = 0;

      for (const [sessionId, session] of this.sessions.entries()) {
        if (session.lastActivity < cutoff) {
          this.sessions.delete(sessionId);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[NETWORK-ERROR-HANDLER] ${cleaned} sesiones de recuperación antiguas limpiadas`);
        this.saveRecoverySessions();
      }
    }, 60 * 60 * 1000); // Cada hora
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const networkErrorHandler = new NetworkErrorHandler();
