
// API Routes para Version Control - MAAT v1.3.1

import { Router, Request, Response } from 'express';
import { versionControl } from '../versioning/version-control-manager';

const router = Router();

// Get version history for a file
router.get('/files/:fileId/versions', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const versions = await versionControl.getVersionHistory(fileId);
    
    res.json({
      success: true,
      fileId,
      totalVersions: versions.length,
      versions: versions.map(v => ({
        versionId: v.versionId,
        versionNumber: v.versionNumber,
        hash: v.hash,
        size: v.size,
        createdAt: v.createdAt,
        createdBy: v.createdBy,
        comment: v.comment,
        tags: v.tags
      }))
    });
  } catch (error) {
    console.error('[VERSION_API] Get versions failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve version history' 
    });
  }
});

// Get specific version details
router.get('/versions/:versionId', async (req: Request, res: Response) => {
  try {
    const { versionId } = req.params;
    const version = await versionControl.getVersion(versionId);
    
    if (!version) {
      return res.status(404).json({
        success: false,
        error: 'Version not found'
      });
    }

    res.json({
      success: true,
      version
    });
  } catch (error) {
    console.error('[VERSION_API] Get version failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve version' 
    });
  }
});

// Restore a specific version
router.post('/versions/:versionId/restore', async (req: Request, res: Response) => {
  try {
    const { versionId } = req.params;
    const { targetPath } = req.body;
    
    if (!targetPath) {
      return res.status(400).json({
        success: false,
        error: 'Target path is required'
      });
    }

    const success = await versionControl.restoreVersion(versionId, targetPath);
    
    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to restore version'
      });
    }

    res.json({
      success: true,
      message: 'Version restored successfully',
      restoredTo: targetPath
    });
  } catch (error) {
    console.error('[VERSION_API] Restore version failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to restore version' 
    });
  }
});

// Compare two versions
router.get('/versions/:fromVersionId/compare/:toVersionId', async (req: Request, res: Response) => {
  try {
    const { fromVersionId, toVersionId } = req.params;
    const diff = await versionControl.compareVersions(fromVersionId, toVersionId);
    
    res.json({
      success: true,
      comparison: diff
    });
  } catch (error) {
    console.error('[VERSION_API] Compare versions failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to compare versions' 
    });
  }
});

// Add tags to a version
router.post('/versions/:versionId/tags', async (req: Request, res: Response) => {
  try {
    const { versionId } = req.params;
    const { tags } = req.body;
    
    if (!Array.isArray(tags)) {
      return res.status(400).json({
        success: false,
        error: 'Tags must be an array'
      });
    }

    const success = await versionControl.tagVersion(versionId, tags);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Version not found'
      });
    }

    res.json({
      success: true,
      message: 'Tags added successfully'
    });
  } catch (error) {
    console.error('[VERSION_API] Tag version failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to add tags' 
    });
  }
});

// Delete a version
router.delete('/versions/:versionId', async (req: Request, res: Response) => {
  try {
    const { versionId } = req.params;
    const success = await versionControl.deleteVersion(versionId);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Version not found or cannot be deleted'
      });
    }

    res.json({
      success: true,
      message: 'Version deleted successfully'
    });
  } catch (error) {
    console.error('[VERSION_API] Delete version failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete version' 
    });
  }
});

// Cleanup old versions
router.post('/versions/cleanup', async (req: Request, res: Response) => {
  try {
    const { retentionDays = 30 } = req.body;
    const deletedCount = await versionControl.cleanup(retentionDays);
    
    res.json({
      success: true,
      message: 'Cleanup completed',
      deletedVersions: deletedCount
    });
  } catch (error) {
    console.error('[VERSION_API] Cleanup failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to cleanup versions' 
    });
  }
});

export default router;
