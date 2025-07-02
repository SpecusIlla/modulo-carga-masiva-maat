
// MAAT v1.0.8 - Sistema de Monitoreo Integrado
// Monitoreo específico para módulos DB y validación Zod

import { z } from 'zod';
import { documentsModule } from '../modules/db/documents';
import { projectsModule } from '../modules/db/projects';
import { categoriesModule } from '../modules/db/categories';
import { ClassificationHealthSchema } from '../contracts/zod/classification';

interface ModuleHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  lastCheck: Date;
  errorCount: number;
  details: Record<string, any>;
}

interface SystemHealthReport {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  modules: ModuleHealth[];
  database: {
    connections: number;
    queries: {
      total: number;
      successful: number;
      failed: number;
      averageTime: number;
    };
    tables: {
      documents: { count: number; health: string };
      projects: { count: number; health: string };
      categories: { count: number; health: string };
    };
  };
  validation: {
    schemasLoaded: number;
    validationsPerformed: number;
    validationErrors: number;
    averageValidationTime: number;
  };
  performance: {
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
    requestsPerMinute: number;
  };
  timestamp: Date;
}

export class SystemHealthMonitor {
  private healthHistory: SystemHealthReport[] = [];
  private monitoringInterval?: NodeJS.Timeout;
  private isRunning = false;

  constructor() {
    this.startMonitoring();
  }

  async checkModuleHealth(moduleName: string, moduleRef: any): Promise<ModuleHealth> {
    const startTime = Date.now();
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let errorCount = 0;
    const details: Record<string, any> = {};

    try {
      switch (moduleName) {
        case 'documents':
          const docStats = await this.checkDocumentsModule(moduleRef);
          details.documentsCount = docStats.count;
          details.recentActivity = docStats.recentActivity;
          if (docStats.errors > 0) {
            errorCount = docStats.errors;
            status = docStats.errors > 5 ? 'unhealthy' : 'degraded';
          }
          break;

        case 'projects':
          const projectStats = await this.checkProjectsModule(moduleRef);
          details.projectsCount = projectStats.count;
          details.activeProjects = projectStats.active;
          if (projectStats.errors > 0) {
            errorCount = projectStats.errors;
            status = projectStats.errors > 2 ? 'unhealthy' : 'degraded';
          }
          break;

        case 'categories':
          const categoryStats = await this.checkCategoriesModule(moduleRef);
          details.categoriesCount = categoryStats.count;
          details.distribution = categoryStats.distribution;
          if (categoryStats.errors > 0) {
            errorCount = categoryStats.errors;
            status = categoryStats.errors > 3 ? 'unhealthy' : 'degraded';
          }
          break;
      }
    } catch (error) {
      status = 'unhealthy';
      errorCount = 1;
      details.error = error instanceof Error ? error.message : 'Unknown error';
    }

    const responseTime = Date.now() - startTime;
    
    // Considerar respuesta lenta como degraded
    if (responseTime > 1000 && status === 'healthy') {
      status = 'degraded';
    }

    return {
      name: moduleName,
      status,
      responseTime,
      lastCheck: new Date(),
      errorCount,
      details
    };
  }

  private async checkDocumentsModule(module: any) {
    try {
      // Simulación de verificación - en producción hacer queries reales
      const count = await this.getTableCount('documents');
      const recentActivity = await this.getRecentActivity('documents');
      return {
        count,
        recentActivity,
        errors: 0
      };
    } catch (error) {
      return { count: 0, recentActivity: 0, errors: 1 };
    }
  }

  private async checkProjectsModule(module: any) {
    try {
      const count = await this.getTableCount('projects');
      const active = await this.getActiveCount('projects');
      return {
        count,
        active,
        errors: 0
      };
    } catch (error) {
      return { count: 0, active: 0, errors: 1 };
    }
  }

  private async checkCategoriesModule(module: any) {
    try {
      const count = await this.getTableCount('categories');
      const distribution = await this.getCategoryDistribution();
      return {
        count,
        distribution,
        errors: 0
      };
    } catch (error) {
      return { count: 0, distribution: {}, errors: 1 };
    }
  }

  async generateHealthReport(): Promise<SystemHealthReport> {
    const modules: ModuleHealth[] = [];

    // Verificar módulos DB
    modules.push(await this.checkModuleHealth('documents', documentsModule));
    modules.push(await this.checkModuleHealth('projects', projectsModule));
    modules.push(await this.checkModuleHealth('categories', categoriesModule));

    // Estado general basado en módulos
    const unhealthyModules = modules.filter(m => m.status === 'unhealthy').length;
    const degradedModules = modules.filter(m => m.status === 'degraded').length;
    
    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (unhealthyModules > 0) {
      overall = 'unhealthy';
    } else if (degradedModules > 1) {
      overall = 'degraded';
    }

    // Métricas de base de datos
    const dbMetrics = await this.getDatabaseMetrics();
    
    // Métricas de validación
    const validationMetrics = await this.getValidationMetrics();
    
    // Métricas de performance
    const performanceMetrics = await this.getPerformanceMetrics();

    const report: SystemHealthReport = {
      overall,
      modules,
      database: dbMetrics,
      validation: validationMetrics,
      performance: performanceMetrics,
      timestamp: new Date()
    };

    // Almacenar en historial (mantener últimos 100 reportes)
    this.healthHistory.push(report);
    if (this.healthHistory.length > 100) {
      this.healthHistory.shift();
    }

    return report;
  }

  private async getDatabaseMetrics() {
    try {
      return {
        connections: await this.getActiveConnections(),
        queries: {
          total: await this.getQueryCount('total'),
          successful: await this.getQueryCount('successful'),
          failed: await this.getQueryCount('failed'),
          averageTime: await this.getAverageQueryTime()
        },
        tables: {
          documents: { 
            count: await this.getTableCount('documents'), 
            health: await this.getTableHealth('documents') 
          },
          projects: { 
            count: await this.getTableCount('projects'), 
            health: await this.getTableHealth('projects') 
          },
          categories: { 
            count: await this.getTableCount('categories'), 
            health: await this.getTableHealth('categories') 
          }
        }
      };
    } catch (error) {
      return {
        connections: 0,
        queries: { total: 0, successful: 0, failed: 1, averageTime: 0 },
        tables: {
          documents: { count: 0, health: 'error' },
          projects: { count: 0, health: 'error' },
          categories: { count: 0, health: 'error' }
        }
      };
    }
  }

  private async getValidationMetrics() {
    return {
      schemasLoaded: this.getLoadedSchemasCount(),
      validationsPerformed: await this.getValidationCount(),
      validationErrors: await this.getValidationErrorCount(),
      averageValidationTime: await this.getAverageValidationTime()
    };
  }

  private async getPerformanceMetrics() {
    const memUsage = process.memoryUsage();
    return {
      uptime: process.uptime(),
      memoryUsage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      cpuUsage: await this.getCPUUsage(),
      requestsPerMinute: await this.getRequestsPerMinute()
    };
  }

  // Métodos auxiliares de métricas (simulados para v1.0.8)
  private async getTableCount(table: string): Promise<number> {
    // En producción: hacer query real a la base de datos
    const mockCounts = { documents: 918, projects: 1, categories: 6 };
    return mockCounts[table as keyof typeof mockCounts] || 0;
  }

  private async getRecentActivity(table: string): Promise<number> {
    return Math.floor(Math.random() * 50);
  }

  private async getActiveCount(table: string): Promise<number> {
    return table === 'projects' ? 1 : 0;
  }

  private async getCategoryDistribution(): Promise<Record<string, number>> {
    return {
      'Documentos Técnicos': 245,
      'Contratos': 189,
      'Reportes': 156,
      'Facturas': 134,
      'Correspondencia': 98,
      'Otros': 96
    };
  }

  private async getActiveConnections(): Promise<number> {
    return Math.floor(Math.random() * 10) + 1;
  }

  private async getQueryCount(type: string): Promise<number> {
    const mockCounts = { total: 1250, successful: 1245, failed: 5 };
    return mockCounts[type as keyof typeof mockCounts] || 0;
  }

  private async getAverageQueryTime(): Promise<number> {
    return Math.random() * 100 + 50; // 50-150ms
  }

  private async getTableHealth(table: string): Promise<string> {
    return Math.random() > 0.9 ? 'warning' : 'healthy';
  }

  private getLoadedSchemasCount(): number {
    // Contar esquemas Zod cargados
    return 8; // Classification + Validation schemas
  }

  private async getValidationCount(): Promise<number> {
    return Math.floor(Math.random() * 500) + 100;
  }

  private async getValidationErrorCount(): Promise<number> {
    return Math.floor(Math.random() * 10);
  }

  private async getAverageValidationTime(): Promise<number> {
    return Math.random() * 10 + 2; // 2-12ms
  }

  private async getCPUUsage(): Promise<number> {
    return Math.random() * 30 + 10; // 10-40%
  }

  private async getRequestsPerMinute(): Promise<number> {
    return Math.floor(Math.random() * 100) + 20;
  }

  startMonitoring(intervalMs: number = 60000): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.generateHealthReport();
      } catch (error) {
        console.error('[SYSTEM-HEALTH] Error generating health report:', error);
      }
    }, intervalMs);

    console.log('[SYSTEM-HEALTH] Monitoring started for MAAT v1.0.8');
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isRunning = false;
    console.log('[SYSTEM-HEALTH] Monitoring stopped');
  }

  getHealthHistory(): SystemHealthReport[] {
    return [...this.healthHistory];
  }

  getLatestHealth(): SystemHealthReport | null {
    return this.healthHistory[this.healthHistory.length - 1] || null;
  }

  // Validar reporte con esquema Zod
  validateHealthReport(report: any): boolean {
    try {
      // Usar esquema existente de classification para validar estructura
      const healthSchema = z.object({
        overall: z.enum(['healthy', 'degraded', 'unhealthy']),
        modules: z.array(z.object({
          name: z.string(),
          status: z.enum(['healthy', 'degraded', 'unhealthy']),
          responseTime: z.number().positive(),
          lastCheck: z.date(),
          errorCount: z.number().nonnegative(),
          details: z.record(z.any())
        })),
        timestamp: z.date()
      });

      healthSchema.parse(report);
      return true;
    } catch {
      return false;
    }
  }
}

// Instancia singleton para el monitoreo del sistema
export const systemHealthMonitor = new SystemHealthMonitor();

// Tipos exportados para uso en otros módulos
export type { SystemHealthReport, ModuleHealth };
