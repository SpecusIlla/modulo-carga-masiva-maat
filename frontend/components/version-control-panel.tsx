
// Componente de Control de Versiones - MAAT v1.2.0
// Interface para gestionar versiones de archivos

import React, { useState, useEffect } from 'react';
import { Clock, Tag, Download, Trash2, GitCompare, RotateCcw } from 'lucide-react';

interface FileVersion {
  versionId: string;
  versionNumber: number;
  hash: string;
  size: number;
  createdAt: string;
  createdBy: string;
  comment: string;
  tags: string[];
}

interface VersionControlPanelProps {
  fileId: string;
  onVersionRestore?: (versionId: string) => void;
}

export const VersionControlPanel: React.FC<VersionControlPanelProps> = ({
  fileId,
  onVersionRestore
}) => {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<any>(null);

  useEffect(() => {
    loadVersions();
  }, [fileId]);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/files/${fileId}/versions`);
      const data = await response.json();
      
      if (data.success) {
        setVersions(data.versions);
      }
    } catch (error) {
      console.error('Failed to load versions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (versionId: string) => {
    try {
      const targetPath = `./restored/${fileId}_${Date.now()}`;
      const response = await fetch(`/api/versions/${versionId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath })
      });

      const data = await response.json();
      if (data.success) {
        alert('Version restored successfully!');
        onVersionRestore?.(versionId);
      } else {
        alert('Failed to restore version: ' + data.error);
      }
    } catch (error) {
      console.error('Restore failed:', error);
      alert('Failed to restore version');
    }
  };

  const handleDelete = async (versionId: string) => {
    if (!confirm('Are you sure you want to delete this version?')) return;

    try {
      const response = await fetch(`/api/versions/${versionId}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      if (data.success) {
        setVersions(prev => prev.filter(v => v.versionId !== versionId));
        alert('Version deleted successfully!');
      } else {
        alert('Failed to delete version: ' + data.error);
      }
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete version');
    }
  };

  const handleCompare = async () => {
    if (selectedVersions.length !== 2) {
      alert('Please select exactly 2 versions to compare');
      return;
    }

    try {
      const [fromId, toId] = selectedVersions;
      const response = await fetch(`/api/versions/${fromId}/compare/${toId}`);
      const data = await response.json();
      
      if (data.success) {
        setComparisonResult(data.comparison);
        setShowComparison(true);
      }
    } catch (error) {
      console.error('Comparison failed:', error);
      alert('Failed to compare versions');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="version-control-panel loading">
        <div className="loading-spinner">Loading versions...</div>
      </div>
    );
  }

  return (
    <div className="version-control-panel">
      <style>{`
        .version-control-panel {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          padding: 20px;
          max-width: 800px;
          margin: 20px auto;
        }
        
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .panel-title {
          font-size: 18px;
          font-weight: bold;
          color: #333;
        }
        
        .compare-button {
          background: #007bff;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        
        .compare-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        
        .versions-list {
          space-y: 10px;
        }
        
        .version-item {
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          padding: 15px;
          margin-bottom: 10px;
          transition: all 0.2s ease;
        }
        
        .version-item:hover {
          border-color: #007bff;
          box-shadow: 0 2px 4px rgba(0,123,255,0.1);
        }
        
        .version-item.selected {
          background: #e3f2fd;
          border-color: #007bff;
        }
        
        .version-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        
        .version-info {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        
        .version-number {
          font-weight: bold;
          font-size: 16px;
          color: #007bff;
        }
        
        .version-meta {
          display: flex;
          gap: 10px;
          font-size: 12px;
          color: #666;
        }
        
        .version-actions {
          display: flex;
          gap: 5px;
        }
        
        .action-button {
          background: none;
          border: 1px solid #ddd;
          padding: 5px 8px;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 3px;
          font-size: 12px;
        }
        
        .action-button:hover {
          background: #f5f5f5;
        }
        
        .action-button.restore {
          color: #28a745;
          border-color: #28a745;
        }
        
        .action-button.delete {
          color: #dc3545;
          border-color: #dc3545;
        }
        
        .version-tags {
          display: flex;
          gap: 5px;
          margin-top: 8px;
        }
        
        .tag {
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
          color: #495057;
        }
        
        .comparison-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        
        .comparison-content {
          background: white;
          padding: 20px;
          border-radius: 8px;
          max-width: 500px;
          width: 90%;
        }
        
        .comparison-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }
        
        .close-button {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
        }
        
        .loading-spinner {
          text-align: center;
          padding: 40px;
          color: #666;
        }
      `}</style>

      <div className="panel-header">
        <h3 className="panel-title">
          <Clock size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          Version History
        </h3>
        <button 
          className="compare-button"
          onClick={handleCompare}
          disabled={selectedVersions.length !== 2}
        >
          <GitCompare size={16} />
          Compare Selected
        </button>
      </div>

      <div className="versions-list">
        {versions.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
            No versions found for this file.
          </div>
        ) : (
          versions.map((version) => (
            <div 
              key={version.versionId}
              className={`version-item ${selectedVersions.includes(version.versionId) ? 'selected' : ''}`}
              onClick={() => {
                setSelectedVersions(prev => {
                  if (prev.includes(version.versionId)) {
                    return prev.filter(id => id !== version.versionId);
                  } else if (prev.length < 2) {
                    return [...prev, version.versionId];
                  } else {
                    return [prev[1], version.versionId];
                  }
                });
              }}
            >
              <div className="version-header">
                <div className="version-info">
                  <span className="version-number">v{version.versionNumber}</span>
                  <div className="version-meta">
                    <span>{formatDate(version.createdAt)}</span>
                    <span>by {version.createdBy}</span>
                    <span>{formatSize(version.size)}</span>
                  </div>
                </div>
                <div className="version-actions">
                  <button 
                    className="action-button restore"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestore(version.versionId);
                    }}
                  >
                    <RotateCcw size={12} />
                    Restore
                  </button>
                  <button 
                    className="action-button delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(version.versionId);
                    }}
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </div>
              
              <div style={{ marginTop: '8px', fontSize: '14px', color: '#555' }}>
                {version.comment}
              </div>
              
              {version.tags.length > 0 && (
                <div className="version-tags">
                  {version.tags.map(tag => (
                    <span key={tag} className="tag">
                      <Tag size={10} style={{ marginRight: '2px' }} />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showComparison && comparisonResult && (
        <div className="comparison-modal">
          <div className="comparison-content">
            <div className="comparison-header">
              <h4>Version Comparison</h4>
              <button 
                className="close-button"
                onClick={() => setShowComparison(false)}
              >
                ×
              </button>
            </div>
            
            <div>
              <p><strong>Similarity:</strong> {(comparisonResult.similarity * 100).toFixed(1)}%</p>
              <p><strong>Size Change:</strong> {comparisonResult.changes.sizeChange > 0 ? '+' : ''}{comparisonResult.changes.sizeChange} bytes</p>
              <p><strong>Modifications:</strong> {comparisonResult.changes.modified}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
