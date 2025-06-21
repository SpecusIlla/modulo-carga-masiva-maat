
/**
 * Monitor de Rendimiento en Tiempo Real - MAAT v1.4.0
 * Monitoreo continuo con alertas automáticas
 */

import { EventEmitter } from 'events';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface SystemMetrics {
  timestamp: number;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    free: number;
    total: number;
    heapUsed: number;
    heapTotal: number;
    heapLimit: number;
  };
  network: {
    latency: number;
    throughput: number;
    connections: number;
  };
  uploads: {
    active: number;
    queued: number;
    completed: number;
    failed: number;
    averageSpeed: number;
  };
  cache: {
    hitRate: number;
    size: number;
    entries: number;
  };
}

interface PerformanceAlert {
  id: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'critical';
  metric: string;
  value: number;
  threshold: number;
  message: string;
  resolved?: boolean;
  resolvedAt?: number;
}

interface Threshold {
  metric: string;
  warning: number;
  critical: number;
  unit: string;
  operator: 'greater_than' | 'less_than';
}

export class RealTimePerformanceMonitor extends EventEmitter {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private metrics: SystemMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private thresholds: Threshold[] = [];
  private lastAlertCheck = 0;

  constructor(private interval: number = 5000) {
    super();
    this.setupDefaultThresholds();
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const dirs = ['test-results/monitoring', 'test-results/alerts'];
    dirs.forEach(dir => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });
  }

  private setupDefaultThresholds(): void {
    this.thresholds = [
      // CPU Thresholds
      { metric: 'cpu.usage', warning: 70, critical: 90, unit: '%', operator: 'greater_than' },
      { metric: 'cpu.loadAverage', warning: 2, critical: 4, unit: '', operator: 'greater_than' },

      // Memory Thresholds
      { metric: 'memory.used', warning: 80, critical: 95, unit: '%', operator: 'greater_than' },
      { metric: 'memory.heapUsed', warning: 70, critical: 90, unit: '%', operator: 'greater_than' },

      // Network Thresholds
      { metric: 'network.latency', warning: 200, critical: 500, unit: 'ms', operator: 'greater_than' },
      { metric: 'network.throughput', warning: 1, critical: 0.5, unit: 'MB/s', operator: 'less_than' },

      // Upload Thresholds
      { metric: 'uploads.averageSpeed', warning: 1, critical: 0.5, unit: 'MB/s', operator: 'less_than' },
      { metric: 'uploads.failed', warning: 5, critical: 10, unit: 'count', operator: 'greater_than' },

      // Cache Thresholds
      { metric: 'cache.hitRate', warning: 70, critical: 50, unit: '%', operator: 'less_than' }
    ];
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('🔄 Monitor ya está ejecutándose');
      return;
    }

    this.isRunning = true;
    console.log(`🚀 Iniciando monitor de rendimiento (intervalo: ${this.interval}ms)`);

    // Primera medición inmediata
    await this.collectMetrics();

    // Configurar intervalo de monitoreo
    this.intervalId = setInterval(async () => {
      try {
        await this.collectMetrics();
        this.checkAlerts();
        this.cleanupOldData();
      } catch (error) {
        console.error('❌ Error en ciclo de monitoreo:', error);
        this.emit('error', error);
      }
    }, this.interval);

    this.emit('started');
    console.log('✅ Monitor de rendimiento iniciado');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    // Generar reporte final antes de parar
    await this.generateSnapshot();

    this.emit('stopped');
    console.log('🛑 Monitor de rendimiento detenido');
  }

  private async collectMetrics(): Promise<void> {
    const metrics: SystemMetrics = {
      timestamp: Date.now(),
      cpu: await this.getCPUMetrics(),
      memory: await this.getMemoryMetrics(),
      network: await this.getNetworkMetrics(),
      uploads: await this.getUploadMetrics(),
      cache: await this.getCacheMetrics()
    };

    this.metrics.push(metrics);

    // Mantener solo las últimas 1000 mediciones
    if (this.metrics.length > 1000) {
      this.metrics.shift();
    }

    this.emit('metrics', metrics);

    // Log cada 10 mediciones (para no saturar la consola)
    if (this.metrics.length % 10 === 0) {
      this.logMetricsSummary(metrics);
    }
  }

  private async getCPUMetrics(): Promise<SystemMetrics['cpu']> {
    const os = require('os');
    
    // Simular uso de CPU (en producción usar librerías como pidusage)
    const usage = this.simulateCPUUsage();
    const loadAverage = os.loadavg();

    return {
      usage,
      loadAverage
    };
  }

  private async getMemoryMetrics(): Promise<SystemMetrics['memory']> {
    const os = require('os');
    const process_memory = process.memoryUsage();
    
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    return {
      used: (usedMemory / totalMemory) * 100,
      free: freeMemory,
      total: totalMemory,
      heapUsed: process_memory.heapUsed,
      heapTotal: process_memory.heapTotal,
      heapLimit: process_memory.rss // RSS como límite aproximado
    };
  }

  private async getNetworkMetrics(): Promise<SystemMetrics['network']> {
    // En producción, obtener métricas reales de red
    return {
      latency: this.simulateNetworkLatency(),
      throughput: this.simulateThroughput(),
      connections: this.simulateConnections()
    };
  }

  private async getUploadMetrics(): Promise<SystemMetrics['uploads']> {
    // En producción, obtener de uploadManager real
    return {
      active: Math.floor(Math.random() * 20),
      queued: Math.floor(Math.random() * 10),
      completed: Math.floor(Math.random() * 100),
      failed: Math.floor(Math.random() * 5),
      averageSpeed: 2 + Math.random() * 8 // 2-10 MB/s
    };
  }

  private async getCacheMetrics(): Promise<SystemMetrics['cache']> {
    // En producción, obtener de sistema de caché real
    return {
      hitRate: 60 + Math.random() * 40, // 60-100%
      size: Math.floor(Math.random() * 500), // MB
      entries: Math.floor(Math.random() * 1000)
    };
  }

  // Métodos de simulación (reemplazar con datos reales en producción)
  private simulateCPUUsage(): number {
    const baseUsage = 20;
    const variation = Math.sin(Date.now() / 10000) * 30 + Math.random() * 20;
    return Math.max(0, Math.min(100, baseUsage + variation));
  }

  private simulateNetworkLatency(): number {
    const baseLatency = 50;
    const variation = Math.random() * 100;
    return baseLatency + variation;
  }

  private simulateThroughput(): number {
    const baseThroughput = 5;
    const variation = Math.random() * 3;
    return baseThroughput + variation;
  }

  private simulateConnections(): number {
    return Math.floor(Math.random() * 50) + 10;
  }

  private checkAlerts(): void {
    if (this.metrics.length === 0) return;

    const currentMetrics = this.metrics[this.metrics.length - 1];
    const now = Date.now();

    // Solo verificar alertas cada 30 segundos para evitar spam
    if (now - this.lastAlertCheck < 30000) return;
    this.lastAlertCheck = now;

    for (const threshold of this.thresholds) {
      const value = this.getNestedValue(currentMetrics, threshold.metric);
      if (value === undefined) continue;

      const isWarning = this.checkThreshold(value, threshold.warning, threshold.operator);
      const isCritical = this.checkThreshold(value, threshold.critical, threshold.operator);

      if (isCritical) {
        this.createAlert('critical', threshold, value, currentMetrics.timestamp);
      } else if (isWarning) {
        this.createAlert('warning', threshold, value, currentMetrics.timestamp);
      }
    }
  }

  private checkThreshold(value: number, threshold: number, operator: string): boolean {
    switch (operator) {
      case 'greater_than':
        return value > threshold;
      case 'less_than':
        return value < threshold;
      default:
        return false;
    }
  }

  private createAlert(severity: 'warning' | 'critical', threshold: Threshold, value: number, timestamp: number): void {
    const alertId = `${threshold.metric}-${severity}-${timestamp}`;
    
    // Evitar alertas duplicadas recientes
    const recentAlert = this.alerts.find(a => 
      a.metric === threshold.metric && 
      a.severity === severity && 
      !a.resolved && 
      timestamp - a.timestamp < 300000 // 5 minutos
    );

    if (recentAlert) return;

    const alert: PerformanceAlert = {
      id: alertId,
      timestamp,
      severity,
      metric: threshold.metric,
      value,
      threshold: severity === 'critical' ? threshold.critical : threshold.warning,
      message: `${threshold.metric} is ${severity}: ${value}${threshold.unit} (threshold: ${severity === 'critical' ? threshold.critical : threshold.warning}${threshold.unit})`
    };

    this.alerts.push(alert);
    this.emit('alert', alert);

    const severityIcon = severity === 'critical' ? '🚨' : '⚠️';
    console.log(`${severityIcon} ALERT [${severity.toUpperCase()}]: ${alert.message}`);

    // Mantener solo las últimas 100 alertas
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }
  }

  private getNestedValue(obj: any, path: string): number | undefined {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private cleanupOldData(): void {
    // Limpiar métricas muy antiguas (mantener última hora)
    const oneHourAgo = Date.now() - 3600000;
    this.metrics = this.metrics.filter(m => m.timestamp > oneHourAgo);

    // Marcar alertas antiguas como resueltas
    const thirtyMinutesAgo = Date.now() - 1800000;
    this.alerts.forEach(alert => {
      if (!alert.resolved && alert.timestamp < thirtyMinutesAgo) {
        alert.resolved = true;
        alert.resolvedAt = Date.now();
      }
    });
  }

  private logMetricsSummary(metrics: SystemMetrics): void {
    const summary = [
      `📊 CPU: ${metrics.cpu.usage.toFixed(1)}%`,
      `💾 RAM: ${metrics.memory.used.toFixed(1)}%`,
      `🌐 Red: ${metrics.network.latency.toFixed(0)}ms`,
      `📤 Cargas: ${metrics.uploads.active} activas`,
      `🗄️ Caché: ${metrics.cache.hitRate.toFixed(1)}%`
    ].join(' | ');

    console.log(`[${new Date().toLocaleTimeString()}] ${summary}`);
  }

  // Métodos públicos para obtener información

  getCurrentMetrics(): SystemMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  getMetricsHistory(minutes: number = 60): SystemMetrics[] {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return this.metrics.filter(m => m.timestamp > cutoff);
  }

  getActiveAlerts(): PerformanceAlert[] {
    return this.alerts.filter(a => !a.resolved);
  }

  getAllAlerts(): PerformanceAlert[] {
    return [...this.alerts];
  }

  getHealthStatus(): { status: 'healthy' | 'warning' | 'critical'; issues: string[] } {
    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
    const warningAlerts = activeAlerts.filter(a => a.severity === 'warning');

    if (criticalAlerts.length > 0) {
      return {
        status: 'critical',
        issues: criticalAlerts.map(a => a.message)
      };
    } else if (warningAlerts.length > 0) {
      return {
        status: 'warning',
        issues: warningAlerts.map(a => a.message)
      };
    } else {
      return {
        status: 'healthy',
        issues: []
      };
    }
  }

  async generateSnapshot(): Promise<void> {
    const snapshot = {
      timestamp: Date.now(),
      summary: {
        monitoringDuration: this.metrics.length > 0 ? 
          this.metrics[this.metrics.length - 1].timestamp - this.metrics[0].timestamp : 0,
        totalMetrics: this.metrics.length,
        totalAlerts: this.alerts.length,
        activeAlerts: this.getActiveAlerts().length
      },
      currentMetrics: this.getCurrentMetrics(),
      recentMetrics: this.getMetricsHistory(30), // Últimos 30 minutos
      alerts: this.getAllAlerts(),
      healthStatus: this.getHealthStatus()
    };

    const snapshotPath = join('test-results/monitoring', `snapshot-${Date.now()}.json`);
    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

    console.log(`📸 Snapshot guardado: ${snapshotPath}`);
  }

  // Configuración dinámica
  updateThresholds(newThresholds: Partial<Threshold>[]): void {
    newThresholds.forEach(newThreshold => {
      const index = this.thresholds.findIndex(t => t.metric === newThreshold.metric);
      if (index >= 0) {
        this.thresholds[index] = { ...this.thresholds[index], ...newThreshold };
      } else if (newThreshold.metric) {
        this.thresholds.push(newThreshold as Threshold);
      }
    });

    console.log('🔧 Thresholds actualizados:', newThresholds.length);
  }

  setInterval(newInterval: number): void {
    this.interval = newInterval;
    
    if (this.isRunning) {
      console.log(`🔄 Reiniciando monitor con nuevo intervalo: ${newInterval}ms`);
      this.stop().then(() => this.start());
    }
  }

  // Análisis de tendencias
  getTrend(metric: string, minutes: number = 30): 'increasing' | 'decreasing' | 'stable' {
    const recentMetrics = this.getMetricsHistory(minutes);
    if (recentMetrics.length < 3) return 'stable';

    const values = recentMetrics.map(m => this.getNestedValue(m, metric)).filter(v => v !== undefined);
    if (values.length < 3) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'increasing' : 'decreasing';
  }

  getAverageMetric(metric: string, minutes: number = 30): number {
    const recentMetrics = this.getMetricsHistory(minutes);
    const values = recentMetrics.map(m => this.getNestedValue(m, metric)).filter(v => v !== undefined);
    
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  isRunning(): boolean {
    return this.isRunning;
  }
}

// Instancia singleton para uso global
export const realTimeMonitor = new RealTimePerformanceMonitor();

// Ejemplo de uso
if (require.main === module) {
  const monitor = new RealTimePerformanceMonitor(3000); // 3 segundos

  monitor.on('started', () => {
    console.log('Monitor iniciado');
  });

  monitor.on('metrics', (metrics) => {
    // Procesar métricas si es necesario
  });

  monitor.on('alert', (alert) => {
    console.log(`🔔 Nueva alerta: ${alert.message}`);
  });

  monitor.on('error', (error) => {
    console.error('Error en el monitor:', error);
  });

  // Iniciar monitoreo
  monitor.start();

  // Parar después de 5 minutos para prueba
  setTimeout(() => {
    monitor.stop();
  }, 300000);

  // Manejar señales de sistema
  process.on('SIGINT', () => {
    console.log('\nParando monitor...');
    monitor.stop().then(() => {
      process.exit(0);
    });
  });
}
