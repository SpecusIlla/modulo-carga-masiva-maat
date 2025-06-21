// Sistema de monitoreo de rendimiento en tiempo real
// Módulo de Carga v1.1.0 - Métricas avanzadas

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  category: 'upload' | 'cache' | 'worker' | 'network' | 'memory';
}

interface MetricThreshold {
  warning: number;
  critical: number;
  unit: string;
}

interface PerformanceAlert {
  metric: string;
  level: 'warning' | 'critical';
  value: number;
  threshold: number;
  timestamp: number;
  message: string;
}

export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private thresholds: Map<string, MetricThreshold> = new Map();
  private alerts: PerformanceAlert[] = [];
  private observers: ((metric: PerformanceMetric) => void)[] = [];
  private intervalId?: number;
  private isMonitoring = false;

  constructor() {
    this.setupDefaultThresholds();
    this.initializeSystemMetrics();
  }

  private setupDefaultThresholds(): void {
    this.thresholds.set('uploadSpeed', { warning: 1, critical: 0.5, unit: 'MB/s' });
    this.thresholds.set('cacheHitRate', { warning: 70, critical: 50, unit: '%' });
    this.thresholds.set('memoryUsage', { warning: 80, critical: 95, unit: '%' });
    this.thresholds.set('workerLatency', { warning: 500, critical: 1000, unit: 'ms' });
    this.thresholds.set('networkLatency', { warning: 200, critical: 500, unit: 'ms' });
    this.thresholds.set('errorRate', { warning: 5, critical: 10, unit: '%' });
  }

  private initializeSystemMetrics(): void {
    // Monitorear métricas del navegador si están disponibles
    if ('memory' in performance) {
      this.startMemoryMonitoring();
    }

    // Monitorear Network Information API
    if ('connection' in navigator) {
      this.startNetworkMonitoring();
    }

    // Iniciar monitoreo de Web Vitals
    this.startWebVitalsMonitoring();
  }

  startMonitoring(interval: number = 5000): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.intervalId = window.setInterval(() => {
      this.collectSystemMetrics();
    }, interval);

    console.log('[PERFORMANCE] Monitoring started with interval:', interval);
  }

  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isMonitoring = false;
    console.log('[PERFORMANCE] Monitoring stopped');
  }

  recordMetric(
    name: string,
    value: number,
    category: PerformanceMetric['category'],
    unit: string = ''
  ): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      category
    };

    // Almacenar métrica
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricHistory = this.metrics.get(name)!;
    metricHistory.push(metric);

    // Mantener solo las últimas 100 entradas
    if (metricHistory.length > 100) {
      metricHistory.shift();
    }

    // Verificar thresholds
    this.checkThresholds(metric);

    // Notificar observadores
    this.observers.forEach(observer => observer(metric));
  }

  private checkThresholds(metric: PerformanceMetric): void {
    const threshold = this.thresholds.get(metric.name);
    if (!threshold) return;

    let level: 'warning' | 'critical' | null = null;
    let thresholdValue: number;

    if (metric.value >= threshold.critical) {
      level = 'critical';
      thresholdValue = threshold.critical;
    } else if (metric.value >= threshold.warning) {
      level = 'warning';
      thresholdValue = threshold.warning;
    }

    if (level) {
      const alert: PerformanceAlert = {
        metric: metric.name,
        level,
        value: metric.value,
        threshold: thresholdValue,
        timestamp: metric.timestamp,
        message: `${metric.name} is ${level}: ${metric.value}${metric.unit} (threshold: ${thresholdValue}${metric.unit})`
      };

      this.alerts.push(alert);

      // Mantener solo las últimas 50 alertas
      if (this.alerts.length > 50) {
        this.alerts.shift();
      }

      console.warn('[PERFORMANCE ALERT]', alert.message);
    }
  }

  private collectSystemMetrics(): void {
    // Métricas de memoria
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const memoryUsage = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
      this.recordMetric('memoryUsage', memoryUsage, 'memory', '%');
      this.recordMetric('heapSize', memory.usedJSHeapSize / 1024 / 1024, 'memory', 'MB');
    }

    // Métricas de conexión
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection.downlink) {
        this.recordMetric('connectionSpeed', connection.downlink, 'network', 'Mbps');
      }
      if (connection.rtt) {
        this.recordMetric('networkLatency', connection.rtt, 'network', 'ms');
      }
    }

    // Métricas de rendimiento de navegación
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navigation) {
      this.recordMetric('pageLoadTime', navigation.loadEventEnd - navigation.fetchStart, 'network', 'ms');
      this.recordMetric('domContentLoaded', navigation.domContentLoadedEventEnd - navigation.fetchStart, 'network', 'ms');
    }
  }

  private startMemoryMonitoring(): void {
    // Monitoreo continuo de memoria cada 10 segundos
    setInterval(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        this.recordMetric('memoryPressure', memory.usedJSHeapSize / memory.totalJSHeapSize, 'memory', 'ratio');
      }
    }, 10000);
  }

  private startNetworkMonitoring(): void {
    // Monitorear cambios en la conexión
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      connection.addEventListener('change', () => {
        this.recordMetric('connectionType', connection.effectiveType === '4g' ? 4 : 3, 'network', 'G');
      });
    }
  }

  private startWebVitalsMonitoring(): void {
    // Largest Contentful Paint
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.recordMetric('LCP', entry.startTime, 'network', 'ms');
      }
    }).observe({ entryTypes: ['largest-contentful-paint'] });

    // First Input Delay
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.recordMetric('FID', (entry as any).processingStart - entry.startTime, 'network', 'ms');
      }
    }).observe({ entryTypes: ['first-input'] });

    // Cumulative Layout Shift
    new PerformanceObserver((list) => {
      let cls = 0;
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          cls += (entry as any).value;
        }
      }
      this.recordMetric('CLS', cls, 'network', 'score');
    }).observe({ entryTypes: ['layout-shift'] });
  }

  // Métricas específicas para uploads
  recordUploadMetrics(
    fileSize: number,
    uploadTime: number,
    compressionRatio: number,
    cacheHit: boolean
  ): void {
    const speed = (fileSize / 1024 / 1024) / (uploadTime / 1000); // MB/s
    this.recordMetric('uploadSpeed', speed, 'upload', 'MB/s');
    this.recordMetric('uploadTime', uploadTime, 'upload', 'ms');
    this.recordMetric('compressionRatio', compressionRatio * 100, 'upload', '%');
    this.recordMetric('cacheHit', cacheHit ? 1 : 0, 'cache', 'boolean');
  }

  // Métricas de workers
  recordWorkerMetrics(workerType: string, processingTime: number, memoryUsed: number): void {
    this.recordMetric(`${workerType}Latency`, processingTime, 'worker', 'ms');
    this.recordMetric(`${workerType}Memory`, memoryUsed / 1024 / 1024, 'worker', 'MB');
  }

  // Obtener métricas resumidas
  getSummary(timeRange: number = 300000): { // 5 minutos por defecto
    categories: Record<string, any>;
    alerts: PerformanceAlert[];
    trends: Record<string, 'improving' | 'stable' | 'degrading'>;
  } {
    const cutoff = Date.now() - timeRange;
    const categories: Record<string, any> = {};
    const trends: Record<string, 'improving' | 'stable' | 'degrading'> = {};

    for (const [name, history] of this.metrics.entries()) {
      const recentMetrics = history.filter(m => m.timestamp > cutoff);
      if (recentMetrics.length === 0) continue;

      const category = recentMetrics[0].category;
      if (!categories[category]) {
        categories[category] = {};
      }

      const values = recentMetrics.map(m => m.value);
      const latest = values[values.length - 1];
      const average = values.reduce((a, b) => a + b, 0) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      categories[category][name] = {
        latest,
        average: Number(average.toFixed(2)),
        min,
        max,
        unit: recentMetrics[0].unit,
        samples: recentMetrics.length
      };

      // Calcular tendencia
      if (values.length >= 3) {
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        const change = ((secondAvg - firstAvg) / firstAvg) * 100;

        if (Math.abs(change) < 5) {
          trends[name] = 'stable';
        } else if (
          (name.includes('Speed') || name.includes('HitRate')) && change > 0 ||
          (name.includes('Latency') || name.includes('Usage') || name.includes('Error')) && change < 0
        ) {
          trends[name] = 'improving';
        } else {
          trends[name] = 'degrading';
        }
      } else {
        trends[name] = 'stable';
      }
    }

    return {
      categories,
      alerts: this.alerts.filter(a => a.timestamp > cutoff),
      trends
    };
  }

  // Suscribirse a métricas en tiempo real
  subscribe(observer: (metric: PerformanceMetric) => void): () => void {
    this.observers.push(observer);
    return () => {
      const index = this.observers.indexOf(observer);
      if (index > -1) {
        this.observers.splice(index, 1);
      }
    };
  }

  // Exportar métricas
  exportMetrics(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify({
        metrics: Object.fromEntries(this.metrics),
        alerts: this.alerts,
        summary: this.getSummary()
      }, null, 2);
    }

    // CSV format
    const lines: string[] = ['timestamp,category,name,value,unit'];
    for (const [name, history] of this.metrics.entries()) {
      for (const metric of history) {
        lines.push(`${metric.timestamp},${metric.category},${metric.name},${metric.value},${metric.unit}`);
      }
    }
    return lines.join('\n');
  }

  clearMetrics(): void {
    this.metrics.clear();
    this.alerts = [];
    console.log('[PERFORMANCE] Metrics cleared');
  }
}

// Instancia global del monitor
export const performanceMonitor = new PerformanceMonitor();

// Auto-iniciar monitoreo
if (typeof window !== 'undefined') {
  performanceMonitor.startMonitoring();
}
console.log(`[PERFORMANCE] Monitoring started with interval:`, interval);
    console.debug(`%c[MAAT v1.3.1]%c Performance Monitor Active`, 
      'color: #007bff; font-weight: bold;', 
      'color: #666;'
    );

    // Enviar métricas al backend si está configurado
    if (this.config.sendToBackend && this.config.backendUrl) {