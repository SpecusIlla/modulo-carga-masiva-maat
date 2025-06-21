// Dashboard de métricas de rendimiento en tiempo real
// Sistema MAAT v1.3.1 - Monitoreo avanzado

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Cpu, 
  HardDrive, 
  Network, 
  Zap, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Download,
  RefreshCw
} from 'lucide-react';
import { performanceMonitor } from '../utils/performance-monitor';
import { intelligentCache } from '../utils/intelligent-cache';

interface MetricCard {
  title: string;
  value: string;
  unit: string;
  trend: 'improving' | 'stable' | 'degrading';
  icon: React.ComponentType<any>;
  color: string;
}

export function PerformanceDashboard() {
  const [metrics, setMetrics] = useState<any>({});
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<number>();

  const [healthStatus, setHealthStatus] = useState<any>({});
  const [scalingDecisions, setScalingDecisions] = useState<any[]>([]);
  const [predictiveAlerts, setPredictiveAlerts] = useState<any[]>([]);

  useEffect(() => {
    loadMetrics();
    loadHealthStatus();

    if (autoRefresh) {
      intervalRef.current = window.setInterval(() => {
        loadMetrics();
        loadHealthStatus();
      }, 2000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh]);

  const loadHealthStatus = async () => {
    try {
      const response = await fetch('/api/health/status');
      const data = await response.json();
      setHealthStatus(data);

      if (data.predictiveAlerts) {
        setPredictiveAlerts(data.predictiveAlerts);
      }

      if (data.scalingDecisions) {
        setScalingDecisions(data.scalingDecisions.slice(0, 5));
      }
    } catch (error) {
      console.error('Error loading health status:', error);
    }
  };

  const loadMetrics = async () => {
    try {
      const summary = performanceMonitor.getSummary();
      const cacheMetrics = intelligentCache.getMetrics();

      setMetrics({
        ...summary.categories,
        cache: {
          hitRate: { latest: cacheMetrics.hitRate * 100, unit: '%' },
          size: { latest: cacheMetrics.size / 1024 / 1024, unit: 'MB' },
          entries: { latest: cacheMetrics.entries, unit: 'items' }
        }
      });

      setAlerts(summary.alerts);
    } catch (error) {
      console.error('Error loading performance metrics:', error);
    }
  };

  const toggleMonitoring = () => {
    if (isMonitoring) {
      performanceMonitor.stopMonitoring();
    } else {
      performanceMonitor.startMonitoring();
    }
    setIsMonitoring(!isMonitoring);
  };

  const exportMetrics = () => {
    const data = performanceMonitor.exportMetrics('json');
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maat-performance-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearMetrics = () => {
    performanceMonitor.clearMetrics();
    intelligentCache.clear();
    loadMetrics();
  };

  const getMetricCards = (): MetricCard[] => [
    {
      title: 'Velocidad de Carga',
      value: metrics.upload?.uploadSpeed?.latest?.toFixed(1) || '0',
      unit: 'MB/s',
      trend: metrics.upload?.uploadSpeed?.latest > 5 ? 'improving' : 'stable',
      icon: Zap,
      color: 'text-green-500'
    },
    {
      title: 'Uso de Memoria',
      value: metrics.memory?.memoryUsage?.latest?.toFixed(1) || '0',
      unit: '%',
      trend: metrics.memory?.memoryUsage?.latest < 70 ? 'improving' : 'degrading',
      icon: Cpu,
      color: 'text-blue-500'
    },
    {
      title: 'Cache Hit Rate',
      value: metrics.cache?.hitRate?.latest?.toFixed(1) || '0',
      unit: '%',
      trend: metrics.cache?.hitRate?.latest > 80 ? 'improving' : 'stable',
      icon: HardDrive,
      color: 'text-purple-500'
    },
    {
      title: 'Latencia de Red',
      value: metrics.network?.networkLatency?.latest?.toFixed(0) || '0',
      unit: 'ms',
      trend: metrics.network?.networkLatency?.latest < 100 ? 'improving' : 'degrading',
      icon: Network,
      color: 'text-orange-500'
    }
  ];

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'degrading': return <TrendingDown className="w-4 h-4 text-red-500" />;
      default: return <Minus className="w-4 h-4 text-gray-500" />;
    }
  };

  const getAlertLevel = (level: string) => {
    switch (level) {
      case 'critical': return 'destructive';
      case 'warning': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6" />
          <h2 className="text-2xl font-bold">Dashboard de Rendimiento</h2>
          <Badge variant={isMonitoring ? 'default' : 'secondary'}>
            {isMonitoring ? 'Activo' : 'Pausado'}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-1 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs sm:text-sm px-2 sm:px-3"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={toggleMonitoring}
          >
            {isMonitoring ? 'Pausar' : 'Reanudar'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={exportMetrics}
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={clearMetrics}
          >
            Limpiar
          </Button>
        </div>
      </div>

      {/* Metric Cards - Responsive optimizado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
        {getMetricCards().map((metric, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{metric.title}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">
                      {metric.value}
                    </span>
                    <span className="text-sm text-gray-500">{metric.unit}</span>
                    {getTrendIcon(metric.trend)}
                  </div>
                </div>
                <metric.icon className={`w-8 h-8 ${metric.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Health Status - Mobile First */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className={`w-5 h-5 ${
                healthStatus.status === 'healthy' ? 'text-green-500' :
                healthStatus.status === 'warning' ? 'text-orange-500' : 'text-red-500'
              }`} />
              Estado del Sistema
              <Badge variant={
                healthStatus.status === 'healthy' ? 'default' :
                healthStatus.status === 'warning' ? 'secondary' : 'destructive'
              }>
                {healthStatus.status || 'Unknown'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {healthStatus.recommendations && healthStatus.recommendations.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Recomendaciones:</h4>
                {healthStatus.recommendations.map((rec: string, index: number) => (
                  <div key={index} className="text-sm text-gray-600 bg-blue-50 p-2 rounded">
                    {rec}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Predictive Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Alertas Predictivas ({predictiveAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {predictiveAlerts.length > 0 ? (
              <div className="space-y-3">
                {predictiveAlerts.slice(0, 3).map((alert: any, index: number) => (
                  <div key={index} className="p-3 border border-blue-200 rounded-lg bg-blue-50">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-sm">{alert.metric}</span>
                      <Badge variant="outline" className="text-xs">
                        {Math.round(alert.confidence * 100)}% confianza
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-600 mb-1">
                      Actual: {alert.currentValue.toFixed(1)} → Proyectado: {alert.predictedValue.toFixed(1)}
                    </div>
                    <div className="text-xs text-orange-600">
                      En {Math.round(alert.timeToThreshold)} min: {alert.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500">No hay alertas predictivas</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Scaling Decisions */}
      {scalingDecisions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-purple-500" />
              Decisiones de Escalamiento Recientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scalingDecisions.map((decision: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant={decision.action === 'scale_up' ? 'default' : 'secondary'}>
                      {decision.action}
                    </Badge>
                    <span className="text-sm">{decision.reason}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {decision.currentInstances} → {decision.targetInstances} instancias
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Regular Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Alertas Activas ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.slice(0, 5).map((alert, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant={getAlertLevel(alert.level) as any}>
                      {alert.level}
                    </Badge>
                    <span className="text-sm">{alert.message}</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Metrics */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="upload">Carga</TabsTrigger>
          <TabsTrigger value="cache">Caché</TabsTrigger>
          <TabsTrigger value="memory">Memoria</TabsTrigger>
          <TabsTrigger value="network">Red</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* System Health */}
            <Card>
              <CardHeader>
                <CardTitle>Estado del Sistema</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Rendimiento General</span>
                    <span>92%</span>
                  </div>
                  <Progress value={92} className="h-2" />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Optimización</span>
                    <span>87%</span>
                  </div>
                  <Progress value={87} className="h-2" />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Estabilidad</span>
                    <span>95%</span>
                  </div>
                  <Progress value={95} className="h-2" />
                </div>
              </CardContent>
            </Card>

            {/* Cache Statistics */}
            <Card>
              <CardHeader>
                <CardTitle>Estadísticas de Caché</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span>Entradas:</span>
                  <span className="font-mono">
                    {metrics.cache?.entries?.latest || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Tamaño:</span>
                  <span className="font-mono">
                    {(metrics.cache?.size?.latest || 0).toFixed(1)} MB
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Hit Rate:</span>
                  <span className="font-mono">
                    {(metrics.cache?.hitRate?.latest || 0).toFixed(1)}%
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Métricas de Carga</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-sm text-gray-600">Velocidad Promedio</span>
                  <div className="text-2xl font-bold">
                    {(metrics.upload?.uploadSpeed?.average || 0).toFixed(1)} MB/s
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-sm text-gray-600">Tiempo Promedio</span>
                  <div className="text-2xl font-bold">
                    {(metrics.upload?.uploadTime?.average || 0).toFixed(0)} ms
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cache" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Análisis de Caché</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {(metrics.cache?.hitRate?.latest || 0).toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-600">Hit Rate</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {metrics.cache?.entries?.latest || 0}
                    </div>
                    <div className="text-sm text-gray-600">Entradas</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {(metrics.cache?.size?.latest || 0).toFixed(1)} MB
                    </div>
                    <div className="text-sm text-gray-600">Tamaño</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="memory" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Uso de Memoria</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Heap Utilizado</span>
                    <span>{(metrics.memory?.heapSize?.latest || 0).toFixed(1)} MB</span>
                  </div>
                  <Progress 
                    value={metrics.memory?.memoryUsage?.latest || 0} 
                    className="h-3"
                  />
                </div>

                <div className="text-sm text-gray-600">
                  Presión de memoria: {(metrics.memory?.memoryPressure?.latest * 100 || 0).toFixed(1)}%
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="network" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rendimiento de Red</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-sm text-gray-600">Latencia</span>
                  <div className="text-2xl font-bold">
                    {(metrics.network?.networkLatency?.latest || 0).toFixed(0)} ms
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-sm text-gray-600">Velocidad de Conexión</span>
                  <div className="text-2xl font-bold">
                    {(metrics.network?.connectionSpeed?.latest || 0).toFixed(1)} Mbps
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}