
#!/usr/bin/env node

// Script de diagnóstico del escáner de virus MAAT v1.1.0
// 🔍 Verificación del estado del sistema de seguridad

const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class ScannerDiagnostics {
  constructor() {
    this.results = {
      clamav: { status: 'unknown', details: [] },
      signatures: { status: 'unknown', details: [] },
      quarantine: { status: 'unknown', details: [] },
      permissions: { status: 'unknown', details: [] },
      performance: { status: 'unknown', details: [] },
      overall: 'unknown'
    };
  }

  async runDiagnostics() {
    console.log('🔍 MAAT - Diagnóstico del Escáner de Virus v1.1.0');
    console.log('=' * 50);
    console.log('');

    await this.checkClamAV();
    await this.checkSignatures();
    await this.checkQuarantine();
    await this.checkPermissions();
    await this.checkPerformance();
    
    this.calculateOverallStatus();
    this.printResults();
  }

  async checkClamAV() {
    console.log('📡 Verificando ClamAV...');
    
    try {
      // Verificar si ClamAV está instalado
      const { stdout: version } = await this.execAsync('clamscan --version');
      this.results.clamav.details.push(`✅ ClamAV instalado: ${version.trim()}`);
      
      // Verificar estado del daemon
      try {
        await this.execAsync('systemctl is-active clamav-daemon');
        this.results.clamav.details.push('✅ Daemon ClamAV activo');
      } catch (error) {
        this.results.clamav.details.push('⚠️ Daemon ClamAV no activo');
      }
      
      // Verificar freshclam
      try {
        await this.execAsync('systemctl is-active clamav-freshclam');
        this.results.clamav.details.push('✅ FreshClam activo');
      } catch (error) {
        this.results.clamav.details.push('⚠️ FreshClam no activo');
      }
      
      // Test de funcionamiento
      await fs.writeFile('/tmp/eicar_test.txt', 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
      try {
        const { stdout: scanResult } = await this.execAsync('clamscan /tmp/eicar_test.txt');
        if (scanResult.includes('FOUND')) {
          this.results.clamav.details.push('✅ Test de detección exitoso');
          this.results.clamav.status = 'good';
        } else {
          this.results.clamav.details.push('❌ Test de detección falló');
          this.results.clamav.status = 'warning';
        }
      } catch (error) {
        this.results.clamav.details.push('✅ Test de detección exitoso (virus detectado)');
        this.results.clamav.status = 'good';
      }
      
      await fs.unlink('/tmp/eicar_test.txt').catch(() => {});
      
    } catch (error) {
      this.results.clamav.details.push('❌ ClamAV no está instalado');
      this.results.clamav.details.push('💡 Ejecuta: bash scripts/install-clamav.sh');
      this.results.clamav.status = 'error';
    }
  }

  async checkSignatures() {
    console.log('🛡️ Verificando firmas de virus...');
    
    try {
      // Verificar directorio de firmas ClamAV
      const clamavDbPath = '/var/lib/clamav';
      try {
        const files = await fs.readdir(clamavDbPath);
        const dbFiles = files.filter(f => f.endsWith('.cvd') || f.endsWith('.cld'));
        this.results.signatures.details.push(`✅ ${dbFiles.length} archivos de firmas ClamAV encontrados`);
        
        // Verificar antigüedad de las firmas
        for (const file of dbFiles.slice(0, 3)) {
          const filePath = path.join(clamavDbPath, file);
          const stats = await fs.stat(filePath);
          const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
          
          if (ageHours < 24) {
            this.results.signatures.details.push(`✅ ${file}: Actualizado (${ageHours.toFixed(1)}h)`);
          } else if (ageHours < 168) {
            this.results.signatures.details.push(`⚠️ ${file}: ${ageHours.toFixed(1)}h (recomendado actualizar)`);
          } else {
            this.results.signatures.details.push(`❌ ${file}: ${ageHours.toFixed(1)}h (desactualizado)`);
          }
        }
      } catch (error) {
        this.results.signatures.details.push('❌ No se pudo acceder al directorio de firmas ClamAV');
      }
      
      // Verificar firmas personalizadas MAAT
      const customSigPath = path.join(process.cwd(), 'signatures', 'custom-signatures.json');
      try {
        const customSigs = await fs.readFile(customSigPath, 'utf8');
        const parsed = JSON.parse(customSigs);
        this.results.signatures.details.push(`✅ ${parsed.length} firmas personalizadas MAAT cargadas`);
      } catch (error) {
        this.results.signatures.details.push('ℹ️ Sin firmas personalizadas (usando firmas integradas)');
      }
      
      this.results.signatures.status = 'good';
      
    } catch (error) {
      this.results.signatures.details.push('❌ Error verificando firmas');
      this.results.signatures.status = 'error';
    }
  }

  async checkQuarantine() {
    console.log('🔒 Verificando sistema de cuarentena...');
    
    try {
      const quarantineDir = path.join(process.cwd(), 'quarantine');
      const reportsDir = path.join(quarantineDir, 'reports');
      
      // Verificar directorios
      try {
        await fs.access(quarantineDir);
        this.results.quarantine.details.push('✅ Directorio de cuarentena existe');
      } catch (error) {
        await fs.mkdir(quarantineDir, { recursive: true });
        this.results.quarantine.details.push('✅ Directorio de cuarentena creado');
      }
      
      try {
        await fs.access(reportsDir);
        this.results.quarantine.details.push('✅ Directorio de reportes existe');
      } catch (error) {
        await fs.mkdir(reportsDir, { recursive: true });
        this.results.quarantine.details.push('✅ Directorio de reportes creado');
      }
      
      // Contar archivos en cuarentena
      try {
        const quarantineFiles = await fs.readdir(quarantineDir);
        const reportFiles = await fs.readdir(reportsDir);
        
        const actualFiles = quarantineFiles.filter(f => !f.includes('reports'));
        
        this.results.quarantine.details.push(`📊 ${actualFiles.length} archivos en cuarentena`);
        this.results.quarantine.details.push(`📋 ${reportFiles.length} reportes de amenazas`);
        
        if (actualFiles.length > 100) {
          this.results.quarantine.details.push('⚠️ Muchos archivos en cuarentena - considerar limpieza');
        }
        
      } catch (error) {
        this.results.quarantine.details.push('❌ Error leyendo directorios de cuarentena');
      }
      
      this.results.quarantine.status = 'good';
      
    } catch (error) {
      this.results.quarantine.details.push('❌ Error en sistema de cuarentena');
      this.results.quarantine.status = 'error';
    }
  }

  async checkPermissions() {
    console.log('🔐 Verificando permisos...');
    
    try {
      // Verificar permisos de escritura en cuarentena
      const quarantineDir = path.join(process.cwd(), 'quarantine');
      const testFile = path.join(quarantineDir, 'test_permissions.tmp');
      
      try {
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        this.results.permissions.details.push('✅ Permisos de escritura en cuarentena');
      } catch (error) {
        this.results.permissions.details.push('❌ Sin permisos de escritura en cuarentena');
      }
      
      // Verificar permisos para logs
      const logDir = '/var/log/clamav';
      try {
        await fs.access(logDir, fs.constants.R_OK);
        this.results.permissions.details.push('✅ Permisos de lectura en logs ClamAV');
      } catch (error) {
        this.results.permissions.details.push('⚠️ Sin acceso a logs ClamAV');
      }
      
      // Verificar usuario actual
      const user = process.env.USER || process.env.USERNAME || 'unknown';
      this.results.permissions.details.push(`ℹ️ Usuario actual: ${user}`);
      
      this.results.permissions.status = 'good';
      
    } catch (error) {
      this.results.permissions.details.push('❌ Error verificando permisos');
      this.results.permissions.status = 'error';
    }
  }

  async checkPerformance() {
    console.log('⚡ Verificando rendimiento...');
    
    try {
      // Test de velocidad de hash
      const testData = Buffer.alloc(1024 * 1024, 'test'); // 1MB
      const startTime = Date.now();
      
      const crypto = require('crypto');
      crypto.createHash('sha256').update(testData).digest('hex');
      
      const hashTime = Date.now() - startTime;
      this.results.performance.details.push(`⚡ Hash SHA256 (1MB): ${hashTime}ms`);
      
      if (hashTime < 50) {
        this.results.performance.details.push('✅ Rendimiento de hash excelente');
      } else if (hashTime < 200) {
        this.results.performance.details.push('✅ Rendimiento de hash bueno');
      } else {
        this.results.performance.details.push('⚠️ Rendimiento de hash lento');
      }
      
      // Verificar memoria disponible
      const memInfo = process.memoryUsage();
      this.results.performance.details.push(`📊 Memoria RSS: ${(memInfo.rss / 1024 / 1024).toFixed(1)}MB`);
      this.results.performance.details.push(`📊 Memoria Heap: ${(memInfo.heapUsed / 1024 / 1024).toFixed(1)}MB`);
      
      // Test de I/O
      const ioStart = Date.now();
      const tempFile = '/tmp/maat_io_test.tmp';
      await fs.writeFile(tempFile, testData);
      await fs.readFile(tempFile);
      await fs.unlink(tempFile);
      const ioTime = Date.now() - ioStart;
      
      this.results.performance.details.push(`💾 I/O (1MB): ${ioTime}ms`);
      
      this.results.performance.status = 'good';
      
    } catch (error) {
      this.results.performance.details.push('❌ Error en test de rendimiento');
      this.results.performance.status = 'error';
    }
  }

  calculateOverallStatus() {
    const statuses = Object.values(this.results).map(r => r.status).filter(s => s !== 'unknown');
    
    if (statuses.every(s => s === 'good')) {
      this.results.overall = 'excellent';
    } else if (statuses.includes('error')) {
      this.results.overall = 'needs_attention';
    } else if (statuses.includes('warning')) {
      this.results.overall = 'warning';
    } else {
      this.results.overall = 'good';
    }
  }

  printResults() {
    console.log('');
    console.log('📋 RESUMEN DEL DIAGNÓSTICO');
    console.log('=' * 30);
    
    const sections = [
      { name: 'ClamAV', key: 'clamav', icon: '🦠' },
      { name: 'Firmas', key: 'signatures', icon: '🛡️' },
      { name: 'Cuarentena', key: 'quarantine', icon: '🔒' },
      { name: 'Permisos', key: 'permissions', icon: '🔐' },
      { name: 'Rendimiento', key: 'performance', icon: '⚡' }
    ];

    sections.forEach(section => {
      const result = this.results[section.key];
      const status = this.getStatusIcon(result.status);
      
      console.log(`\n${section.icon} ${section.name}: ${status}`);
      result.details.forEach(detail => {
        console.log(`   ${detail}`);
      });
    });

    console.log('\n🎯 ESTADO GENERAL:', this.getOverallStatusMessage());
    
    if (this.results.overall === 'needs_attention') {
      console.log('\n🔧 ACCIONES RECOMENDADAS:');
      console.log('   1. Revisar errores marcados con ❌');
      console.log('   2. Ejecutar: bash scripts/install-clamav.sh');
      console.log('   3. Verificar permisos de directorio');
      console.log('   4. Actualizar firmas: sudo freshclam');
    }
    
    console.log('\n✨ Diagnóstico completado!');
  }

  getStatusIcon(status) {
    const icons = {
      good: '✅ BUENO',
      warning: '⚠️ ADVERTENCIA',
      error: '❌ ERROR',
      unknown: '❓ DESCONOCIDO'
    };
    return icons[status] || icons.unknown;
  }

  getOverallStatusMessage() {
    const messages = {
      excellent: '🌟 EXCELENTE - Sistema completamente operativo',
      good: '✅ BUENO - Sistema funcionando correctamente',
      warning: '⚠️ ADVERTENCIA - Algunas mejoras recomendadas',
      needs_attention: '❌ REQUIERE ATENCIÓN - Problemas críticos detectados'
    };
    return messages[this.results.overall] || 'Estado desconocido';
  }

  async execAsync(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }
}

// Ejecutar diagnóstico
if (require.main === module) {
  const diagnostics = new ScannerDiagnostics();
  diagnostics.runDiagnostics().catch(console.error);
}

module.exports = ScannerDiagnostics;
