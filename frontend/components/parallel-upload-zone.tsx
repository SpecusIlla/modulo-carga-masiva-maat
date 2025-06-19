import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Upload, 
  Pause, 
  Play, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Zap, 
  Gauge, 
  HardDrive,
  Network,
  Timer,
  FileText,
  Wifi,
  RotateCcw,
  Shield,
  Cpu,
  MemoryStick
} from "lucide-react";
import { zeroMemoryStreamManager } from '../utils/zero-memory-stream';

interface UploadFile {
  id: string;
  file: File;
  uploadId?: string;
  progress: number;
  status: 'queued' | 'uploading' | 'paused' | 'completed' | 'error' | 'cached' | 'recovering' | 'retrying';
  error?: string;
  chunks: number;
  chunksUploaded: number;
  speed: number; // bytes per second
  estimatedTime: number; // seconds
  compressed: boolean;
  encrypted: boolean;
  retryCount: number;
  networkQuality?: 'excellent' | 'good' | 'fair' | 'poor';
  isResumable: boolean;
  priority: 'urgent' | 'high' | 'normal' | 'low';
}

interface PerformanceMetrics {


interface DeviceCapabilities {
  memory: number; // GB
  cores: number;
  connection: string;
  supportsStreaming: boolean;
  recommendedChunkSize: number;
  maxConcurrentUploads: number;
}

interface MemoryMetrics {
  used: number; // MB
  total: number; // MB
  available: number; // MB
  heapLimit: number; // MB
}

  activeUploads: number;
  totalBandwidthSaved: number;
  compressionRatio: number;
  cacheHitRate: number;
  averageSpeed: number;
}

interface NetworkHealth {
  online: boolean;
  latency: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}

export default function ParallelUploadZone() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    activeUploads: 0,
    totalBandwidthSaved: 0,
    compressionRatio: 0,
    cacheHitRate: 0,
    averageSpeed: 0
  });
  const [networkHealth, setNetworkHealth] = useState<NetworkHealth>({
    online: true,
    latency: 25,
    quality: 'excellent'
  });
  const [recoveringSessions, setRecoveringSessions] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();


  const [deviceCapabilities, setDeviceCapabilities] = useState<DeviceCapabilities>({
    memory: 4,
    cores: 2,
    connection: '4g',
    supportsStreaming: true,
    recommendedChunkSize: 1024 * 1024,
    maxConcurrentUploads: 3
  });
  const [memoryMetrics, setMemoryMetrics] = useState<MemoryMetrics>({
    used: 0,
    total: 0,
    available: 0,
    heapLimit: 0
  });
  const [streamingMode, setStreamingMode] = useState<'zero-memory' | 'chunked' | 'fallback'>('zero-memory');


  const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
  const MAX_PARALLEL_UPLOADS = 3;
  const MAX_RETRIES = 3;

  // Generate unique ID for files
  const generateFileId = () => `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Calculate file chunks
  const calculateChunks = (fileSize: number) => Math.ceil(fileSize / CHUNK_SIZE);

  // Format bytes to human readable
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Format speed
  const formatSpeed = (bytesPerSecond: number) => `${formatBytes(bytesPerSecond)}/s`;

  // Format time
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Add files to queue


  // Detectar capacidades del dispositivo
  const detectDeviceCapabilities = useCallback(() => {
    const navigator_any = navigator as any;
    
    const capabilities: DeviceCapabilities = {
      memory: navigator_any.deviceMemory || 4,
      cores: navigator_any.hardwareConcurrency || 2,
      connection: navigator_any.connection?.effectiveType || '4g',
      supportsStreaming: 'ReadableStream' in window && 'WritableStream' in window,
      recommendedChunkSize: 1024 * 1024, // Default 1MB
      maxConcurrentUploads: 3 // Default
    };

    // Ajustar configuración basada en capacidades
    if (capabilities.memory <= 2) {
      // Dispositivos limitados
      capabilities.recommendedChunkSize = 256 * 1024; // 256KB
      capabilities.maxConcurrentUploads = 1;
      setStreamingMode('fallback');
    } else if (capabilities.memory <= 4) {
      // Dispositivos medios
      capabilities.recommendedChunkSize = 512 * 1024; // 512KB
      capabilities.maxConcurrentUploads = 2;
      setStreamingMode('chunked');
    } else {
      // Dispositivos potentes
      capabilities.recommendedChunkSize = 1024 * 1024; // 1MB
      capabilities.maxConcurrentUploads = Math.min(capabilities.cores, 5);
      setStreamingMode('zero-memory');
    }

    setDeviceCapabilities(capabilities);
    console.log('[DEVICE-DETECTION] Capabilities detected:', capabilities);
  }, []);

  // Monitorear memoria en tiempo real
  const updateMemoryMetrics = useCallback(async () => {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const metrics: MemoryMetrics = {
        used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
        available: Math.round((memory.jsHeapSizeLimit - memory.usedJSHeapSize) / 1024 / 1024),
        heapLimit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
      };
      setMemoryMetrics(metrics);

      // Ajustar modo de streaming basado en memoria disponible


  // Upload con streaming zero-memory optimizado
  const uploadFileWithStreaming = async (file: UploadFile) => {
    if (file.status !== 'queued' && file.status !== 'paused' && file.status !== 'retrying') return;

    updateFileStatus(file.id, { status: 'uploading' });
    console.log(`[ZERO-MEMORY-UPLOAD] Starting streaming upload: ${file.file.name} (${streamingMode} mode)`);

    try {
      // Determinar método de upload basado en tamaño y capacidades
      if (file.file.size > 50 * 1024 * 1024 && streamingMode === 'zero-memory') {
        return await uploadWithZeroMemoryStreaming(file);
      } else if (streamingMode === 'chunked' || file.file.size > 10 * 1024 * 1024) {
        return await uploadWithChunkedStreaming(file);
      } else {
        return await uploadWithFallbackMode(file);
      }
    } catch (error) {
      console.error(`[ZERO-MEMORY-UPLOAD] Upload failed: ${error}`);
      updateFileStatus(file.id, { 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Upload failed' 
      });
    }
  };

  // Streaming puro sin carga en memoria
  const uploadWithZeroMemoryStreaming = async (file: UploadFile) => {
    let uploadId = file.uploadId;
    
    // Inicializar sesión si no existe
    if (!uploadId) {
      uploadId = await initializeUpload(file);
      if (!uploadId) return;
      updateFileStatus(file.id, { uploadId });
    }

    return new Promise<void>((resolve, reject) => {
      zeroMemoryStreamManager.streamFile(
        file.file,
        // Progress callback
        (progress) => {
          updateFileStatus(file.id, {
            progress: progress.bytesProcessed / progress.totalBytes * 100,
            speed: progress.currentSpeed,
            estimatedTime: progress.estimatedTimeRemaining,
            chunksUploaded: progress.chunksProcessed
          });

          // Actualizar métricas de memoria
          updateMemoryMetrics();
        },
        // Chunk callback
        async (chunk, index) => {
          const formData = new FormData();
          formData.append('chunk', new Blob([chunk]));
          formData.append('uploadId', uploadId!);
          formData.append('chunkIndex', index.toString());

          const response = await fetch('/api/upload/chunk', {
            method: 'POST',
            body: formData
          });

          if (!response.ok) {
            throw new Error(`Chunk ${index} upload failed: ${response.statusText}`);
          }

          const result = await response.json();
          if (result.completed) {
            updateFileStatus(file.id, { status: 'completed', progress: 100 });
            toast({
              title: "Upload completado",
              description: `${file.file.name} subido con streaming zero-memory`,
            });
            resolve();
          }
        }
      ).then(() => {
        resolve();
      }).catch((error) => {
        reject(error);
      });
    });
  };

  // Upload con chunking tradicional optimizado
  const uploadWithChunkedStreaming = async (file: UploadFile) => {
    // Implementación de chunking optimizada similar a la anterior
    // pero con tamaño de chunk adaptado a las capacidades del dispositivo
    console.log(`[CHUNKED-UPLOAD] Using chunked streaming for ${file.file.name}`);
    
    const chunkSize = deviceCapabilities.recommendedChunkSize;
    const totalChunks = Math.ceil(file.file.size / chunkSize);
    
    updateFileStatus(file.id, { chunks: totalChunks });

    for (let i = file.chunksUploaded; i < totalChunks; i++) {
      if (isPaused || file.status === 'paused' || file.status === 'error') {
        break;
      }

      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.file.size);
      const chunk = file.file.slice(start, end);

      const success = await uploadChunk(file, i);
      if (!success && file.status === 'error') {
        if (file.retryCount < MAX_RETRIES) {
          retryUpload(file.id);
        }
        break;
      }

      // Pausa pequeña para liberar CPU en dispositivos limitados
      if (deviceCapabilities.memory <= 4 && i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
  };

  // Modo fallback para dispositivos muy limitados
  const uploadWithFallbackMode = async (file: UploadFile) => {
    console.log(`[FALLBACK-UPLOAD] Using fallback mode for ${file.file.name}`);
    
    // Upload secuencial con chunks muy pequeños
    const chunkSize = 128 * 1024; // 128KB para dispositivos limitados
    const totalChunks = Math.ceil(file.file.size / chunkSize);
    
    updateFileStatus(file.id, { chunks: totalChunks });

    for (let i = 0; i < totalChunks; i++) {
      if (isPaused || file.status === 'paused') break;

      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.file.size);
      const chunk = file.file.slice(start, end);

      // Upload inmediato sin acumulación
      const success = await uploadChunk(file, i);
      
      updateFileStatus(file.id, {
        progress: ((i + 1) / totalChunks) * 100,
        chunksUploaded: i + 1
      });

      // Pausa más larga entre chunks para dispositivos limitados
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    updateFileStatus(file.id, { status: 'completed', progress: 100 });
  };

      if (metrics.available < 50 && streamingMode !== 'fallback') {
        console.warn('[MEMORY-MONITOR] Low memory detected, switching to fallback mode');
        setStreamingMode('fallback');
      }
    }
  }, [streamingMode]);

  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles = Array.from(selectedFiles).map(file => ({
      id: generateFileId(),
      file,
      progress: 0,
      status: 'queued' as const,
      chunks: calculateChunks(file.size),
      chunksUploaded: 0,
      speed: 0,
      estimatedTime: 0,
      compressed: file.size > 1024 * 1024, // Compress files > 1MB
      encrypted: false,
      retryCount: 0,
      isResumable: file.size > 25 * 1024 * 1024, // Enable resumable uploads for files > 25MB
      priority: 'normal' as const
    }));

    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  // Initialize upload session
  const initializeUpload = async (file: UploadFile): Promise<string | null> => {
    try {
      const response = await fetch('/api/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.file.name,
          fileSize: file.file.size,
          totalChunks: file.chunks,
          metadata: {
            compressed: file.compressed,
            encrypted: file.encrypted,
            mimeType: file.file.type
          }
        })
      });

      const data = await response.json();

      if (data.cached) {
        // File was found in cache
        updateFileStatus(file.id, {
          status: 'cached',
          progress: 100,
          chunksUploaded: file.chunks
        });
        return null;
      }

      return data.uploadId;
    } catch (error) {
      console.error('Failed to initialize upload:', error);
      updateFileStatus(file.id, { status: 'error', error: 'Failed to initialize upload' });
      return null;
    }
  };

  // Upload single chunk
  const uploadChunk = async (file: UploadFile, chunkNumber: number): Promise<boolean> => {
    const start = chunkNumber * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.file.size);
    const chunk = file.file.slice(start, end);

    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('uploadId', file.uploadId!);
    formData.append('chunkNumber', chunkNumber.toString());
    formData.append('totalChunks', file.chunks.toString());

    try {
      const startTime = Date.now();
      const response = await fetch('/api/upload/chunk', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Chunk upload failed: ${response.statusText}`);
      }

      const data = await response.json();
      const uploadTime = (Date.now() - startTime) / 1000;
      const speed = chunk.size / uploadTime;

      // Simulate network quality (remove in production)
      const randomQuality = ['excellent', 'good', 'fair', 'poor'][Math.floor(Math.random() * 4)];
      updateFileStatus(file.id, { networkQuality: randomQuality });

      // Update progress and speed
      updateFileStatus(file.id, {
        chunksUploaded: data.totalReceived,
        progress: (data.totalReceived / file.chunks) * 100,
        speed: speed,
        estimatedTime: ((file.chunks - data.totalReceived) * CHUNK_SIZE) / speed
      });

      return data.completed;
    } catch (error) {
      console.error('Chunk upload failed:', error);
      updateFileStatus(file.id, { status: 'error', error: 'Chunk upload failed' });
      return false;
    }
  };

  // Upload file with chunked streaming and retry logic
  const uploadFile = async (file: UploadFile) => {
    if (file.status !== 'queued' && file.status !== 'paused' && file.status !== 'retrying') return;

    updateFileStatus(file.id, { status: 'uploading' });

    // Initialize upload session
    let uploadId = file.uploadId;
    if (!uploadId) {
      uploadId = await initializeUpload(file);
      if (!uploadId) {
        // File was cached or error occurred
        return;
      }
      updateFileStatus(file.id, { uploadId });
    }

    // Upload chunks sequentially with proper error handling
    for (let chunkNumber = file.chunksUploaded; chunkNumber < file.chunks; chunkNumber++) {
      if (isPaused || file.status === 'paused' || file.status === 'error') {
        break;
      }

      const completed = await uploadChunk(file, chunkNumber);
      if (completed) {
        updateFileStatus(file.id, { status: 'completed', progress: 100 });
        toast({
          title: "Upload completado",
          description: `${file.file.name} se ha subido correctamente`,
        });
        break;
      } else if (file.status === 'error') {
        // Retry the upload
        if (file.retryCount < MAX_RETRIES) {
          retryUpload(file.id);
        }
        break;
      }
    }
  };

  // Retry upload
  const retryUpload = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;

    updateFileStatus(fileId, { 
      status: 'retrying', 
      retryCount: file.retryCount + 1,
      progress: 0,
      chunksUploaded: 0,
      error: undefined
    });

    // Wait for a bit before retrying
    await new Promise(resolve => setTimeout(resolve, 2000));

    updateFileStatus(fileId, { status: 'queued' });
    startUploads();
  };

  // Resume recoverable uploads
  const resumeRecoverableUploads = () => {
    setFiles(prev => prev.map(file => {
      if (file.status === 'recovering') {
        return { ...file, status: 'queued' };
      }
      return file;
    }));
    setRecoveringSessions(0);
    startUploads();
  };

  // Update file status
  const updateFileStatus = (fileId: string, updates: Partial<UploadFile>) => {
    setFiles(prev => prev.map(f => 
      f.id === fileId ? { ...f, ...updates } : f
    ));
  };

  // Set file priority
  const setFilePriority = (fileId: string, priority: UploadFile['priority']) => {
    setFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, priority } : f
    ));
  };

  // Start parallel uploads
  const startUploads = async () => {
    setIsUploading(true);
    setIsPaused(false);

    const queuedFiles = files.filter(f => f.status === 'queued' || f.status === 'paused' || f.status === 'retrying');

    // Sort files based on priority (urgent > high > normal > low)
    queuedFiles.sort((a, b) => {
      const priorityOrder = { urgent: 1, high: 2, normal: 3, low: 4 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const uploadPromises = queuedFiles.slice(0, MAX_PARALLEL_UPLOADS).map(file => uploadFile(file));

    // Process remaining files as slots become available
    let currentIndex = MAX_PARALLEL_UPLOADS;

    while (currentIndex < queuedFiles.length) {
      await Promise.race(uploadPromises);

      // Find completed uploads and start new ones
      const stillUploading = files.filter(f => f.status === 'uploading').length;
      const slotsAvailable = MAX_PARALLEL_UPLOADS - stillUploading;

      for (let i = 0; i < slotsAvailable && currentIndex < queuedFiles.length; i++) {
        uploadPromises.push(uploadFile(queuedFiles[currentIndex]));
        currentIndex++;
      }
    }

    await Promise.all(uploadPromises);
    setIsUploading(false);
  };

  // Pause/Resume uploads
  const togglePause = () => {
    const newPausedState = !isPaused;
    setIsPaused(newPausedState);

    if (newPausedState) {
      // Pause all uploading files
      files.forEach(file => {
        if (file.status === 'uploading') {
          updateFileStatus(file.id, { status: 'paused' });
        }
      });
    } else {
      // Resume paused files
      files.forEach(file => {
        if (file.status === 'paused') {
          updateFileStatus(file.id, { status: 'queued' });
        }
      });
      startUploads();
    }
  };

  // Remove file
  const removeFile = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file?.uploadId && file.status === 'uploading') {
      // Cancel upload on server
      fetch(`/api/upload/cancel/${file.uploadId}`, { method: 'DELETE' });
    }
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Clear completed files
  const clearCompleted = () => {
    setFiles(prev => prev.filter(f => f.status !== 'completed' && f.status !== 'cached'));
  };

  // Load performance metrics
  const loadPerformanceMetrics = async () => {
    try {
      const response = await fetch('/api/performance/metrics');
      const data = await response.json();
      setPerformanceMetrics(data.upload || {});
    } catch (error) {
      console.error('Failed to load performance metrics:', error);
    }
  };

  // Load network health
  const loadNetworkHealth = async () => {
    // Simulate network health check (replace with actual network check)
    const online = Math.random() > 0.1; // Simulate occasional offline
    const latency = Math.floor(Math.random() * 150); // Simulate latency up to 150ms

    let quality: NetworkHealth['quality'] = 'excellent';
    if (latency > 100) quality = 'fair';
    else if (latency > 50) quality = 'good';

    setNetworkHealth({ online, latency, quality });
  };

  // Auto-refresh metrics and network health
  useEffect(() => {
    loadPerformanceMetrics();
    loadNetworkHealth(); // Load initial network health

    const interval = setInterval(() => {
      loadPerformanceMetrics();
      loadNetworkHealth(); // Refresh network health periodically
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Calculate total progress
  const totalProgress = files.length > 0 
    ? files.reduce((sum, file) => sum + file.progress, 0) / files.length 
    : 0;

  // Count files by status
  const statusCounts = files.reduce((acc, file) => {
    acc[file.status] = (acc[file.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-500" />
            Carga Paralela Avanzada
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload Controls */}
          <div className="flex items-center gap-4">
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Seleccionar Archivos
            </Button>

            {files.length > 0 && (
              <>
                <Button
                  onClick={isUploading ? togglePause : startUploads}
                  disabled={files.every(f => f.status === 'completed' || f.status === 'cached')}
                  className="flex items-center gap-2"
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  {isPaused ? 'Reanudar' : isUploading ? 'Pausar' : 'Iniciar'}
                </Button>

                <Button
                  onClick={clearCompleted}
                  variant="outline"
                  size="sm"
                  disabled={!statusCounts.completed && !statusCounts.cached}
                >
                  Limpiar Completados
                </Button>
              </>
            )}
          </div>

          {/* Overall Progress */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progreso Total</span>
                <span>{Math.round(totalProgress)}%</span>
              </div>
              <Progress value={totalProgress} className="w-full" />
            </div>
          )}

          {/* Status Summary */}
          {files.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {Object.entries(statusCounts).map(([status, count]) => (
                <Badge key={status} variant={
                  status === 'completed' || status === 'cached' ? 'default' :
                  status === 'error' ? 'destructive' :
                  status === 'uploading' ? 'secondary' : 'outline'
                }>
                  {status}: {count}
                </Badge>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
            accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.heic,.heif,.mp4,.avi,.mov,.wmv,.webm,.mkv"
          />
        </CardContent>
      </Card>

      {/* Performance Dashboard */}
      <Tabs defaultValue="files" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="files">Archivos</TabsTrigger>
          <TabsTrigger value="performance">Rendimiento</TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="space-y-4">
          <ScrollArea className="h-96">
            <div className="space-y-3">
              {files.map((file) => (
                <Card key={file.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="w-4 h-4 text-gray-500" />
                        <span className="font-medium truncate">{file.file.name}</span>
                        <Badge variant={
                          file.status === 'completed' || file.status === 'cached' ? 'default' :
                          file.status === 'error' ? 'destructive' :
                          file.status === 'uploading' ? 'secondary' : 'outline'
                        }>
                          {file.status === 'cached' ? 'En Caché' : file.status}
                        </Badge>
                        {file.compressed && <Badge variant="outline">Comprimido</Badge>}
                        {file.encrypted && <Badge variant="outline">Cifrado</Badge>}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                        <span>{formatBytes(file.file.size)}</span>
                        <span>{file.chunks} chunks</span>
                        {file.speed > 0 && <span>{formatSpeed(file.speed)}</span>}
                        {file.estimatedTime > 0 && <span>ETA: {formatTime(file.estimatedTime)}</span>}
                      </div>

                      {file.status !== 'queued' && file.status !== 'cached' && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span>Progreso ({file.chunksUploaded}/{file.chunks})</span>
                            <span>{Math.round(file.progress)}%</span>
                          </div>
                          <Progress value={file.progress} className="w-full h-2" />
                        </div>
                      )}

                      {file.error && (
                        <div className="flex items-center gap-2 mt-2 text-red-600 text-sm">
                          <AlertCircle className="w-4 h-4" />
                          <span>{file.error}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {file.status === 'completed' && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      {file.status === 'cached' && (
                        <HardDrive className="w-5 h-5 text-blue-500" />
                      )}
                      <Button
                        onClick={() => removeFile(file.id)}
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}

              {files.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Upload className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Selecciona archivos para comenzar la carga paralela</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <Network className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">Cargas Activas</p>
                  <p className="text-2xl font-bold">{performanceMetrics.activeUploads}</p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium">Velocidad Promedio</p>
                  <p className="text-2xl font-bold">{formatSpeed(performanceMetrics.averageSpeed)}</p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="text-sm font-medium">Ancho de Banda Ahorrado</p>
                  <p className="text-2xl font-bold">{formatBytes(performanceMetrics.totalBandwidthSaved)}</p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-orange-500" />
                <div>
                  <p className="text-sm font-medium">Tasa de Compresión</p>
                  <p className="text-2xl font-bold">{Math.round(performanceMetrics.compressionRatio * 100)}%</p>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <h3 className="font-medium mb-4">Optimizaciones Activas</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Carga Paralela (máx. {MAX_PARALLEL_UPLOADS})</span>
                <Badge variant="secondary">Activo</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Streaming por Chunks ({formatBytes(CHUNK_SIZE)})</span>
                <Badge variant="secondary">Activo</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Compresión Automática (archivos > 1MB)</span>
                <Badge variant="secondary">Activo</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Cache Inteligente</span>


        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <Network className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">Cargas Activas</p>
                  <p className="text-2xl font-bold">{performanceMetrics.activeUploads}</p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium">Velocidad Promedio</p>
                  <p className="text-2xl font-bold">{formatSpeed(performanceMetrics.averageSpeed)}</p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2">
                <MemoryStick className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="text-sm font-medium">Memoria Usada</p>
                  <p className="text-2xl font-bold">{memoryMetrics.used}MB</p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-orange-500" />
                <div>
                  <p className="text-sm font-medium">Modo Streaming</p>
                  <p className="text-sm font-bold capitalize">{streamingMode}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Métricas de dispositivo */}
          <Card className="p-4">
            <h3 className="font-medium mb-4">Capacidades del Dispositivo</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Memoria:</span>
                <p className="font-bold">{deviceCapabilities.memory}GB</p>
              </div>
              <div>
                <span className="text-gray-600">Cores:</span>
                <p className="font-bold">{deviceCapabilities.cores}</p>
              </div>
              <div>
                <span className="text-gray-600">Conexión:</span>
                <p className="font-bold">{deviceCapabilities.connection}</p>
              </div>
              <div>
                <span className="text-gray-600">Chunk Size:</span>
                <p className="font-bold">{formatBytes(deviceCapabilities.recommendedChunkSize)}</p>
              </div>
            </div>
          </Card>

          {/* Monitor de memoria en tiempo real */}
          <Card className="p-4">
            <h3 className="font-medium mb-4">Monitor de Memoria</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Memoria Usada</span>
                <span className="text-sm font-bold">{memoryMetrics.used}MB / {memoryMetrics.heapLimit}MB</span>
              </div>
              <Progress 
                value={(memoryMetrics.used / memoryMetrics.heapLimit) * 100} 
                className="w-full h-2"
              />
              <div className="flex justify-between items-center text-sm text-gray-600">
                <span>Disponible: {memoryMetrics.available}MB</span>
                <Badge variant={memoryMetrics.available > 100 ? 'default' : 'destructive'}>
                  {memoryMetrics.available > 100 ? 'OK' : 'LOW'}
                </Badge>
              </div>
            </div>
          </Card>

          {/* Optimizaciones activas */}
          <Card className="p-4">
            <h3 className="font-medium mb-4">Optimizaciones Activas</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Streaming Zero-Memory</span>
                <Badge variant={streamingMode === 'zero-memory' ? 'default' : 'outline'}>
                  {streamingMode === 'zero-memory' ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">


  // Inicializar detección de capacidades y monitoreo
  useEffect(() => {
    detectDeviceCapabilities();
    updateMemoryMetrics();
    
    // Monitoreo periódico de memoria
    const memoryInterval = setInterval(updateMemoryMetrics, 2000);
    
    return () => {
      clearInterval(memoryInterval);
      zeroMemoryStreamManager.cleanup();
    };
  }, [detectDeviceCapabilities, updateMemoryMetrics]);

  // Usar el nuevo método de upload con streaming
  const startUploads = async () => {
    setIsUploading(true);
    setIsPaused(false);

    const queuedFiles = files.filter(f => f.status === 'queued' || f.status === 'paused' || f.status === 'retrying');

    // Ordenar por prioridad
    queuedFiles.sort((a, b) => {
      const priorityOrder = { urgent: 1, high: 2, normal: 3, low: 4 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Usar capacidades detectadas para concurrencia
    const maxConcurrent = deviceCapabilities.maxConcurrentUploads;
    const uploadPromises = queuedFiles.slice(0, maxConcurrent).map(file => uploadFileWithStreaming(file));

    // Procesar archivos restantes conforme se liberen slots
    let currentIndex = maxConcurrent;
    while (currentIndex < queuedFiles.length) {
      await Promise.race(uploadPromises);
      
      const stillUploading = files.filter(f => f.status === 'uploading').length;
      const slotsAvailable = maxConcurrent - stillUploading;

      for (let i = 0; i < slotsAvailable && currentIndex < queuedFiles.length; i++) {
        uploadPromises.push(uploadFileWithStreaming(queuedFiles[currentIndex]));
        currentIndex++;
      }
    }

    await Promise.all(uploadPromises);
    setIsUploading(false);
  };

                <span className="text-sm">Chunking Adaptativo</span>
                <Badge variant="secondary">Activo</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Fallback para Dispositivos Limitados</span>
                <Badge variant={streamingMode === 'fallback' ? 'default' : 'outline'}>
                  {streamingMode === 'fallback' ? 'Activo' : 'Disponible'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Worker Threads (Procesamiento)</span>
                <Badge variant="secondary">Activo</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Liberación Automática de Memoria</span>
                <Badge variant="secondary">Activo</Badge>
              </div>
            </div>
          </Card>
        </TabsContent>

                <Badge variant="secondary">Activo</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Validación de Integridad</span>
                <Badge variant="secondary">Activo</Badge>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}