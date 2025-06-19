
// Sistema de caché inteligente distribuido
// Módulo de Carga v1.1.0 - Optimización de rendimiento

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  lastAccess: number;
  size: number;
  ttl?: number;
  tags: string[];
}

interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  totalSize: number;
  averageAccessTime: number;
  hitRate: number;
}

interface CacheConfig {
  maxSize: number;
  maxEntries: number;
  defaultTTL: number;
  compressionThreshold: number;
  enableCompression: boolean;
}

export class IntelligentCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = [];
  private metrics: CacheMetrics;
  private config: CacheConfig;
  private compressionWorker?: Worker;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 50 * 1024 * 1024, // 50MB
      maxEntries: 1000,
      defaultTTL: 30 * 60 * 1000, // 30 minutos
      compressionThreshold: 1024 * 1024, // 1MB
      enableCompression: true,
      ...config
    };

    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalSize: 0,
      averageAccessTime: 0,
      hitRate: 0
    };

    this.initializeCompression();
    this.startCleanupTimer();
  }

  private initializeCompression(): void {
    if (!this.config.enableCompression) return;

    try {
      this.compressionWorker = new Worker(
        new URL('../workers/hash-calculator.ts', import.meta.url),
        { type: 'module' }
      );
    } catch (error) {
      console.warn('[CACHE] Compression worker not available');
    }
  }

  async get(key: string): Promise<T | null> {
    const startTime = performance.now();
    
    const entry = this.cache.get(key);
    if (!entry) {
      this.metrics.misses++;
      this.updateMetrics();
      return null;
    }

    // Verificar TTL
    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
      this.delete(key);
      this.metrics.misses++;
      this.updateMetrics();
      return null;
    }

    // Actualizar estadísticas de acceso
    entry.accessCount++;
    entry.lastAccess = Date.now();
    
    // Mover al final de la lista LRU
    this.moveToEnd(key);
    
    this.metrics.hits++;
    this.metrics.averageAccessTime = (this.metrics.averageAccessTime + (performance.now() - startTime)) / 2;
    this.updateMetrics();

    return entry.data;
  }

  async set(key: string, data: T, options: {
    ttl?: number;
    tags?: string[];
    compress?: boolean;
  } = {}): Promise<void> {
    const size = this.estimateSize(data);
    const ttl = options.ttl || this.config.defaultTTL;
    
    // Comprimir datos grandes si está habilitado
    let finalData = data;
    if (options.compress !== false && size > this.config.compressionThreshold) {
      finalData = await this.compressData(data) || data;
    }

    const entry: CacheEntry<T> = {
      data: finalData,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccess: Date.now(),
      size,
      ttl,
      tags: options.tags || []
    };

    // Verificar límites antes de insertar
    while (this.shouldEvict(size)) {
      this.evictLRU();
    }

    // Insertar entrada
    this.cache.set(key, entry);
    this.accessOrder.push(key);
    this.metrics.totalSize += size;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.removeFromOrder(key);
    this.metrics.totalSize -= entry.size;
    
    return true;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.metrics.totalSize = 0;
    this.metrics.evictions = 0;
  }

  // Invalidar por tags
  invalidateByTag(tag: string): number {
    let invalidated = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag)) {
        this.delete(key);
        invalidated++;
      }
    }
    
    return invalidated;
  }

  // Obtener métricas en tiempo real
  getMetrics(): CacheMetrics & {
    size: number;
    entries: number;
    oldestEntry: number;
    newestEntry: number;
  } {
    const now = Date.now();
    let oldest = now;
    let newest = 0;

    for (const entry of this.cache.values()) {
      oldest = Math.min(oldest, entry.timestamp);
      newest = Math.max(newest, entry.timestamp);
    }

    return {
      ...this.metrics,
      size: this.metrics.totalSize,
      entries: this.cache.size,
      oldestEntry: now - oldest,
      newestEntry: now - newest
    };
  }

  // Optimización inteligente del caché
  optimize(): {
    entriesRemoved: number;
    spaceFreed: number;
    optimizations: string[];
  } {
    const optimizations: string[] = [];
    let entriesRemoved = 0;
    let spaceFreed = 0;
    const now = Date.now();

    // Remover entradas expiradas
    for (const [key, entry] of this.cache.entries()) {
      if (entry.ttl && now - entry.timestamp > entry.ttl) {
        spaceFreed += entry.size;
        this.delete(key);
        entriesRemoved++;
      }
    }

    if (entriesRemoved > 0) {
      optimizations.push(`Removed ${entriesRemoved} expired entries`);
    }

    // Remover entradas poco utilizadas si el caché está lleno
    if (this.metrics.totalSize > this.config.maxSize * 0.8) {
      const candidates = Array.from(this.cache.entries())
        .filter(([_, entry]) => entry.accessCount < 2)
        .sort(([_, a], [__, b]) => a.lastAccess - b.lastAccess)
        .slice(0, 10);

      for (const [key, entry] of candidates) {
        spaceFreed += entry.size;
        this.delete(key);
        entriesRemoved++;
      }

      if (candidates.length > 0) {
        optimizations.push(`Removed ${candidates.length} underused entries`);
      }
    }

    return { entriesRemoved, spaceFreed, optimizations };
  }

  private shouldEvict(newEntrySize: number): boolean {
    return (
      this.cache.size >= this.config.maxEntries ||
      this.metrics.totalSize + newEntrySize > this.config.maxSize
    );
  }

  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const lruKey = this.accessOrder[0];
    const entry = this.cache.get(lruKey);
    
    if (entry) {
      this.metrics.totalSize -= entry.size;
      this.metrics.evictions++;
    }
    
    this.cache.delete(lruKey);
    this.accessOrder.shift();
  }

  private moveToEnd(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(key);
    }
  }

  private removeFromOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  private estimateSize(data: any): number {
    if (typeof data === 'string') {
      return data.length * 2; // UTF-16
    }
    if (data instanceof ArrayBuffer) {
      return data.byteLength;
    }
    if (data instanceof Blob) {
      return data.size;
    }
    
    // Estimación para objetos
    try {
      return JSON.stringify(data).length * 2;
    } catch {
      return 1024; // Fallback
    }
  }

  private async compressData(data: T): Promise<T | null> {
    if (!this.compressionWorker) return null;

    try {
      const serialized = JSON.stringify(data);
      const buffer = new TextEncoder().encode(serialized).buffer;
      
      return new Promise((resolve) => {
        const id = Math.random().toString(36);
        
        const handler = (event: MessageEvent) => {
          if (event.data.id === id) {
            this.compressionWorker?.removeEventListener('message', handler);
            resolve(event.data.result || null);
          }
        };
        
        this.compressionWorker?.addEventListener('message', handler);
        this.compressionWorker?.postMessage({
          id,
          type: 'compress',
          buffer
        });
        
        // Timeout después de 5 segundos
        setTimeout(() => {
          this.compressionWorker?.removeEventListener('message', handler);
          resolve(null);
        }, 5000);
      });
    } catch {
      return null;
    }
  }

  private updateMetrics(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;
  }

  private startCleanupTimer(): void {
    setInterval(() => {
      this.optimize();
    }, 5 * 60 * 1000); // Cada 5 minutos
  }

  destroy(): void {
    this.clear();
    if (this.compressionWorker) {
      this.compressionWorker.terminate();
    }
  }
}

// Instancia global del caché
export const intelligentCache = new IntelligentCache({
  maxSize: 100 * 1024 * 1024, // 100MB
  maxEntries: 2000,
  defaultTTL: 60 * 60 * 1000, // 1 hora
  enableCompression: true
});
