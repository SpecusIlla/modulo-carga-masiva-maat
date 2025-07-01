
#!/usr/bin/env node

const { backupManager } = require('../backend/backup/backup-manager');
const fs = require('fs').promises;

async function createProductionBackup() {
  console.log('🟡 MAAT v1.0.5 - Iniciando backup de producción...');
  
  try {
    // Create backup
    const result = await backupManager.createBackup();
    
    console.log('✅ Backup creado exitosamente:');
    console.log(`📦 Archivo: ${result.filename}`);
    console.log(`💾 Tamaño: ${Math.round(result.size / 1024)} KB`);
    console.log(`🕒 Timestamp: ${result.timestamp.toISOString()}`);
    console.log(`🔐 Build Hash: ${result.buildHash}`);
    console.log(`✓ Integridad: ${result.integrity ? 'Verificada' : 'Error'}`);
    
    // Cleanup old backups
    await backupManager.cleanupOldBackups();
    console.log('🗑️ Backups antiguos limpiados');
    
    // Update backup info in version file
    const versionFile = await fs.readFile('MAAT_MODULE_VERSION.json', 'utf8');
    const versionData = JSON.parse(versionFile);
    versionData.backupCreated = result.filename;
    versionData.lastBackup = result.timestamp.toISOString();
    
    await fs.writeFile('MAAT_MODULE_VERSION.json', JSON.stringify(versionData, null, 2));
    
    console.log('📊 Estado: ESTABLE - Documentación Completa y Sistema de Respaldos');
    
  } catch (error) {
    console.error('❌ Error creando backup:', error);
    process.exit(1);
  }
}

createProductionBackup();
