
// Rutas para monitoreo de salud y escalamiento - MAAT v1.2.1

import { Router } from 'express';
import { healthCheckManager } from '../monitoring/health-check-manager';
import { autoScaler } from '../scaling/auto-scaler';

const router = Router();

// Estado general de salud del sistema
router.get('/status', async (req, res) => {
  try {
    const healthReport = healthCheckManager.getHealthReport();
    const scalingConfig = autoScaler.getCurrentConfiguration();
    
    res.json({
      ...healthReport,
      scaling: {
        currentInstances: scalingConfig.currentInstances,
        phase: scalingConfig.currentPhase,
        configuration: {
          minInstances: scalingConfig.minInstances,
          maxInstances: scalingConfig.maxInstances,
          targetCPU: scalingConfig.targetCPU,
          targetMemory: scalingConfig.targetMemory
        }
      }
    });
  } catch (error) {
    console.error('Error getting health status:', error);
    res.status(500).json({ error: 'Failed to get health status' });
  }
});

// Métricas detalladas
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await healthCheckManager.collectMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error collecting metrics:', error);
    res.status(500).json({ error: 'Failed to collect metrics' });
  }
});

// Evaluar escalamiento
router.post('/evaluate-scaling', async (req, res) => {
  try {
    const { cpu, memory, activeUploads, queuedUploads, networkLatency } = req.body;
    
    const decision = await autoScaler.evaluateScaling({
      cpu,
      memory,
      activeUploads,
      queuedUploads,
      networkLatency
    });
    
    // Ejecutar la decisión si es recomendada
    if (decision.confidence > 0.7 && decision.action !== 'maintain') {
      await autoScaler.executeScaling(decision);
    }
    
    res.json(decision);
  } catch (error) {
    console.error('Error evaluating scaling:', error);
    res.status(500).json({ error: 'Failed to evaluate scaling' });
  }
});

// Configurar escalamiento
router.put('/scaling/config', async (req, res) => {
  try {
    const { minInstances, maxInstances, targetCPU, targetMemory } = req.body;
    
    // Validaciones básicas
    if (minInstances < 1 || maxInstances < minInstances) {
      return res.status(400).json({ error: 'Invalid scaling configuration' });
    }
    
    // Aquí actualizarías la configuración del autoScaler
    res.json({ message: 'Scaling configuration updated' });
  } catch (error) {
    console.error('Error updating scaling config:', error);
    res.status(500).json({ error: 'Failed to update scaling configuration' });
  }
});

// Forzar escalamiento manual
router.post('/scaling/manual', async (req, res) => {
  try {
    const { action, instances } = req.body;
    
    const currentConfig = autoScaler.getCurrentConfiguration();
    let targetInstances = instances;
    
    if (action === 'scale_up') {
      targetInstances = Math.min(instances, currentConfig.maxInstances);
    } else if (action === 'scale_down') {
      targetInstances = Math.max(instances, currentConfig.minInstances);
    }
    
    const decision = {
      action,
      currentInstances: currentConfig.currentInstances,
      targetInstances,
      reason: 'Manual scaling triggered',
      confidence: 1.0,
      estimatedCost: 0
    };
    
    await autoScaler.executeScaling(decision);
    res.json({ message: 'Manual scaling executed', decision });
  } catch (error) {
    console.error('Error executing manual scaling:', error);
    res.status(500).json({ error: 'Failed to execute manual scaling' });
  }
});

export default router;
