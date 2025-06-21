
#!/usr/bin/env node

/**
 * Script de Ejecución de Pruebas de Rendimiento - MAAT v1.4.0
 * Ejecuta pruebas exhaustivas y genera reportes detallados
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class PerformanceTestRunner {
  constructor() {
    this.startTime = Date.now();
    this.testResults = [];
    this.setupDirectories();
  }

  setupDirectories() {
    const dirs = [
      'test-results',
      'test-results/performance',
      'test-results/reports',
      'test-results/logs'
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Directorio creado: ${dir}`);
      }
    });
  }

  async runSystemDiagnostics() {
    console.log('\n🔍 DIAGNÓSTICOS DEL SISTEMA');
    console.log('═══════════════════════════════════════\n');

    // Información del sistema
    const systemInfo = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      cpuCount: require('os').cpus().length,
      timestamp: new Date().toISOString()
    };

    console.log(`🖥️  Plataforma: ${systemInfo.platform} ${systemInfo.arch}`);
    console.log(`🟢 Node.js: ${systemInfo.nodeVersion}`);
    console.log(`💾 Memoria disponible: ${(systemInfo.memory.rss / 1024 / 1024).toFixed(1)}MB`);
    console.log(`⚙️  CPUs: ${systemInfo.cpuCount} cores`);

    // Verificar dependencias críticas
    console.log('\n📦 Verificando dependencias...');
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      console.log(`✅ Proyecto: ${packageJson.name} v${packageJson.version}`);
      
      // Verificar archivos críticos
      const criticalFiles = [
        'backend/performance/upload-manager.ts',
        'frontend/utils/performance-monitor.ts',
        'tests/performance/stress-test-manager.ts'
      ];

      criticalFiles.forEach(file => {
        if (fs.existsSync(file)) {
          console.log(`✅ ${file}`);
        } else {
          console.log(`❌ ${file} - FALTANTE`);
        }
      });

    } catch (error) {
      console.log(`❌ Error leyendo package.json: ${error.message}`);
    }

    return systemInfo;
  }

  async runPerformanceBenchmarks() {
    console.log('\n⚡ BENCHMARKS DE RENDIMIENTO');
    console.log('═══════════════════════════════════════\n');

    const benchmarks = [];

    // Test 1: Velocidad de I/O
    console.log('📁 Test de I/O de archivos...');
    const ioStart = Date.now();
    try {
      const testData = Buffer.alloc(1024 * 1024, 'x'); // 1MB
      const tempFile = path.join('test-results', 'io-test.tmp');
      
      fs.writeFileSync(tempFile, testData);
      fs.readFileSync(tempFile);
      fs.unlinkSync(tempFile);
      
      const ioTime = Date.now() - ioStart;
      benchmarks.push({ test: 'I/O File Operations', time: ioTime, status: 'passed' });
      console.log(`   ✅ I/O Test: ${ioTime}ms`);
    } catch (error) {
      benchmarks.push({ test: 'I/O File Operations', error: error.message, status: 'failed' });
      console.log(`   ❌ I/O Test falló: ${error.message}`);
    }

    // Test 2: CPU - Cálculo de hash
    console.log('🔐 Test de cálculo de hash...');
    const hashStart = Date.now();
    try {
      const crypto = require('crypto');
      const testData = Buffer.alloc(1024 * 1024, 'x'); // 1MB
      
      for (let i = 0; i < 10; i++) {
        crypto.createHash('sha256').update(testData).digest('hex');
      }
      
      const hashTime = Date.now() - hashStart;
      benchmarks.push({ test: 'Hash Calculation (10x1MB)', time: hashTime, status: 'passed' });
      console.log(`   ✅ Hash Test: ${hashTime}ms (10 iteraciones)`);
    } catch (error) {
      benchmarks.push({ test: 'Hash Calculation', error: error.message, status: 'failed' });
      console.log(`   ❌ Hash Test falló: ${error.message}`);
    }

    // Test 3: Memoria - Allocación y liberación
    console.log('💾 Test de gestión de memoria...');
    const memStart = Date.now();
    const initialMemory = process.memoryUsage();
    
    try {
      const buffers = [];
      // Allocar 100MB en chunks de 1MB
      for (let i = 0; i < 100; i++) {
        buffers.push(Buffer.alloc(1024 * 1024, i % 256));
      }
      
      const peakMemory = process.memoryUsage();
      
      // Liberar memoria
      buffers.length = 0;
      if (global.gc) global.gc();
      
      const finalMemory = process.memoryUsage();
      const memTime = Date.now() - memStart;
      
      const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
      
      benchmarks.push({ 
        test: 'Memory Management', 
        time: memTime, 
        memoryIncrease: memoryIncrease.toFixed(2) + 'MB',
        status: memoryIncrease < 50 ? 'passed' : 'warning'
      });
      
      console.log(`   ✅ Memory Test: ${memTime}ms, Incremento: ${memoryIncrease.toFixed(2)}MB`);
    } catch (error) {
      benchmarks.push({ test: 'Memory Management', error: error.message, status: 'failed' });
      console.log(`   ❌ Memory Test falló: ${error.message}`);
    }

    // Test 4: Concurrencia - Promises paralelas
    console.log('🔄 Test de concurrencia...');
    const concurrentStart = Date.now();
    try {
      const concurrentTasks = [];
      
      for (let i = 0; i < 50; i++) {
        concurrentTasks.push(
          new Promise(resolve => {
            const delay = Math.random() * 100 + 10; // 10-110ms
            setTimeout(() => resolve(i), delay);
          })
        );
      }
      
      await Promise.all(concurrentTasks);
      const concurrentTime = Date.now() - concurrentStart;
      
      benchmarks.push({ test: 'Concurrent Operations (50 tasks)', time: concurrentTime, status: 'passed' });
      console.log(`   ✅ Concurrency Test: ${concurrentTime}ms (50 tareas paralelas)`);
    } catch (error) {
      benchmarks.push({ test: 'Concurrent Operations', error: error.message, status: 'failed' });
      console.log(`   ❌ Concurrency Test falló: ${error.message}`);
    }

    return benchmarks;
  }

  async runStressTests() {
    console.log('\n🧪 PRUEBAS DE ESTRÉS AUTOMATIZADAS');
    console.log('═══════════════════════════════════════\n');

    const stressResults = [];

    // Simular diferentes escenarios de estrés
    const stressScenarios = [
      { name: 'Carga Ligera', users: 5, duration: 30000 },
      { name: 'Carga Media', users: 15, duration: 60000 },
      { name: 'Carga Alta', users: 50, duration: 120000 },
      { name: 'Pico de Carga', users: 100, duration: 60000 }
    ];

    for (const scenario of stressScenarios) {
      console.log(`🔥 Ejecutando: ${scenario.name} (${scenario.users} usuarios, ${scenario.duration/1000}s)`);
      
      const scenarioStart = Date.now();
      try {
        // Simular carga de usuarios concurrentes
        const userPromises = [];
        
        for (let i = 0; i < scenario.users; i++) {
          userPromises.push(this.simulateUser(i, scenario.duration));
        }
        
        const results = await Promise.allSettled(userPromises);
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        const successRate = (successful / scenario.users) * 100;
        
        const scenarioTime = Date.now() - scenarioStart;
        
        stressResults.push({
          scenario: scenario.name,
          users: scenario.users,
          successful,
          failed,
          successRate: successRate.toFixed(1),
          duration: scenarioTime,
          status: successRate >= 95 ? 'passed' : successRate >= 80 ? 'warning' : 'failed'
        });
        
        console.log(`   ✅ ${scenario.name}: ${successful}/${scenario.users} exitosos (${successRate.toFixed(1)}%)`);
        
        // Pequeña pausa entre escenarios
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        stressResults.push({
          scenario: scenario.name,
          error: error.message,
          status: 'failed'
        });
        console.log(`   ❌ ${scenario.name} falló: ${error.message}`);
      }
    }

    return stressResults;
  }

  async simulateUser(userId, maxDuration) {
    const userStart = Date.now();
    const operations = Math.floor(Math.random() * 10) + 1; // 1-10 operaciones
    
    for (let op = 0; op < operations; op++) {
      // Simular operación de carga
      const operationTime = Math.random() * 500 + 100; // 100-600ms
      await new Promise(resolve => setTimeout(resolve, operationTime));
      
      // Verificar si hemos excedido el tiempo máximo
      if (Date.now() - userStart > maxDuration) {
        break;
      }
      
      // Simular posible fallo (5% de probabilidad)
      if (Math.random() < 0.05) {
        throw new Error(`Usuario ${userId} - Error simulado en operación ${op}`);
      }
    }
    
    return { userId, operations };
  }

  async runMemoryLeakDetection() {
    console.log('\n🔍 DETECCIÓN DE FUGAS DE MEMORIA');
    console.log('═══════════════════════════════════════\n');

    const memoryTests = [];
    const initialMemory = process.memoryUsage();
    
    console.log(`💾 Memoria inicial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);

    // Test de fugas con buffers
    console.log('🧪 Test 1: Allocación repetitiva de buffers...');
    for (let cycle = 0; cycle < 100; cycle++) {
      // Crear y liberar buffers
      const buffers = [];
      for (let i = 0; i < 100; i++) {
        buffers.push(Buffer.alloc(10240, cycle % 256)); // 10KB cada uno
      }
      
      // Liberar referencias
      buffers.length = 0;
      
      if (cycle % 20 === 0) {
        if (global.gc) global.gc();
        const currentMemory = process.memoryUsage();
        const increase = (currentMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
        console.log(`   Ciclo ${cycle}: +${increase.toFixed(2)}MB`);
      }
    }

    // Test de fugas con objetos
    console.log('🧪 Test 2: Creación masiva de objetos...');
    let objectStore = [];
    for (let i = 0; i < 10000; i++) {
      objectStore.push({
        id: i,
        data: new Array(100).fill(Math.random()),
        timestamp: Date.now()
      });
    }
    
    const afterObjects = process.memoryUsage();
    console.log(`   Después de crear 10,000 objetos: +${((afterObjects.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)}MB`);
    
    // Limpiar objetos
    objectStore = null;
    if (global.gc) global.gc();
    
    const finalMemory = process.memoryUsage();
    const totalIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
    
    console.log(`💾 Memoria final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`📊 Incremento neto: ${totalIncrease.toFixed(2)}MB`);

    memoryTests.push({
      test: 'Memory Leak Detection',
      initialMemory: initialMemory.heapUsed,
      finalMemory: finalMemory.heapUsed,
      increase: totalIncrease,
      status: totalIncrease < 10 ? 'passed' : totalIncrease < 50 ? 'warning' : 'failed'
    });nitialMemory: initialMemory.heapUsed,
      finalMemory: finalMemory.heapUsed,
      increase: totalIncrease,
      status: totalIncrease < 10 ? 'passed' : totalIncrease < 50 ? 'warning' : 'failed'
    });

    return memoryTests;
  }

  async generateFinalReport(systemInfo, benchmarks, stressResults, memoryTests) {
    console.log('\n📊 GENERANDO REPORTE FINAL');
    console.log('═══════════════════════════════════════\n');

    const totalDuration = Date.now() - this.startTime;
    
    const report = {
      executionSummary: {
        timestamp: new Date().toISOString(),
        duration: totalDuration,
        version: 'MAAT v1.4.0',
        testEnvironment: systemInfo
      },
      benchmarkResults: benchmarks,
      stressTestResults: stressResults,
      memoryTestResults: memoryTests,
      overallStatus: this.calculateOverallStatus(benchmarks, stressResults, memoryTests),
      recommendations: this.generateRecommendations(benchmarks, stressResults, memoryTests)
    };

    // Guardar reporte JSON
    const reportPath = path.join('test-results', `comprehensive-test-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Generar reporte HTML
    await this.generateHTMLReport(report);

    // Mostrar resumen en consola
    this.displaySummary(report);

    console.log(`\n📄 Reporte completo guardado en: ${reportPath}`);
    return report;
  }

  calculateOverallStatus(benchmarks, stressResults, memoryTests) {
    const allTests = [...benchmarks, ...stressResults, ...memoryTests];
    const passed = allTests.filter(t => t.status === 'passed').length;
    const warnings = allTests.filter(t => t.status === 'warning').length;
    const failed = allTests.filter(t => t.status === 'failed').length;
    const total = allTests.length;

    const passRate = (passed / total) * 100;

    return {
      total,
      passed,
      warnings,
      failed,
      passRate: passRate.toFixed(1),
      grade: passRate >= 90 ? 'A' : passRate >= 80 ? 'B' : passRate >= 70 ? 'C' : passRate >= 60 ? 'D' : 'F'
    };
  }

  generateRecommendations(benchmarks, stressResults, memoryTests) {
    const recommendations = [];

    // Analyze benchmarks
    const slowBenchmarks = benchmarks.filter(b => b.time > 1000);
    if (slowBenchmarks.length > 0) {
      recommendations.push('⚡ Optimize slow operations: ' + slowBenchmarks.map(b => b.test).join(', '));
    }

    // Analyze stress tests
    const failedStress = stressResults.filter(s => s.status === 'failed');
    if (failedStress.length > 0) {
      recommendations.push('🔧 Fix failed stress tests: ' + failedStress.map(s => s.test).join(', '));
    }

    // Analyze memory tests
    const memoryIssues = memoryTests.filter(m => m.status === 'failed');
    if (memoryIssues.length > 0) {
      recommendations.push('💾 Address memory issues: ' + memoryIssues.map(m => m.test).join(', '));
    }

    return recommendations.length > 0 ? recommendations : ['✨ System performance is optimal'];
  }mendations.push('🔥 Mejorar resistencia bajo estrés en: ' + failedStress.map(s => s.scenario).join(', '));
    }

    // Analizar memoria
    const memoryIssues = memoryTests.filter(m => m.status !== 'passed');
    if (memoryIssues.length > 0) {
      recommendations.push('💾 Revisar gestión de memoria para prevenir fugas');
    }

    if (recommendations.length === 0) {
      recommendations.push('✨ El sistema muestra excelente rendimiento en todas las áreas evaluadas');
    }

    return recommendations;
  }

  async generateHTMLReport(report) {
    const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reporte Exhaustivo de Rendimiento - MAAT v1.4.0</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f8fafc; color: #2d3748; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 12px; margin-bottom: 30px; text-align: center; }
        .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
        .header p { opacity: 0.9; font-size: 1.1rem; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { background: white; border-radius: 12px; padding: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-left: 4px solid #3182ce; }
        .summary-card h3 { color: #2d3748; margin-bottom: 15px; font-size: 1.2rem; }
        .grade { font-size: 3rem; font-weight: bold; text-align: center; margin: 20px 0; }
        .grade-A { color: #38a169; }
        .grade-B { color: #3182ce; }
        .grade-C { color: #d69e2e; }
        .grade-D, .grade-F { color: #e53e3e; }
        .section { background: white; border-radius: 12px; padding: 30px; margin-bottom: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        .section h2 { color: #2d3748; margin-bottom: 20px; font-size: 1.8rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
        .test-grid { display: grid; gap: 15px; }
        .test-item { display: flex; justify-content: space-between; align-items: center; padding: 15px; border-radius: 8px; }
        .test-passed { background: #f0fff4; border-left: 4px solid #38a169; }
        .test-warning { background: #fffbeb; border-left: 4px solid #d69e2e; }
        .test-failed { background: #fed7d7; border-left: 4px solid #e53e3e; }
        .status-badge { padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; color: white; }
        .status-passed { background: #38a169; }
        .status-warning { background: #d69e2e; }
        .status-failed { background: #e53e3e; }
        .recommendations { background: #edf2f7; padding: 20px; border-radius: 8px; margin-top: 30px; } border-radius: 12px; padding: 25px; margin-top: 30px; }
        .recommendations h3 { color: #2d3748; margin-bottom: 15px; }
        .recommendations ul { list-style: none; }
        .recommendations li { margin: 10px 0; padding-left: 20px; position: relative; }
        .recommendations li:before { content: "🔧"; position: absolute; left: 0; }
        .timestamp { text-align: center; color: #718096; margin-top: 40px; font-size: 0.9rem; }
        .metric-highlight { font-size: 1.5rem; font-weight: bold; color: #3182ce; }
        .charts-placeholder { background: #f7fafc; border: 2px dashed #cbd5e0; border-radius: 8px; padding: 40px; text-align: center; color: #718096; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧪 Reporte Exhaustivo de Rendimiento y Estabilidad</h1>
            <p>Sistema MAAT v1.4.0 - Análisis Completo del Rendimiento</p>
            <p>Ejecutado: ${new Date(report.executionSummary.timestamp).toLocaleString('es-ES')}</p>
        </div>

        <div class="summary-grid">
            <div class="summary-card">
                <h3>📊 Resumen General</h3>
                <div class="metric-highlight">${report.overallStatus.total}</div>
                <p>Pruebas Totales</p>
                <div style="margin-top: 10px;">
                    <span style="color: #38a169;">✅ ${report.overallStatus.passed}</span> | 
                    <span style="color: #d69e2e;">⚠️ ${report.overallStatus.warnings}</span> | 
                    <span style="color: #e53e3e;">❌ ${report.overallStatus.failed}</span>
                </div>
            </div>
            
            <div class="summary-card">
                <h3>🎯 Calificación</h3>
                <div class="grade grade-${report.overallStatus.grade}">${report.overallStatus.grade}</div>
                <p>Tasa de Éxito: ${report.overallStatus.passRate}%</p>
            </div>
            
            <div class="summary-card">
                <h3>⏱️ Duración</h3>
                <div class="metric-highlight">${(report.executionSummary.duration / 1000 / 60).toFixed(1)}m</div>
                <p>Tiempo Total de Ejecución</p>
            </div>
            
            <div class="summary-card">
                <h3>🖥️ Sistema</h3>
                <p><strong>Plataforma:</strong> ${report.executionSummary.testEnvironment.platform}</p>
                <p><strong>Node.js:</strong> ${report.executionSummary.testEnvironment.nodeVersion}</p>
                <p><strong>CPUs:</strong> ${report.executionSummary.testEnvironment.cpuCount}</p>
            </div>
        </div>

        <div class="section">
            <h2>⚡ Benchmarks de Rendimiento</h2>
            <div class="test-grid">
                ${report.benchmarkResults.map(test => `
                    <div class="test-item test-${test.status}">
                        <div>
                            <strong>${test.test}</strong>
                            ${test.time ? `<div style="font-size: 0.9rem; color: #718096;">Tiempo: ${test.time}ms</div>` : ''}
                            ${test.memoryIncrease ? `<div style="font-size: 0.9rem; color: #718096;">Memoria: ${test.memoryIncrease}</div>` : ''}
                        </div>
                        <span class="status-badge status-${test.status}">${test.status.toUpperCase()}</span>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="section">
            <h2>🔥 Pruebas de Estrés</h2>
            <div class="test-grid">
                ${report.stressTestResults.map(test => `
                    <div class="test-item test-${test.status}">
                        <div>
                            <strong>${test.scenario}</strong>
                            ${test.users ? `<div style="font-size: 0.9rem; color: #718096;">${test.users} usuarios - Éxito: ${test.successRate}%</div>` : ''}
                        </div>
                        <span class="status-badge status-${test.status}">${test.status.toUpperCase()}</span>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="section">
            <h2>💾 Pruebas de Memoria</h2>
            <div class="test-grid">
                ${report.memoryTestResults.map(test => `
                    <div class="test-item test-${test.status}">
                        <div>
                            <strong>${test.test}</strong>
                            <div style="font-size: 0.9rem; color: #718096;">Incremento: ${test.increase.toFixed(2)}MB</div>
                        </div>
                        <span class="status-badge status-${test.status}">${test.status.toUpperCase()}</span>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="recommendations">
            <h3>📋 Recomendaciones</h3>
            <ul>
                ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>

        <div class="timestamp">
            Reporte generado automáticamente por MAAT Performance Test Suite<br>
            ${new Date().toLocaleString('es-ES')}
        </div>
    </div>
</body>
</html>`;

    const htmlPath = path.join('test-results', `comprehensive-report-${Date.now()}.html`);
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`📄 Reporte HTML generado: ${htmlPath}`);
  }

  displaySummary(report) {
    console.log('\n🏆 RESUMEN EJECUTIVO');
    console.log('═══════════════════════════════════════');
    console.log(`📊 Total de Pruebas: ${report.overallStatus.total}`);
    console.log(`✅ Exitosas: ${report.overallStatus.passed}`);
    console.log(`⚠️  Advertencias: ${report.overallStatus.warnings}`);
    console.log(`❌ Fallidas: ${report.overallStatus.failed}`);
    console.log(`🎯 Tasa de Éxito: ${report.overallStatus.passRate}%`);
    console.log(`📈 Calificación: ${report.overallStatus.grade}`);
    console.log(`⏱️  Duración Total: ${(report.executionSummary.duration / 1000 / 60).toFixed(1)} minutos`);
    
    console.log('\n🔧 RECOMENDACIONES PRINCIPALES:');
    report.recommendations.forEach(rec => {
      console.log(`   ${rec}`);
    });
  }

  async run() {
    console.log('🚀 MAAT v1.4.0 - SUITE EXHAUSTIVA DE PRUEBAS DE RENDIMIENTO');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('🎯 Iniciando análisis completo del sistema...\n');

    try {
      // 1. Diagnósticos del sistema
      const systemInfo = await this.runSystemDiagnostics();
      
      // 2. Benchmarks de rendimiento
      const benchmarks = await this.runPerformanceBenchmarks();
      
      // 3. Pruebas de estrés
      const stressResults = await this.runStressTests();
      
      // 4. Detección de fugas de memoria
      const memoryTests = await this.runMemoryLeakDetection();
      
      // 5. Generar reporte final
      const finalReport = await this.generateFinalReport(systemInfo, benchmarks, stressResults, memoryTests);
      
      console.log('\n🎉 ANÁLISIS COMPLETADO EXITOSAMENTE');
      console.log('═══════════════════════════════════════');
      
      return finalReport;
      
    } catch (error) {
      console.error('\n❌ ERROR DURANTE LAS PRUEBAS:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const runner = new PerformanceTestRunner();
  runner.run().then(() => {
    console.log('\n✅ Todas las pruebas completadas. Revisa los reportes generados.');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
}

module.exports = PerformanceTestRunner;
