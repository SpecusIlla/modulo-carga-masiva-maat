
#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');

async function createCoreBackup() {
  console.log('🟡 MAAT v1.0.8 - Creando respaldo core comprimido...');
  
  try {
    const timestamp = new Date();
    const dateStr = timestamp.toISOString().slice(0, 19).replace(/[:-]/g, '');
    const filename = `maat-v1.0.8-core-backup-${dateStr}.zip`;
    const outputPath = path.join('./backups', filename);

    // Crear directorio de backups si no existe
    await fs.mkdir('./backups', { recursive: true });

    // Configurar archiver
    const archive = archiver('zip', {
      zlib: { level: 9 } // Máxima compresión
    });

    const output = require('fs').createWriteStream(outputPath);
    archive.pipe(output);

    // Archivos y directorios core MAAT
    const coreIncludes = [
      // Backend core
      'backend/**/*.ts',
      'backend/**/*.js',
      
      // Frontend core
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
      
      // Tests core
      'tests/**/*.ts',
      'tests/**/*.js',
      
      // Scripts esenciales
      'scripts/setup-database.sh',
      'scripts/install-clamav.sh',
      
      // Documentación
      'docs/MAAT_COMPREHENSIVE_DOCUMENTATION_V1.0.8.md',
      'README.md',
      'CHANGELOG.md',
      'LICENSE',
      
      // Configuración core
      'tsconfig.json',
      'drizzle.config.ts',
      '.env.example',
      'MAAT_MODULE_VERSION.json',
      'VERSION_HISTORY.json',
      
      // HTML demo
      'demo.html'
    ];

    console.log('📦 Agregando archivos core al respaldo...');
    
    // Agregar archivos por patrones
    for (const pattern of coreIncludes) {
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
            '**/.DS_Store',
            '**/npm-debug.log*',
            '**/yarn-debug.log*',
            '**/yarn-error.log*'
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

    // Agregar metadata del respaldo
    const metadata = {
      version: '1.0.8',
      backupType: 'CORE_ONLY',
      timestamp: timestamp.toISOString(),
      description: 'Respaldo comprimido con elementos core de MAAT v1.0.8',
      includes: [
        'Backend TypeScript/JavaScript',
        'Frontend React components',
        'Server modules y rutas',
        'Base de datos schemas',
        'Types y contratos',
        'Documentación técnica',
        'Configuraciones esenciales',
        'Scripts de setup'
      ],
      excludes: [
        'node_modules',
        'attached_assets',
        'archivos temporales',
        'logs del sistema',
        'uploads de usuario',
        'backups anteriores'
      ],
      buildHash: 'c9a8e3f1',
      coreComponents: {
        backend: true,
        frontend: true,
        server: true,
        database: true,
        documentation: true,
        configuration: true
      }
    };

    archive.append(JSON.stringify(metadata, null, 2), { name: 'BACKUP_METADATA.json' });

    await archive.finalize();

    return new Promise((resolve, reject) => {
      output.on('close', async () => {
        const stats = await fs.stat(outputPath);
        const sizeKB = Math.round(stats.size / 1024);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        
        console.log('✅ Respaldo core creado exitosamente:');
        console.log(`📦 Archivo: ${filename}`);
        console.log(`💾 Tamaño: ${sizeKB} KB (${sizeMB} MB)`);
        console.log(`🕒 Timestamp: ${timestamp.toISOString()}`);
        console.log(`🔐 Build Hash: c9a8e3f1`);
        console.log(`📊 Archivos totales: ${archive.pointer()} bytes`);
        console.log(`🎯 Tipo: CORE BACKUP - Solo elementos esenciales`);
        
        // Actualizar información de respaldo
        try {
          const versionFile = await fs.readFile('MAAT_MODULE_VERSION.json', 'utf8');
          const versionData = JSON.parse(versionFile);
          versionData.lastCoreBackup = filename;
          versionData.coreBackupDate = timestamp.toISOString();
          
          await fs.writeFile('MAAT_MODULE_VERSION.json', JSON.stringify(versionData, null, 2));
          console.log('📝 Version file actualizado con info del respaldo');
        } catch (error) {
          console.log('⚠️ No se pudo actualizar version file');
        }
        
        console.log('🎉 Respaldo core completado - Listo para distribución');
        resolve({ filename, size: stats.size, timestamp });
      });

      output.on('error', reject);
      archive.on('error', reject);
    });

  } catch (error) {
    console.error('❌ Error creando respaldo core:', error);
    throw error;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  createCoreBackup()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { createCoreBackup };
