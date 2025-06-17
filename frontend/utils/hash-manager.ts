// Gestor de hash con Web Workers para mejor rendimiento
// Módulo de Carga v1.0.0 - Optimización de rendimiento

interface HashJob {
  id: string;
  file: File;
  algorithm: 'sha256' | 'sha1';
  resolve: (hash: string) => void;
  reject: (error: Error) => void;
}

class HashManager {
  private worker: Worker | null = null;
  private pendingJobs = new Map<string, HashJob>();
  private jobQueue: HashJob[] = [];
  private isProcessing = false;

  private initWorker(): void {
    if (this.worker) return;

    try {
      this.worker = new Worker(
        new URL('../workers/hash-calculator.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (event: MessageEvent) => {
        const { id, hash, error } = event.data;
        const job = this.pendingJobs.get(id);
        
        if (!job) return;
        
        this.pendingJobs.delete(id);
        
        if (error) {
          job.reject(new Error(error));
        } else {
          job.resolve(hash);
        }
        
        this.processNextJob();
      };

      this.worker.onerror = (error) => {
        console.error('Hash worker error:', error);
        this.fallbackToMainThread();
      };
    } catch (error) {
      console.warn('Web Workers no disponibles, usando thread principal');
      this.fallbackToMainThread();
    }
  }

  private async fallbackToMainThread(): Promise<void> {
    for (const [id, job] of this.pendingJobs) {
      try {
        const hash = await this.calculateHashMainThread(job.file, job.algorithm);
        job.resolve(hash);
      } catch (error) {
        job.reject(error instanceof Error ? error : new Error('Error calculando hash'));
      }
    }
    this.pendingJobs.clear();
  }

  private async calculateHashMainThread(file: File, algorithm: 'sha256' | 'sha1'): Promise<string> {
    const buffer = await file.arrayBuffer();
    const algoMap = { sha256: 'SHA-256', sha1: 'SHA-1' } as const;
    const hashBuffer = await crypto.subtle.digest(algoMap[algorithm], buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async calculateHash(file: File, algorithm: 'sha256' | 'sha1' = 'sha256'): Promise<string> {
    return new Promise((resolve, reject) => {
      const id = `hash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const job: HashJob = {
        id,
        file,
        algorithm,
        resolve,
        reject
      };

      this.jobQueue.push(job);
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.isProcessing || this.jobQueue.length === 0) return;
    
    this.isProcessing = true;
    this.initWorker();
    
    if (this.worker) {
      this.processNextJob();
    } else {
      this.fallbackToMainThread();
    }
  }

  private async processNextJob(): Promise<void> {
    const job = this.jobQueue.shift();
    if (!job) {
      this.isProcessing = false;
      return;
    }

    this.pendingJobs.set(job.id, job);

    if (this.worker) {
      try {
        const buffer = await job.file.arrayBuffer();
        this.worker.postMessage({
          id: job.id,
          buffer,
          algorithm: job.algorithm
        });
      } catch (error) {
        job.reject(error instanceof Error ? error : new Error('Error leyendo archivo'));
        this.pendingJobs.delete(job.id);
        this.processNextJob();
      }
    }
  }

  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingJobs.clear();
    this.jobQueue = [];
  }
}

export const hashManager = new HashManager();