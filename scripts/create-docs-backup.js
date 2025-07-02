
#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');

async function createDocsBackup() {
  console.log('🟡 MAAT v1.0.8 - Creando respaldo en docs/FILES...');
  
  try {
    const timestamp = new Date();
    const dateStr = timestamp.toISOString().slice(0, 19).replace(/[:-]/g, '');
    const filename = `maat-core-backup-${dateStr}.zip`;
    const outputDir = path.join('./docs/FILES');
    const outputPath = path.join(outputDir, filename);

    // Crear directorio docs/FILES si no existe
    await fs.mkdir(outputDir, { recursive: true });

    // Configurar archiver
    const archive = archiver('zip', {
      zlib: { level: 9 } // Máxima compresión
    });

    const output = require('fs').createWriteStream(outputPath);
    archive.pipe(output);

    // Archivos core del sistema MAAT
    const coreFiles = [
      // Backend completo
      'backend/**/*.ts',
      'backend/**/*.js',
      
      // Frontend completo
      'frontend/**/*.tsx',
      'frontend/**/*.ts',
      'frontend/**/*.js',
      
      // Server modules
      'server/**/*.ts',
      'server/**/*.js',
      
      // Components
      'components/**/*.tsx',
      'components/**/*.ts',
      
      // Database
      'database/**/*.ts',
      'database/**/*.js',
      
      // Types
      'types/**/*.ts',
      
      // Lib
      'lib/**/*.ts',
      'lib/**/*.js',
      
      // Tests
      'tests/**/*.ts',
      'tests/**/*.js',
      
      // Scripts esenciales
      'scripts/*.js',
      'scripts/*.sh',
      
      // Documentación completa
      'docs/**/*.md',
      'docs/**/*.txt',
      
      // Archivos de configuración
      'tsconfig.json',
      'drizzle.config.ts',
      '.env.example',
      'package.json',
      'MAAT_MODULE_VERSION.json',
      'VERSION_HISTORY.json',
      'CHANGELOG.md',
      'README.md',
      'LICENSE',
      
      // Demo
      'demo.html'
    ];

    console.log('📦 Agregando archivos core...');
    
    // Agregar archivos por patrones
    for (const pattern of coreFiles) {
      if (pattern.includes('*')) {
        archive.glob(pattern, {
          ignore: [
            'node_modules/**',
            'attached_assets/**',
            'backups/**',
            'uploads/**',
            'temp/**',
            'logs/**',
            '.git/**',
            '**/*.log',
            '**/.DS_Store'
          ]
        });
      } else {
        try {
          await fs.access(pattern);
          archive.file(pattern, { name: pattern });
        } catch (error) {
          console.log(`⚠️ Archivo no encontrado: ${pattern}`);
        }
      }
    }

    // Metadata del respaldo
    const metadata = {
      version: '1.0.8',
      backupType: 'DOCS_FILES_CORE',
      timestamp: timestamp.toISOString(),
      location: 'docs/FILES/',
      description: 'Respaldo core de MAAT v1.0.8 en carpeta docs/FILES',
      includes: [
        'Sistema completo MAAT',
        'Backend y Frontend',
        'Documentación técnica',
        'Scripts y configuraciones',
        'Base de datos schemas',
        'Tests y componentes'
      ],
      buildHash: 'c9a8e3f1'
    };

    archive.append(JSON.stringify(metadata, null, 2), { name: 'BACKUP_INFO.json' });

    await archive.finalize();

    return new Promise((resolve, reject) => {
      output.on('close', async () => {
        const stats = await fs.stat(outputPath);
        const sizeKB = Math.round(stats.size / 1024);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        
        console.log('✅ Respaldo creado en docs/FILES:');
        console.log(`📦 Archivo: ${filename}`);
        console.log(`📁 Ubicación: docs/FILES/${filename}`);
        console.log(`💾 Tamaño: ${sizeKB} KB (${sizeMB} MB)`);
        console.log(`🕒 Timestamp: ${timestamp.toISOString()}`);
        console.log(`🎯 Tipo: CORE BACKUP en docs/FILES`);
        console.log('🎉 Respaldo completado en la ubicación solicitada');
        
        resolve({ filename, size: stats.size, timestamp, location: outputPath });
      });

      output.on('error', reject);
      archive.on('error', reject);
    });

  } catch (error) {
    console.error('❌ Error creando respaldo en docs/FILES:', error);
    throw error;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  createDocsBackup()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { createDocsBackup };
