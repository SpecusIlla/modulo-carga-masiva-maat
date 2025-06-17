import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Upload, 
  Link2, 
  X, 
  FileText, 
  FileImage, 
  Video, 
  File,
  Filter,
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  FolderOpen,
  BarChart3,
  Info,
  Download,
  Brain
} from "lucide-react";
import type { BulkUploadZoneProps, FileUploadItem, LinkUploadItem, UploadStatistics, UploadConfiguration } from "../types";

// Configuración por defecto
const defaultConfig: UploadConfiguration = {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  allowedFileTypes: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'mp4', 'avi'],
  concurrentUploads: 10,
  enableAI: true,
  enableDuplicateDetection: true,
  apiEndpoints: {
    upload: '/api/documents/upload',
    batchUpload: '/api/documents/batch-upload',
    classify: '/api/ai/classify',
    categories: '/api/categories'
  }
};

export default function BulkUploadZone({ 
  projectId, 
  categories, 
  onUploadComplete,
  apiBaseUrl = '',
  config = defaultConfig
}: BulkUploadZoneProps & { config?: UploadConfiguration }) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const [links, setLinks] = useState<LinkUploadItem[]>([]);
  const [defaultCategoryId, setDefaultCategoryId] = useState<number | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [bulkLinksInput, setBulkLinksInput] = useState("");
  const [uploadPaused, setUploadPaused] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'documents' | 'images' | 'videos'>('all');
  const [globalProgress, setGlobalProgress] = useState(0);
  const [totalUploadTime, setTotalUploadTime] = useState(0);
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const [uploadStats, setUploadStats] = useState<UploadStatistics | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [confirmationStats, setConfirmationStats] = useState<any>(null);
  const [showTrainingPanel, setShowTrainingPanel] = useState(false);
  const [showFolderExplorer, setShowFolderExplorer] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Función para formatear tamaños de archivo
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Función para generar estadísticas de carga
  const generateUploadStatistics = useCallback((files: File[], processingTime: number): UploadStatistics => {
    const filesByType: Record<string, number> = {};
    let totalSize = 0;
    let largestFile = { name: '', size: 0 };
    let smallestFile = { name: '', size: Infinity };
    const folderStructure: Array<{ path: string; fileCount: number; size: number }> = [];

    files.forEach(file => {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'unknown';
      filesByType[extension] = (filesByType[extension] || 0) + 1;
      
      totalSize += file.size;
      
      if (file.size > largestFile.size) {
        largestFile = { name: file.name, size: file.size };
      }
      
      if (file.size < smallestFile.size) {
        smallestFile = { name: file.name, size: file.size };
      }

      // Analizar estructura de carpetas
      const path = (file as any).webkitRelativePath || file.name;
      const folderPath = path.substring(0, path.lastIndexOf('/')) || '/';
      
      const existingFolder = folderStructure.find(f => f.path === folderPath);
      if (existingFolder) {
        existingFolder.fileCount++;
        existingFolder.size += file.size;
      } else if (folderPath !== '/') {
        folderStructure.push({
          path: folderPath,
          fileCount: 1,
          size: file.size
        });
      }
    });

    const totalFolders = folderStructure.length;
    const averageFileSize = files.length > 0 ? totalSize / files.length : 0;

    return {
      totalFolders,
      totalFiles: files.length,
      filesByType,
      totalSize,
      averageFileSize,
      largestFile: largestFile.size > 0 ? largestFile : { name: 'N/A', size: 0 },
      smallestFile: smallestFile.size < Infinity ? smallestFile : { name: 'N/A', size: 0 },
      folderStructure,
      processingTime
    };
  }, []);

  // Función para descargar reporte de estadísticas
  const downloadStatsReport = () => {
    if (!uploadStats) return;
    
    const report = `
FICHA COMPLETA DE CARGA MASIVA - MÓDULO AUTOCONTENIDO v1.0.1
============================================================

RESUMEN GENERAL:
• Total de carpetas procesadas: ${uploadStats.totalFolders}
• Total de archivos encontrados: ${uploadStats.totalFiles}
• Tamaño total: ${formatFileSize(uploadStats.totalSize)}
• Tamaño promedio por archivo: ${formatFileSize(uploadStats.averageFileSize)}
• Tiempo de procesamiento: ${uploadStats.processingTime}ms

ANÁLISIS POR TIPO DE ARCHIVO:
${Object.entries(uploadStats.filesByType)
  .sort(([,a], [,b]) => b - a)
  .map(([type, count]) => `• .${type}: ${count} archivo${count > 1 ? 's' : ''}`)
  .join('\n')}

ARCHIVO MÁS GRANDE:
• Nombre: ${uploadStats.largestFile.name}
• Tamaño: ${formatFileSize(uploadStats.largestFile.size)}

ARCHIVO MÁS PEQUEÑO:
• Nombre: ${uploadStats.smallestFile.name}
• Tamaño: ${formatFileSize(uploadStats.smallestFile.size)}

ESTRUCTURA DE CARPETAS:
${uploadStats.folderStructure.length > 0 
  ? uploadStats.folderStructure
      .sort((a, b) => b.fileCount - a.fileCount)
      .map(folder => `• ${folder.path}: ${folder.fileCount} archivos (${formatFileSize(folder.size)})`)
      .join('\n')
  : '• No se detectó estructura de carpetas'}

---
Generado por Módulo de Carga Masiva Autocontenido v1.0.1
${new Date().toLocaleString()}
    `.trim();

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Carga_Masiva_Report_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Mutación de carga
  const uploadMutation = useMutation({
    mutationFn: async ({ file, categoryId }: { file: File; categoryId: number }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId.toString());
      formData.append('categoryId', categoryId.toString());
      
      const endpoint = `${apiBaseUrl}${config?.apiEndpoints?.upload || defaultConfig.apiEndpoints!.upload}`;
      return await apiRequest("POST", endpoint, formData);
    },
    onSuccess: () => {
      onUploadComplete();
      queryClient.invalidateQueries({ queryKey: ["/api/documents", "project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/project", projectId, "stats"] });
    }
  });

  // Resto de la lógica del componente se mantiene igual...
  // [Aquí irían todas las funciones de procesamiento de archivos, drag & drop, etc.]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Carga Masiva de Documentos
            <Badge variant="secondary">v1.0.1</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Interfaz de carga masiva */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' 
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              // Lógica de procesamiento de archivos
            }}
          >
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                  <Upload className="w-8 h-8 text-gray-500" />
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-2">
                  Arrastra archivos o carpetas aquí
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Soporte para carga recursiva de carpetas y clasificación automática por IA
                </p>
                
                <div className="flex gap-2 justify-center">
                  <Button onClick={() => fileInputRef.current?.click()}>
                    <FileText className="w-4 h-4 mr-2" />
                    Seleccionar Archivos
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => folderInputRef.current?.click()}
                  >
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Seleccionar Carpeta
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Inputs ocultos */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                // Procesar archivos
              }
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-ignore
            webkitdirectory=""
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                // Procesar carpeta
              }
            }}
          />

          {/* Panel de estadísticas */}
          {uploadStats && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Estadísticas de Carga
                  </span>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={downloadStatsReport}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Descargar Reporte
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {uploadStats.totalFiles}
                    </div>
                    <div className="text-sm text-gray-600">Archivos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {uploadStats.totalFolders}
                    </div>
                    <div className="text-sm text-gray-600">Carpetas</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {formatFileSize(uploadStats.totalSize)}
                    </div>
                    <div className="text-sm text-gray-600">Tamaño Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {uploadStats.processingTime}ms
                    </div>
                    <div className="text-sm text-gray-600">Tiempo</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}