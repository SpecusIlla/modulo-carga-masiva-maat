#!/usr/bin/env node

// Script de diagnóstico del escáner de virus MAAT v1.1.0
// 🔍 Verificación del estado del sistema de seguridad

const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

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

  async execAsync(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject({ error, stdout, stderr });
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }

  async runDiagnostics() {
    console.log('🔍 MAAT - Diagnóstico del Escáner de Virus v1.1.0');
    console.log('='.repeat(50));
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
      const customSigPath = path.join(process.cwd(), 'signatures');
      try {
        const customFiles = await fs.readdir(customSigPath);
        this.results.signatures.details.push(`✅ ${customFiles.length} firmas personalizadas MAAT`);
        this.results.signatures.status = 'good';
      } catch (error) {
        this.results.signatures.details.push('⚠️ No hay firmas personalizadas MAAT');
        this.results.signatures.status = 'warning';
      }

    } catch (error) {
      this.results.signatures.details.push('❌ Error verificando firmas');
      this.results.signatures.status = 'error';
    }
  }

  async checkQuarantine() {
    console.log('🔒 Verificando cuarentena...');

    try {
      const quarantinePath = path.join(process.cwd(), 'quarantine');

      try {
        await fs.access(quarantinePath);
        const files = await fs.readdir(quarantinePath);
        this.results.quarantine.details.push(`✅ Directorio de cuarentena: ${files.length} archivos`);

        // Verificar permisos
        const stats = await fs.stat(quarantinePath);
        this.results.quarantine.details.push(`✅ Permisos de cuarentena: ${stats.mode.toString(8)}`);

        this.results.quarantine.status = 'good';
      } catch (error) {
        await fs.mkdir(quarantinePath, { recursive: true });
        this.results.quarantine.details.push('✅ Directorio de cuarentena creado');
        this.results.quarantine.status = 'good';
      }

    } catch (error) {
      this.results.quarantine.details.push('❌ Error configurando cuarentena');
      this.results.quarantine.status = 'error';
    }
  }

  async checkPermissions() {
    console.log('🔐 Verificando permisos...');

    try {
      const testDir = path.join(process.cwd(), 'temp-test');

      // Test de escritura
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(path.join(testDir, 'test.txt'), 'test');
      await fs.unlink(path.join(testDir, 'test.txt'));
      await fs.rmdir(testDir);

      this.results.permissions.details.push('✅ Permisos de escritura OK');

      // Test de ejecución
      try {
        await this.execAsync('echo "test"');
        this.results.permissions.details.push('✅ Permisos de ejecución OK');
      } catch (error) {
        this.results.permissions.details.push('⚠️ Permisos de ejecución limitados');
      }

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

      this.results.performance.details.push(`💾 I/O Test (1MB): ${ioTime}ms`);
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
    } else if (statuses.some(s => s === 'error')) {
      this.results.overall = 'critical';
    } else if (statuses.some(s => s === 'warning')) {
      this.results.overall = 'warning';
    } else {
      this.results.overall = 'good';
    }
  }

  printResults() {
    console.log('\n📋 RESUMEN DE DIAGNÓSTICO');
    console.log('='.repeat(50));

    Object.entries(this.results).forEach(([key, result]) => {
      if (key === 'overall') return;

      const icon = result.status === 'good' ? '✅' : 
                   result.status === 'warning' ? '⚠️' : '❌';

      console.log(`\n${icon} ${key.toUpperCase()}: ${result.status.toUpperCase()}`);
      result.details.forEach(detail => console.log(`  ${detail}`));
    });

    console.log(`\n🎯 ESTADO GENERAL: ${this.results.overall.toUpperCase()}`);
    console.log('\n✨ Diagnóstico completado');
  }
}

// Ejecutar diagnóstico
if (require.main === module) {
  const diagnostics = new ScannerDiagnostics();
  diagnostics.runDiagnostics().catch(console.error);
}

module.exports = ScannerDiagnostics;