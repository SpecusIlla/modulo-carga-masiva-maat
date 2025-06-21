
/**
 * Gestor de Versiones Dinámico - Sistema MAAT
 * Mantiene la versión sincronizada en todo el sistema
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export class VersionManager {
  private static instance: VersionManager;
  private _version: string;
  private _name: string;
  private _description: string;

  private constructor() {
    this.loadVersionFromPackage();
  }

  static getInstance(): VersionManager {
    if (!VersionManager.instance) {
      VersionManager.instance = new VersionManager();
    }
    return VersionManager.instance;
  }

  private loadVersionFromPackage(): void {
    try {
      const packagePath = join(process.cwd(), 'package.json');
      const packageData = JSON.parse(readFileSync(packagePath, 'utf-8'));
      
      this._version = packageData.version;
      this._name = packageData.name;
      this._description = packageData.description;
      
      console.log(`[VERSION_MANAGER] Cargada versión: ${this._version}`);
    } catch (error) {
      console.error('[VERSION_MANAGER] Error al cargar versión:', error);
      this._version = '1.4.0'; // Fallback
      this._name = '@maat/bulk-upload-module';
      this._description = 'Sistema MAAT - Módulo de Carga Masiva Empresarial';
    }
  }

  get version(): string {
    return this._version;
  }

  get name(): string {
    return this._name;
  }

  get description(): string {
    return this._description;
  }

  get fullName(): string {
    return `MAAT v${this._version}`;
  }

  get systemStatus(): string {
    return `${this.fullName} - Sistema Empresarial Completo`;
  }

  /**
   * Refresca la versión desde package.json
   */
  refresh(): void {
    this.loadVersionFromPackage();
  }

  /**
   * Obtiene información completa del sistema
   */
  getSystemInfo(): {
    version: string;
    fullName: string;
    status: string;
    features: string[];
  } {
    return {
      version: this._version,
      fullName: this.fullName,
      status: this.systemStatus,
      features: [
        'PostgreSQL Database',
        'Service Connector',
        'API REST + Swagger',
        'JWT Authentication',
        'Auto-scaling',
        'Diagnósticos Avanzados'
      ]
    };
  }

  /**
   * Genera logs de consola estilizados para el frontend
   */
  getConsoleVersionLogs(): string[] {
    const info = this.getSystemInfo();
    
    return [
      `%c🟡 ${info.fullName} %ccargado - Sistema Empresarial Completo`,
      'background: #ffc107; color: black; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
      'color: #666; font-weight: normal;'
    ];
  }

  /**
   * Genera logs simples para el servidor
   */
  getServerVersionLogs(): string {
    return `🟡 Demostración ${this.fullName} ejecutándose`;
  }
}

// Exportar instancia singleton
export const versionManager = VersionManager.getInstance();
