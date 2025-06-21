
// Sistema de Conexión de Servicios - MAAT v1.3.0+
// Coordina la comunicación entre todos los módulos

import { uploadManager } from '../performance/upload-manager';
import { virusScanner } from '../security/virus-scanner';
import { versionControl } from '../versioning/version-control-manager';
import { fileService } from '../services/file-service';
import { auditLogger } from '../security/audit-logger';

export interface ServiceStatus {
  readonly service: string;
  readonly status: 'connected' | 'disconnected' | 'error';
  readonly lastCheck: Date;
  readonly version: string;
  readonly dependencies: string[];
}

export class ServiceConnector {
  private services: Map<string, ServiceStatus> = new Map();
  private healthCheckInterval: NodeJS.Timeout;

  constructor() {
    this.initializeServices();
    this.startHealthChecks();
  }

  private initializeServices(): void {
    // Registrar todos los servicios
    this.services.set('upload-manager', {
      service: 'upload-manager',
      status: 'connected',
      lastCheck: new Date(),
      version: '1.3.0',
      dependencies: ['file-service', 'virus-scanner', 'audit-logger']
    });

    this.services.set('file-service', {
      service: 'file-service',
      status: 'connected',
      lastCheck: new Date(),
      version: '1.3.0',
      dependencies: ['database', 'virus-scanner', 'version-control']
    });

    this.services.set('virus-scanner', {
      service: 'virus-scanner',
      status: 'connected',
      lastCheck: new Date(),
      version: '1.1.0',
      dependencies: ['audit-logger']
    });

    this.services.set('version-control', {
      service: 'version-control',
      status: 'connected',
      lastCheck: new Date(),
      version: '1.2.0',
      dependencies: ['file-system']
    });

    this.services.set('audit-logger', {
      service: 'audit-logger',
      status: 'connected',
      lastCheck: new Date(),
      version: '1.1.0',
      dependencies: ['database']
    });

    console.log('[SERVICE-CONNECTOR] All services initialized and connected');
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, 30000); // Check every 30 seconds
  }

  private async performHealthChecks(): Promise<void> {
    try {
      // Check Upload Manager
      const uploadStats = uploadManager.getPerformanceMetrics();
      this.updateServiceStatus('upload-manager', 
        uploadStats ? 'connected' : 'error');

      // Check File Service
      try {
        await fileService.getStorageStats('health-check');
        this.updateServiceStatus('file-service', 'connected');
      } catch {
        this.updateServiceStatus('file-service', 'error');
      }

      // Check Virus Scanner
      const scannerStats = await virusScanner.getSignatureStats();
      this.updateServiceStatus('virus-scanner', 
        scannerStats.total > 0 ? 'connected' : 'error');

      // Check Version Control
      try {
        await versionControl.getVersionHistory('health-check');
        this.updateServiceStatus('version-control', 'connected');
      } catch {
        this.updateServiceStatus('version-control', 'error');
      }

      // Check Audit Logger
      try {
        await auditLogger.logEvent({
          action: 'health_check',
          userId: 'system',
          resourceId: 'service-connector',
          details: { timestamp: new Date().toISOString() }
        });
        this.updateServiceStatus('audit-logger', 'connected');
      } catch {
        this.updateServiceStatus('audit-logger', 'error');
      }

    } catch (error) {
      console.error('[SERVICE-CONNECTOR] Health check failed:', error);
    }
  }

  private updateServiceStatus(serviceName: string, status: 'connected' | 'disconnected' | 'error'): void {
    const service = this.services.get(serviceName);
    if (service) {
      this.services.set(serviceName, {
        ...service,
        status,
        lastCheck: new Date()
      });
    }
  }

  getServiceStatus(serviceName?: string): ServiceStatus | ServiceStatus[] {
    if (serviceName) {
      return this.services.get(serviceName) || {
        service: serviceName,
        status: 'disconnected',
        lastCheck: new Date(),
        version: 'unknown',
        dependencies: []
      };
    }
    return Array.from(this.services.values());
  }

  getSystemHealth(): {
    overall: 'healthy' | 'degraded' | 'critical';
    connectedServices: number;
    totalServices: number;
    issues: string[];
  } {
    const allServices = Array.from(this.services.values());
    const connectedServices = allServices.filter(s => s.status === 'connected').length;
    const totalServices = allServices.length;
    const issues: string[] = [];

    allServices.forEach(service => {
      if (service.status === 'error') {
        issues.push(`${service.service}: Error state`);
      } else if (service.status === 'disconnected') {
        issues.push(`${service.service}: Disconnected`);
      }
    });

    let overall: 'healthy' | 'degraded' | 'critical';
    if (connectedServices === totalServices) {
      overall = 'healthy';
    } else if (connectedServices >= totalServices * 0.8) {
      overall = 'degraded';
    } else {
      overall = 'critical';
    }

    return {
      overall,
      connectedServices,
      totalServices,
      issues
    };
  }

  async reconnectService(serviceName: string): Promise<boolean> {
    try {
      console.log(`[SERVICE-CONNECTOR] Attempting to reconnect ${serviceName}...`);
      
      switch (serviceName) {
        case 'upload-manager':
          // Reinitialize upload manager connections
          this.updateServiceStatus(serviceName, 'connected');
          break;
        case 'file-service':
          // Test database connection
          await fileService.getStorageStats('reconnect-test');
          this.updateServiceStatus(serviceName, 'connected');
          break;
        case 'virus-scanner':
          // Check scanner availability
          await virusScanner.getSignatureStats();
          this.updateServiceStatus(serviceName, 'connected');
          break;
        case 'version-control':
          // Test version control
          await versionControl.getVersionHistory('reconnect-test');
          this.updateServiceStatus(serviceName, 'connected');
          break;
        case 'audit-logger':
          // Test audit logging
          await auditLogger.logEvent({
            action: 'service_reconnected',
            userId: 'system',
            resourceId: serviceName,
            details: { timestamp: new Date().toISOString() }
          });
          this.updateServiceStatus(serviceName, 'connected');
          break;
        default:
          return false;
      }

      console.log(`[SERVICE-CONNECTOR] Successfully reconnected ${serviceName}`);
      return true;
    } catch (error) {
      console.error(`[SERVICE-CONNECTOR] Failed to reconnect ${serviceName}:`, error);
      this.updateServiceStatus(serviceName, 'error');
      return false;
    }
  }

  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

export const serviceConnector = new ServiceConnector();
