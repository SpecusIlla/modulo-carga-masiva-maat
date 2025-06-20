
// Sistema de Auto-Escalamiento Gradual - MAAT v1.2.1
// Escala recursos de forma inteligente y gradual

interface ScalingConfiguration {
  minInstances: number;
  maxInstances: number;
  targetCPU: number;
  targetMemory: number;
  scaleUpCooldown: number;
  scaleDownCooldown: number;
  enablePredictiveScaling: boolean;
}

interface ScalingDecision {
  action: 'scale_up' | 'scale_down' | 'maintain';
  currentInstances: number;
  targetInstances: number;
  reason: string;
  confidence: number;
  estimatedCost: number;
}

interface LoadPhase {
  name: string;
  cpuThreshold: number;
  memoryThreshold: number;
  concurrentUploads: number;
  chunkSize: number;
  cacheStrategy: 'aggressive' | 'normal' | 'conservative';
  actions: string[];
}

export class AutoScaler {
  private config: ScalingConfiguration;
  private currentInstances = 1;
  private lastScaleAction = 0;
  private loadHistory: Array<{ timestamp: number; cpu: number; memory: number; uploads: number }> = [];
  
  private loadPhases: LoadPhase[] = [
    {
      name: 'Low Load',
      cpuThreshold: 30,
      memoryThreshold: 40,
      concurrentUploads: 5,
      chunkSize: 1024 * 1024, // 1MB
      cacheStrategy: 'normal',
      actions: ['optimize_cache', 'cleanup_temp_files']
    },
    {
      name: 'Medium Load',
      cpuThreshold: 60,
      memoryThreshold: 65,
      concurrentUploads: 15,
      chunkSize: 512 * 1024, // 512KB
      cacheStrategy: 'aggressive',
      actions: ['increase_workers', 'compress_responses']
    },
    {
      name: 'High Load',
      cpuThreshold: 80,
      memoryThreshold: 80,
      concurrentUploads: 25,
      chunkSize: 256 * 1024, // 256KB
      cacheStrategy: 'aggressive',
      actions: ['scale_horizontally', 'reduce_chunk_size', 'enable_streaming']
    },
    {
      name: 'Critical Load',
      cpuThreshold: 95,
      memoryThreshold: 95,
      concurrentUploads: 50,
      chunkSize: 128 * 1024, // 128KB
      cacheStrategy: 'conservative',
      actions: ['emergency_scale', 'throttle_uploads', 'priority_processing']
    }
  ];

  constructor(config: Partial<ScalingConfiguration> = {}) {
    this.config = {
      minInstances: 1,
      maxInstances: 10,
      targetCPU: 70,
      targetMemory: 70,
      scaleUpCooldown: 300000, // 5 minutos
      scaleDownCooldown: 600000, // 10 minutos
      enablePredictiveScaling: true,
      ...config
    };
  }

  async evaluateScaling(metrics: {
    cpu: number;
    memory: number;
    activeUploads: number;
    queuedUploads: number;
    networkLatency: number;
  }): Promise<ScalingDecision> {
    
    // Registrar métricas históricas
    this.loadHistory.push({
      timestamp: Date.now(),
      cpu: metrics.cpu,
      memory: metrics.memory,
      uploads: metrics.activeUploads
    });

    // Mantener solo las últimas 100 entradas
    if (this.loadHistory.length > 100) {
      this.loadHistory.shift();
    }

    // Determinar fase de carga actual
    const currentPhase = this.determineLoadPhase(metrics);
    
    // Calcular decisión de escalamiento
    const decision = await this.calculateScalingDecision(metrics, currentPhase);
    
    // Aplicar optimizaciones de la fase actual
    await this.applyPhaseOptimizations(currentPhase);
    
    return decision;
  }

  private determineLoadPhase(metrics: any): LoadPhase {
    // Determinar fase basada en CPU, memoria y uploads
    const combinedLoad = (metrics.cpu + metrics.memory + (metrics.activeUploads / 50 * 100)) / 3;
    
    for (let i = this.loadPhases.length - 1; i >= 0; i--) {
      const phase = this.loadPhases[i];
      if (combinedLoad >= phase.cpuThreshold) {
        return phase;
      }
    }
    
    return this.loadPhases[0]; // Low Load por defecto
  }

  private async calculateScalingDecision(metrics: any, phase: LoadPhase): Promise<ScalingDecision> {
    const now = Date.now();
    let action: 'scale_up' | 'scale_down' | 'maintain' = 'maintain';
    let targetInstances = this.currentInstances;
    let reason = 'Métricas dentro de rangos normales';
    let confidence = 0.5;

    // Evaluar necesidad de escalar hacia arriba
    if (metrics.cpu > this.config.targetCPU || metrics.memory > this.config.targetMemory) {
      if (now - this.lastScaleAction > this.config.scaleUpCooldown) {
        action = 'scale_up';
        targetInstances = Math.min(this.currentInstances + this.calculateScaleUpAmount(metrics), this.config.maxInstances);
        reason = `CPU: ${metrics.cpu}% o Memory: ${metrics.memory}% exceden umbrales`;
        confidence = this.calculateConfidence(metrics, 'up');
      }
    }
    
    // Evaluar necesidad de escalar hacia abajo
    else if (metrics.cpu < this.config.targetCPU * 0.5 && metrics.memory < this.config.targetMemory * 0.5) {
      if (now - this.lastScaleAction > this.config.scaleDownCooldown && this.currentInstances > this.config.minInstances) {
        action = 'scale_down';
        targetInstances = Math.max(this.currentInstances - 1, this.config.minInstances);
        reason = `Recursos subutilizados: CPU ${metrics.cpu}%, Memory ${metrics.memory}%`;
        confidence = this.calculateConfidence(metrics, 'down');
      }
    }

    // Escalamiento predictivo
    if (this.config.enablePredictiveScaling) {
      const predictiveDecision = this.evaluatePredictiveScaling(metrics);
      if (predictiveDecision && predictiveDecision.confidence > confidence) {
        action = predictiveDecision.action;
        targetInstances = predictiveDecision.targetInstances;
        reason = `Predictivo: ${predictiveDecision.reason}`;
        confidence = predictiveDecision.confidence;
      }
    }

    return {
      action,
      currentInstances: this.currentInstances,
      targetInstances,
      reason,
      confidence,
      estimatedCost: this.calculateCostEstimate(targetInstances)
    };
  }

  private calculateScaleUpAmount(metrics: any): number {
    // Escalamiento más agresivo para cargas críticas
    if (metrics.cpu > 90 || metrics.memory > 90) {
      return Math.min(3, this.config.maxInstances - this.currentInstances);
    } else if (metrics.cpu > 80 || metrics.memory > 80) {
      return 2;
    }
    return 1;
  }

  private calculateConfidence(metrics: any, direction: 'up' | 'down'): number {
    // Calcular confianza basada en consistencia de métricas
    if (this.loadHistory.length < 5) return 0.3;

    const recentMetrics = this.loadHistory.slice(-10);
    const avgCpu = recentMetrics.reduce((sum, m) => sum + m.cpu, 0) / recentMetrics.length;
    const avgMemory = recentMetrics.reduce((sum, m) => sum + m.memory, 0) / recentMetrics.length;

    // Variabilidad (menor variabilidad = mayor confianza)
    const cpuVariance = recentMetrics.reduce((sum, m) => sum + Math.pow(m.cpu - avgCpu, 2), 0) / recentMetrics.length;
    const memoryVariance = recentMetrics.reduce((sum, m) => sum + Math.pow(m.memory - avgMemory, 2), 0) / recentMetrics.length;
    
    const stability = 1 - Math.min(1, (cpuVariance + memoryVariance) / 2000);
    
    // Magnitud del cambio necesario
    const magnitude = direction === 'up' 
      ? Math.max(metrics.cpu - this.config.targetCPU, metrics.memory - this.config.targetMemory) / 100
      : Math.max(this.config.targetCPU - metrics.cpu, this.config.targetMemory - metrics.memory) / 100;

    return Math.min(0.95, Math.max(0.1, stability * 0.7 + magnitude * 0.3));
  }

  private evaluatePredictiveScaling(metrics: any): { action: 'scale_up' | 'scale_down'; targetInstances: number; reason: string; confidence: number } | null {
    if (this.loadHistory.length < 20) return null;

    // Predecir carga futura basada en tendencias
    const recentCpu = this.loadHistory.slice(-10).map(m => m.cpu);
    const recentMemory = this.loadHistory.slice(-10).map(m => m.memory);
    
    const cpuTrend = this.calculateTrend(recentCpu);
    const memoryTrend = this.calculateTrend(recentMemory);
    
    // Si la tendencia indica que alcanzaremos umbrales críticos en 5-10 minutos
    const projectedCpu = metrics.cpu + (cpuTrend * 10); // 10 minutos adelante
    const projectedMemory = metrics.memory + (memoryTrend * 10);
    
    if (projectedCpu > 85 || projectedMemory > 85) {
      return {
        action: 'scale_up',
        targetInstances: this.currentInstances + 1,
        reason: `Tendencia indica sobrecarga en 10min (CPU: ${projectedCpu.toFixed(1)}%, Mem: ${projectedMemory.toFixed(1)}%)`,
        confidence: 0.8
      };
    }
    
    if (projectedCpu < 30 && projectedMemory < 30 && this.currentInstances > this.config.minInstances) {
      return {
        action: 'scale_down',
        targetInstances: this.currentInstances - 1,
        reason: `Tendencia indica baja utilización sostenida`,
        confidence: 0.6
      };
    }

    return null;
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 3) return 0;
    
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  private calculateCostEstimate(instances: number): number {
    // Estimación simple de costo por instancia por hora
    const costPerInstancePerHour = 0.05; // $0.05/hora
    return instances * costPerInstancePerHour;
  }

  private async applyPhaseOptimizations(phase: LoadPhase): Promise<void> {
    console.log(`[AUTO-SCALER] Aplicando optimizaciones para fase: ${phase.name}`);
    
    for (const action of phase.actions) {
      switch (action) {
        case 'optimize_cache':
          await this.optimizeCache();
          break;
        case 'cleanup_temp_files':
          await this.cleanupTempFiles();
          break;
        case 'increase_workers':
          await this.adjustWorkerCount(phase.concurrentUploads);
          break;
        case 'compress_responses':
          await this.enableCompression();
          break;
        case 'reduce_chunk_size':
          await this.adjustChunkSize(phase.chunkSize);
          break;
        case 'enable_streaming':
          await this.enableStreaming();
          break;
        case 'throttle_uploads':
          await this.applyUploadThrottling();
          break;
      }
    }
  }

  // Métodos de optimización
  private async optimizeCache(): Promise<void> {
    console.log('[AUTO-SCALER] Optimizando cache...');
  }

  private async cleanupTempFiles(): Promise<void> {
    console.log('[AUTO-SCALER] Limpiando archivos temporales...');
  }

  private async adjustWorkerCount(targetCount: number): Promise<void> {
    console.log(`[AUTO-SCALER] Ajustando workers a ${targetCount}...`);
  }

  private async enableCompression(): Promise<void> {
    console.log('[AUTO-SCALER] Habilitando compresión de respuestas...');
  }

  private async adjustChunkSize(newSize: number): Promise<void> {
    console.log(`[AUTO-SCALER] Ajustando chunk size a ${newSize} bytes...`);
  }

  private async enableStreaming(): Promise<void> {
    console.log('[AUTO-SCALER] Habilitando streaming optimizado...');
  }

  private async applyUploadThrottling(): Promise<void> {
    console.log('[AUTO-SCALER] Aplicando throttling de uploads...');
  }

  async executeScaling(decision: ScalingDecision): Promise<boolean> {
    if (decision.action === 'maintain') {
      return true;
    }

    console.log(`[AUTO-SCALER] Ejecutando ${decision.action}: ${decision.currentInstances} → ${decision.targetInstances}`);
    console.log(`[AUTO-SCALER] Razón: ${decision.reason} (Confianza: ${(decision.confidence * 100).toFixed(1)}%)`);

    // Aquí integrarías con el sistema de orquestación (Kubernetes, Docker Swarm, etc.)
    this.currentInstances = decision.targetInstances;
    this.lastScaleAction = Date.now();
    
    return true;
  }

  getCurrentConfiguration(): ScalingConfiguration & { currentInstances: number; currentPhase: string } {
    return {
      ...this.config,
      currentInstances: this.currentInstances,
      currentPhase: this.loadPhases[0].name // Simplificado para el ejemplo
    };
  }
}

export const autoScaler = new AutoScaler();
