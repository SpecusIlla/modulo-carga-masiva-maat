
// Sistema de Monitoreo Proactivo - MAAT v1.2.1
// Detecta problemas antes de que afecten a usuarios

interface HealthMetrics {
  timestamp: number;
  cpu: { usage: number; trend: 'stable' | 'increasing' | 'decreasing' };
  memory: { usage: number; available: number; pressure: number };
  network: { latency: number; throughput: number; errors: number };
  uploads: { active: number; queued: number; failed: number };
  storage: { used: number; available: number; iops: number };
  cache: { hitRate: number; size: number; pressure: number };
}

interface AlertRule {
  metric: string;
  condition: 'greater_than' | 'less_than' | 'trend_up' | 'trend_down';
  threshold: number;
  severity: 'warning' | 'critical';
  cooldown: number; // milliseconds
  actions: Array<'log' | 'notify' | 'scale' | 'throttle'>;
}

interface PredictiveAlert {
  metric: string;
  currentValue: number;
  predictedValue: number;
  timeToThreshold: number; // minutes
  confidence: number; // 0-1
  recommendation: string;
}

export class HealthCheckManager {
  private metrics: HealthMetrics[] = [];
  private alertRules: AlertRule[] = [];
  private lastAlerts: Map<string, number> = new Map();
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;

  constructor() {
    this.setupDefaultAlertRules();
    this.startMonitoring();
  }

  private setupDefaultAlertRules(): void {
    this.alertRules = [
      // Críticos - Requieren acción inmediata
      { metric: 'memory.usage', condition: 'greater_than', threshold: 85, severity: 'critical', cooldown: 60000, actions: ['log', 'notify', 'throttle'] },
      { metric: 'cpu.usage', condition: 'greater_than', threshold: 90, severity: 'critical', cooldown: 30000, actions: ['log', 'notify', 'scale'] },
      { metric: 'uploads.failed', condition: 'greater_than', threshold: 10, severity: 'critical', cooldown: 120000, actions: ['log', 'notify'] },
      
      // Advertencias - Monitoreo preventivo
      { metric: 'memory.usage', condition: 'greater_than', threshold: 70, severity: 'warning', cooldown: 300000, actions: ['log'] },
      { metric: 'cache.hitRate', condition: 'less_than', threshold: 60, severity: 'warning', cooldown: 600000, actions: ['log', 'notify'] },
      { metric: 'network.latency', condition: 'greater_than', threshold: 500, severity: 'warning', cooldown: 180000, actions: ['log'] },
      
      // Tendencias - Alertas predictivas
      { metric: 'memory.usage', condition: 'trend_up', threshold: 5, severity: 'warning', cooldown: 600000, actions: ['log', 'notify'] },
      { metric: 'uploads.active', condition: 'trend_up', threshold: 15, severity: 'warning', cooldown: 300000, actions: ['log', 'scale'] }
    ];
  }

  async collectMetrics(): Promise<HealthMetrics> {
    const now = Date.now();
    
    // Obtener métricas del sistema
    const cpuUsage = await this.getCPUUsage();
    const memoryStats = await this.getMemoryStats();
    const networkStats = await this.getNetworkStats();
    const uploadStats = await this.getUploadStats();
    const storageStats = await this.getStorageStats();
    const cacheStats = await this.getCacheStats();

    const metrics: HealthMetrics = {
      timestamp: now,
      cpu: {
        usage: cpuUsage,
        trend: this.calculateTrend('cpu.usage', cpuUsage)
      },
      memory: {
        usage: memoryStats.usage,
        available: memoryStats.available,
        pressure: memoryStats.pressure
      },
      network: {
        latency: networkStats.latency,
        throughput: networkStats.throughput,
        errors: networkStats.errors
      },
      uploads: {
        active: uploadStats.active,
        queued: uploadStats.queued,
        failed: uploadStats.failed
      },
      storage: {
        used: storageStats.used,
        available: storageStats.available,
        iops: storageStats.iops
      },
      cache: {
        hitRate: cacheStats.hitRate,
        size: cacheStats.size,
        pressure: cacheStats.pressure
      }
    };

    // Almacenar métricas (mantener últimas 1000)
    this.metrics.push(metrics);
    if (this.metrics.length > 1000) {
      this.metrics.shift();
    }

    return metrics;
  }

  private calculateTrend(metric: string, currentValue: number): 'stable' | 'increasing' | 'decreasing' {
    const recentMetrics = this.metrics.slice(-10); // Últimos 10 puntos
    if (recentMetrics.length < 5) return 'stable';

    const values = recentMetrics.map(m => this.getNestedValue(m, metric));
    const slope = this.calculateLinearRegression(values);

    if (Math.abs(slope) < 0.5) return 'stable';
    return slope > 0 ? 'increasing' : 'decreasing';
  }

  private calculateLinearRegression(values: number[]): number {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  async checkAlerts(metrics: HealthMetrics): Promise<void> {
    const alerts = [];

    for (const rule of this.alertRules) {
      const lastAlert = this.lastAlerts.get(rule.metric) || 0;
      if (Date.now() - lastAlert < rule.cooldown) continue;

      const currentValue = this.getNestedValue(metrics, rule.metric);
      let shouldAlert = false;

      switch (rule.condition) {
        case 'greater_than':
          shouldAlert = currentValue > rule.threshold;
          break;
        case 'less_than':
          shouldAlert = currentValue < rule.threshold;
          break;
        case 'trend_up':
        case 'trend_down':
          const trend = this.calculateTrend(rule.metric, currentValue);
          shouldAlert = (rule.condition === 'trend_up' && trend === 'increasing') ||
                       (rule.condition === 'trend_down' && trend === 'decreasing');
          break;
      }

      if (shouldAlert) {
        await this.executeAlertActions(rule, currentValue, metrics);
        this.lastAlerts.set(rule.metric, Date.now());
      }
    }
  }

  private async executeAlertActions(rule: AlertRule, value: number, metrics: HealthMetrics): Promise<void> {
    const alertMessage = `[${rule.severity.toUpperCase()}] ${rule.metric} = ${value} (threshold: ${rule.threshold})`;

    for (const action of rule.actions) {
      switch (action) {
        case 'log':
          console.warn(`[HEALTH-CHECK] ${alertMessage}`);
          break;
          
        case 'notify':
          await this.sendNotification(rule, value, metrics);
          break;
          
        case 'scale':
          await this.triggerAutoScale(rule, metrics);
          break;
          
        case 'throttle':
          await this.applyThrottling(rule, metrics);
          break;
      }
    }
  }

  // Análisis predictivo
  generatePredictiveAlerts(): PredictiveAlert[] {
    if (this.metrics.length < 20) return [];

    const alerts: PredictiveAlert[] = [];
    const criticalMetrics = ['memory.usage', 'cpu.usage', 'storage.used'];

    for (const metric of criticalMetrics) {
      const prediction = this.predictMetricValue(metric, 30); // 30 minutos adelante
      if (prediction) {
        alerts.push(prediction);
      }
    }

    return alerts;
  }

  private predictMetricValue(metric: string, minutesAhead: number): PredictiveAlert | null {
    const recentValues = this.metrics.slice(-30).map(m => this.getNestedValue(m, metric));
    if (recentValues.length < 10) return null;

    // Regresión lineal simple para predicción
    const slope = this.calculateLinearRegression(recentValues);
    const currentValue = recentValues[recentValues.length - 1];
    const predictedValue = currentValue + (slope * minutesAhead);

    // Determinar umbrales críticos
    const criticalThresholds: Record<string, number> = {
      'memory.usage': 90,
      'cpu.usage': 95,
      'storage.used': 85
    };

    const threshold = criticalThresholds[metric];
    if (!threshold || predictedValue < threshold) return null;

    const timeToThreshold = Math.max(0, (threshold - currentValue) / slope);
    const confidence = Math.min(0.9, Math.max(0.1, 1 - Math.abs(slope) * 0.1));

    return {
      metric,
      currentValue,
      predictedValue,
      timeToThreshold,
      confidence,
      recommendation: this.getRecommendation(metric, predictedValue, timeToThreshold)
    };
  }

  private getRecommendation(metric: string, predictedValue: number, timeToThreshold: number): string {
    const recommendations: Record<string, string> = {
      'memory.usage': `Considerar limpieza de cache o reducir uploads concurrentes en ${Math.round(timeToThreshold)} minutos`,
      'cpu.usage': `Preparar escalamiento horizontal o reducir carga de procesamiento en ${Math.round(timeToThreshold)} minutos`,
      'storage.used': `Programar limpieza de archivos temporales en ${Math.round(timeToThreshold)} minutos`
    };
    
    return recommendations[metric] || 'Monitorear de cerca';
  }

  // Métodos auxiliares para obtener métricas del sistema
  private async getCPUUsage(): Promise<number> {
    // Simulación - en producción usar librerías como 'os-utils' o APIs del sistema
    return Math.random() * 100;
  }

  private async getMemoryStats() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const mem = process.memoryUsage();
      return {
        usage: (mem.heapUsed / mem.heapTotal) * 100,
        available: (mem.heapTotal - mem.heapUsed) / 1024 / 1024,
        pressure: mem.heapUsed / mem.heapTotal
      };
    }
    return { usage: 50, available: 1000, pressure: 0.5 };
  }

  private async getNetworkStats() {
    return {
      latency: Math.random() * 200,
      throughput: Math.random() * 1000,
      errors: Math.random() * 5
    };
  }

  private async getUploadStats() {
    return {
      active: Math.floor(Math.random() * 50),
      queued: Math.floor(Math.random() * 20),
      failed: Math.floor(Math.random() * 5)
    };
  }

  private async getStorageStats() {
    return {
      used: Math.random() * 100,
      available: 1000 - (Math.random() * 1000),
      iops: Math.random() * 1000
    };
  }

  private async getCacheStats() {
    return {
      hitRate: 60 + Math.random() * 40,
      size: Math.random() * 500,
      pressure: Math.random()
    };
  }

  private getNestedValue(obj: any, path: string): number {
    return path.split('.').reduce((o, p) => o?.[p] ?? 0, obj);
  }

  private async sendNotification(rule: AlertRule, value: number, metrics: HealthMetrics) {
    // Implementar notificaciones (email, Slack, webhook, etc.)
    console.log(`[NOTIFICATION] ${rule.severity}: ${rule.metric} = ${value}`);
  }

  private async triggerAutoScale(rule: AlertRule, metrics: HealthMetrics) {
    console.log(`[AUTO-SCALE] Triggered by ${rule.metric} - Current metrics:`, {
      cpu: metrics.cpu.usage,
      memory: metrics.memory.usage,
      uploads: metrics.uploads.active
    });
  }

  private async applyThrottling(rule: AlertRule, metrics: HealthMetrics) {
    console.log(`[THROTTLING] Applied due to ${rule.metric} - Reducing concurrent uploads`);
  }

  startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics();
        await this.checkAlerts(metrics);
        
        // Generar alertas predictivas cada 5 minutos
        if (this.metrics.length % 10 === 0) {
          const predictiveAlerts = this.generatePredictiveAlerts();
          if (predictiveAlerts.length > 0) {
            console.log('[PREDICTIVE-ALERTS]', predictiveAlerts);
          }
        }
      } catch (error) {
        console.error('[HEALTH-CHECK] Error during monitoring:', error);
      }
    }, intervalMs);

    console.log('[HEALTH-CHECK] Monitoring started');
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isMonitoring = false;
    console.log('[HEALTH-CHECK] Monitoring stopped');
  }

  getHealthReport(): {
    status: 'healthy' | 'warning' | 'critical';
    metrics: HealthMetrics | null;
    alerts: PredictiveAlert[];
    recommendations: string[];
  } {
    const latestMetrics = this.metrics[this.metrics.length - 1] || null;
    const predictiveAlerts = this.generatePredictiveAlerts();
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    const recommendations: string[] = [];

    if (latestMetrics) {
      if (latestMetrics.memory.usage > 85 || latestMetrics.cpu.usage > 90) {
        status = 'critical';
        recommendations.push('Sistema bajo alta carga - considerar escalamiento inmediato');
      } else if (latestMetrics.memory.usage > 70 || latestMetrics.cpu.usage > 70) {
        status = 'warning';
        recommendations.push('Monitoreando de cerca - preparar escalamiento preventivo');
      }
    }

    if (predictiveAlerts.length > 0) {
      status = status === 'healthy' ? 'warning' : status;
      recommendations.push(...predictiveAlerts.map(a => a.recommendation));
    }

    return {
      status,
      metrics: latestMetrics,
      alerts: predictiveAlerts,
      recommendations
    };
  }
}

export const healthCheckManager = new HealthCheckManager();
