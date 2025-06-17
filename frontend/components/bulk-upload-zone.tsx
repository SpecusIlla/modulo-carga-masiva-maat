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
  Zap
} from "lucide-react";

interface BulkUploadZoneProps {
  projectId: number;
  categories: Array<{
    id: number;
    name: string;
    color: string;
    icon: string;
  }>;
  onUploadComplete: () => void;
}

interface FileUploadItem {
  file: File;
  categoryId: number | null;
  status: 'pending' | 'uploading' | 'success' | 'error' | 'paused';
  progress: number;
  error?: string;
  hash?: string;
  isDuplicate?: boolean;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  estimatedTime?: number;
  uploadSpeed?: number;
  retryCount?: number;
  suggestedCategory?: {
    categoryId: number;
    categoryName: string;
    confidence: number;
    reasoning: string;
  };
}

interface LinkUploadItem {
  url: string;
  title: string;
  categoryId: number | null;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

export default function BulkUploadZone({ projectId, categories, onUploadComplete }: BulkUploadZoneProps) {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async ({ file, categoryId }: { file: File; categoryId: number }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId.toString());
      formData.append('categoryId', categoryId.toString());
      
      return await apiRequest("POST", "/api/documents/upload", formData);
    },
    onSuccess: () => {
      onUploadComplete();
      queryClient.invalidateQueries({ queryKey: ["/api/documents", "project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/project", projectId, "stats"] });
    }
  });

  // Hash calculation for duplicate detection
  const calculateFileHash = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Check for duplicates
  const checkDuplicates = async (newFiles: FileUploadItem[]) => {
    for (let i = 0; i < newFiles.length; i++) {
      const hash = await calculateFileHash(newFiles[i].file);
      newFiles[i].hash = hash;
      
      // Check against existing files
      const isDuplicate = files.some(existingFile => existingFile.hash === hash);
      if (isDuplicate) {
        newFiles[i].isDuplicate = true;
        toast({
          title: "Archivo duplicado detectado",
          description: `"${newFiles[i].file.name}" ya existe en la cola`,
          variant: "destructive"
        });
      }
    }
    return newFiles;
  };

  // Update global progress
  const updateGlobalProgress = () => {
    const totalFiles = files.length + links.length;
    if (totalFiles === 0) {
      setGlobalProgress(0);
      return;
    }
    
    const completedFiles = files.filter(f => f.status === 'success').length + 
                          links.filter(l => l.status === 'success').length;
    const uploadingFiles = files.filter(f => f.status === 'uploading').length + 
                          links.filter(l => l.status === 'uploading').length;
    
    let progress = (completedFiles / totalFiles) * 100;
    
    // Add partial progress for uploading files
    files.forEach(f => {
      if (f.status === 'uploading') {
        progress += (f.progress / totalFiles);
      }
    });
    
    setGlobalProgress(Math.min(progress, 100));
  };

  // Filter files by type
  const getFilteredFiles = () => {
    return files.filter(file => {
      if (filterType === 'all') return true;
      
      const ext = file.file.name.split('.').pop()?.toLowerCase();
      const videoFormats = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', '3gp', 'mpg', 'mpeg'];
      const imageFormats = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'tif', 'ico', 'heic', 'heif'];
      const docFormats = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
      
      if (filterType === 'videos' && videoFormats.includes(ext || '')) return true;
      if (filterType === 'images' && imageFormats.includes(ext || '')) return true;
      if (filterType === 'documents' && docFormats.includes(ext || '')) return true;
      
      return false;
    });
  };

  // Estimate upload time
  const estimateUploadTime = (fileSize: number, uploadSpeed: number = 1024 * 1024): number => {
    return Math.ceil(fileSize / uploadSpeed); // seconds
  };

  const linkUploadMutation = useMutation({
    mutationFn: async ({ url, title, categoryId }: { url: string; title: string; categoryId: number }) => {
      const response = await apiRequest("POST", "/api/documents/link", {
        projectId,
        categoryId,
        url,
        title
      });
      return response;
    },
    onSuccess: () => {
      onUploadComplete();
      queryClient.invalidateQueries({ queryKey: ["/api/documents", "project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/project", projectId, "stats"] });
    }
  });

  // Classify documents using AI
  const classifyDocuments = async (fileList: File[]) => {
    try {
      const formData = new FormData();
      formData.append('projectId', projectId.toString());
      fileList.forEach((file, index) => {
        formData.append(`files`, file);
      });

      const response = await apiRequest("POST", "/api/ai/classify-documents", formData);
      return response.classifications || [];
    } catch (error) {
      console.error('Document classification failed:', error);
      return [];
    }
  };

  const processFiles = useCallback(async (fileList: FileList) => {
    const validFiles = Array.from(fileList).filter(file => {
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (file.size > maxSize) {
        toast({
          title: "Archivo demasiado grande",
          description: `${file.name} excede el límite de 100MB`,
          variant: "destructive"
        });
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    try {
      // Classify documents using AI
      const classifications = await classifyDocuments(validFiles);
      
      const newFiles = validFiles.map((file, index) => {
        const classification = classifications[index];
        const bestMatch = classification?.bestMatch;
        
        return {
          file,
          categoryId: bestMatch?.categoryId || defaultCategoryId,
          status: 'pending' as const,
          progress: 0,
          priority: 'normal' as const,
          retryCount: 0,
          suggestedCategory: bestMatch ? {
            categoryId: bestMatch.categoryId,
            categoryName: bestMatch.categoryName,
            confidence: bestMatch.confidence,
            reasoning: bestMatch.reasoning
          } : undefined
        };
      });
      
      const processedFiles = await checkDuplicates(newFiles);
      setFiles(prev => [...prev, ...processedFiles]);
      
      if (classifications.some((c: any) => c.bestMatch?.confidence > 70)) {
        toast({
          title: "Clasificación automática aplicada",
          description: `Se clasificaron ${classifications.filter((c: any) => c.bestMatch?.confidence > 70).length} documentos automáticamente`
        });
      }
    } catch (error) {
      // Fallback to default categorization if classification fails
      const newFiles = validFiles.map(file => ({
        file,
        categoryId: defaultCategoryId,
        status: 'pending' as const,
        progress: 0,
        priority: 'normal' as const,
        retryCount: 0
      }));
      setFiles(prev => [...prev, ...newFiles]);
    }
  }, [defaultCategoryId, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const addLink = () => {
    if (!linkInput.trim()) return;
    
    const newLink: LinkUploadItem = {
      url: linkInput,
      title: linkInput.split('/').pop() || linkInput,
      categoryId: defaultCategoryId,
      status: 'pending',
      progress: 0
    };
    
    setLinks(prev => [...prev, newLink]);
    setLinkInput("");
  };

  const addBulkLinks = () => {
    const urls = bulkLinksInput
      .split('\n')
      .map(url => url.trim())
      .filter(url => url && url.startsWith('http'));
    
    const newLinks = urls.map(url => ({
      url,
      title: url.split('/').pop() || url,
      categoryId: defaultCategoryId,
      status: 'pending' as const,
      progress: 0
    }));
    
    setLinks(prev => [...prev, ...newLinks]);
    setBulkLinksInput("");
    setShowLinkForm(false);
    
    toast({
      title: "Enlaces agregados",
      description: `Se agregaron ${newLinks.length} enlaces a la cola`
    });
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeLink = (index: number) => {
    setLinks(prev => prev.filter((_, i) => i !== index));
  };

  // Toggle pause/resume uploads
  const toggleUpload = () => {
    setUploadPaused(!uploadPaused);
    if (uploadPaused) {
      toast({
        title: "Carga reanudada",
        description: "Los archivos continuarán cargándose"
      });
    } else {
      toast({
        title: "Carga pausada",
        description: "Los archivos pendientes están en pausa"
      });
    }
  };

  // Retry failed uploads
  const retryFile = (index: number) => {
    setFiles(prev => prev.map((f, idx) => 
      idx === index ? { 
        ...f, 
        status: 'pending', 
        progress: 0, 
        error: undefined,
        retryCount: (f.retryCount || 0) + 1
      } : f
    ));
  };

  // Update file priority
  const updateFilePriority = (index: number, priority: 'urgent' | 'high' | 'normal' | 'low') => {
    setFiles(prev => prev.map((f, idx) => 
      idx === index ? { ...f, priority } : f
    ));
  };

  const uploadFiles = async () => {
    if (files.some(f => !f.categoryId) || links.some(l => !l.categoryId)) {
      toast({
        title: "Error",
        description: "Todos los archivos y enlaces deben tener una categoría asignada",
        variant: "destructive"
      });
      return;
    }

    setUploadStartTime(Date.now());

    // Sort files by priority
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    const sortedFiles = [...files].sort((a, b) => 
      priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    // Upload files with parallel processing (max 3 concurrent)
    const maxConcurrent = 3;
    
    const uploadFile = async (fileItem: FileUploadItem, index: number) => {
      if (uploadPaused) {
        await new Promise(resolve => {
          const checkPause = () => {
            if (!uploadPaused) resolve(undefined);
            else setTimeout(checkPause, 100);
          };
          checkPause();
        });
      }

      const startTime = Date.now();
      
      setFiles(prev => prev.map((f, idx) => 
        f.file === fileItem.file ? { 
          ...f, 
          status: 'uploading', 
          progress: 0,
          estimatedTime: estimateUploadTime(f.file.size)
        } : f
      ));

      try {
        // Simulate chunked upload with progress updates
        const progressInterval = setInterval(() => {
          setFiles(prev => prev.map((f, idx) => {
            if (f.file === fileItem.file && f.status === 'uploading') {
              const newProgress = Math.min(f.progress + Math.random() * 20, 95);
              const elapsed = (Date.now() - startTime) / 1000;
              const speed = (f.file.size * newProgress / 100) / elapsed;
              
              return { 
                ...f, 
                progress: newProgress,
                uploadSpeed: speed,
                estimatedTime: speed > 0 ? (f.file.size - (f.file.size * newProgress / 100)) / speed : undefined
              };
            }
            return f;
          }));
          updateGlobalProgress();
        }, 500);

        await uploadMutation.mutateAsync({
          file: fileItem.file,
          categoryId: fileItem.categoryId!
        });

        clearInterval(progressInterval);
        
        setFiles(prev => prev.map((f, idx) => 
          f.file === fileItem.file ? { ...f, status: 'success', progress: 100 } : f
        ));
      } catch (error) {
        setFiles(prev => prev.map((f, idx) => 
          f.file === fileItem.file ? { 
            ...f, 
            status: 'error', 
            error: error instanceof Error ? error.message : 'Error desconocido'
          } : f
        ));
      }
      
      updateGlobalProgress();
    };

    // Process files with concurrency control
    const promises = sortedFiles
      .filter(f => f.status === 'pending' && !f.isDuplicate)
      .map((fileItem, index) => uploadFile(fileItem, index));
    
    await Promise.allSettled(promises);

    // Upload links
    for (let i = 0; i < links.length; i++) {
      const linkItem = links[i];
      if (linkItem.status !== 'pending') continue;

      setLinks(prev => prev.map((l, idx) => 
        idx === i ? { ...l, status: 'uploading', progress: 50 } : l
      ));

      try {
        await linkUploadMutation.mutateAsync({
          url: linkItem.url,
          title: linkItem.title,
          categoryId: linkItem.categoryId!
        });

        setLinks(prev => prev.map((l, idx) => 
          idx === i ? { ...l, status: 'success', progress: 100 } : l
        ));
      } catch (error) {
        setLinks(prev => prev.map((l, idx) => 
          idx === i ? { 
            ...l, 
            status: 'error', 
            error: error instanceof Error ? error.message : 'Error desconocido'
          } : l
        ));
      }
    }

    // Calculate total time
    if (uploadStartTime) {
      setTotalUploadTime((Date.now() - uploadStartTime) / 1000);
    }

    updateGlobalProgress();
    
    toast({
      title: "Carga completada",
      description: `Se procesaron ${files.length + links.length} elementos`
    });
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const videoFormats = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'];
    const imageFormats = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    
    if (videoFormats.includes(ext || '')) return <Video className="w-4 h-4" />;
    if (imageFormats.includes(ext || '')) return <FileImage className="w-4 h-4" />;
    if (ext === 'pdf' || ext === 'doc' || ext === 'docx') return <FileText className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        className={`border-4 border-dashed rounded-xl p-16 text-center transition-all duration-300 min-h-[400px] flex flex-col justify-center ${
          isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 scale-105 shadow-lg'
            : 'border-blue-300 dark:border-blue-400 hover:border-blue-400 dark:hover:border-blue-300 bg-blue-50/30 dark:bg-blue-950/10 hover:bg-blue-50/50 dark:hover:bg-blue-950/20'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="space-y-8">
          <div className="mx-auto w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-8 shadow-xl">
            <Upload className="w-16 h-16 text-white" />
          </div>
          
          <div className="space-y-4">
            <h3 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Zona de Carga Masiva Avanzada
            </h3>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Arrastra y suelta archivos aquí o usa los botones para cargar múltiples documentos, imágenes y videos de hasta 100MB cada uno
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
              <FileText className="w-8 h-8 text-blue-500 mb-3" />
              <h4 className="font-semibold mb-2">Documentos</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">PDF, DOC, DOCX, XLS, PPT y más</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
              <FileImage className="w-8 h-8 text-green-500 mb-3" />
              <h4 className="font-semibold mb-2">Imágenes</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">JPG, PNG, HEIC, RAW y más</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
              <Video className="w-8 h-8 text-purple-500 mb-3" />
              <h4 className="font-semibold mb-2">Videos</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">MP4, AVI, MOV, WebM y más</p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
              size="lg"
            >
              <Upload className="w-5 h-5 mr-2" />
              Seleccionar Archivos
            </Button>
            
            <Button
              onClick={() => folderInputRef.current?.click()}
              variant="outline"
              size="lg"
              className="border-2 border-blue-300 hover:border-blue-400 text-blue-600 hover:text-blue-700 shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <Upload className="w-5 h-5 mr-2" />
              Cargar Carpeta
            </Button>
            
            <Button
              onClick={() => setShowLinkForm(!showLinkForm)}
              variant="outline"
              size="lg"
              className="border-2 border-purple-300 hover:border-purple-400 text-purple-600 hover:text-purple-700 shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <Link2 className="w-5 h-5 mr-2" />
              Agregar Enlaces
            </Button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && processFiles(e.target.files)}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg,.tiff,.ico,.heic,.heif,.mp4,.avi,.mov,.wmv,.flv,.webm,.mkv"
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          webkitdirectory="true"
          className="hidden"
          onChange={(e) => e.target.files && processFiles(e.target.files)}
        />
      </div>

      {/* Link Form */}
      {showLinkForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Agregar Enlaces
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="single-link">Enlace individual</Label>
              <div className="flex gap-2">
                <Input
                  id="single-link"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="https://ejemplo.com/documento.pdf"
                />
                <Button onClick={addLink} disabled={!linkInput.trim()}>
                  Agregar
                </Button>
              </div>
            </div>
            
            <div>
              <Label htmlFor="bulk-links">Enlaces múltiples (uno por línea)</Label>
              <Textarea
                id="bulk-links"
                value={bulkLinksInput}
                onChange={(e) => setBulkLinksInput(e.target.value)}
                placeholder="https://ejemplo.com/doc1.pdf&#10;https://ejemplo.com/doc2.pdf&#10;https://ejemplo.com/doc3.pdf"
                rows={4}
              />
              <Button 
                onClick={addBulkLinks} 
                disabled={!bulkLinksInput.trim()}
                className="mt-2"
              >
                Agregar Enlaces
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Advanced Controls Panel */}
      {(files.length > 0 || links.length > 0) && (
        <div className="space-y-4">
          {/* Global Progress Bar */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Progreso Global</span>
              <span className="text-sm text-gray-600">{Math.round(globalProgress)}%</span>
            </div>
            <Progress value={globalProgress} className="h-3 mb-2" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{files.filter(f => f.status === 'success').length + links.filter(l => l.status === 'success').length} completados</span>
              <span>{files.filter(f => f.status === 'uploading').length + links.filter(l => l.status === 'uploading').length} cargando</span>
              <span>{files.filter(f => f.status === 'pending').length + links.filter(l => l.status === 'pending').length} pendientes</span>
            </div>
          </div>

          {/* Control Panel */}
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
              
              {/* File Type Filter */}
              <div>
                <Label className="text-xs font-medium text-gray-600">Filtrar por tipo:</Label>
                <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <Filter className="w-3 h-3" />
                        Todos los archivos
                      </div>
                    </SelectItem>
                    <SelectItem value="documents">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3 h-3" />
                        Documentos
                      </div>
                    </SelectItem>
                    <SelectItem value="images">
                      <div className="flex items-center gap-2">
                        <FileImage className="w-3 h-3" />
                        Imágenes
                      </div>
                    </SelectItem>
                    <SelectItem value="videos">
                      <div className="flex items-center gap-2">
                        <Video className="w-3 h-3" />
                        Videos
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Default Category */}
              <div>
                <Label className="text-xs font-medium text-gray-600">Categoría por defecto:</Label>
                <Select
                  value={defaultCategoryId?.toString() || ""}
                  onValueChange={(value) => {
                    const categoryId = parseInt(value);
                    setDefaultCategoryId(categoryId);
                    // Apply to all pending files
                    setFiles(prev => prev.map(file => 
                      file.status === 'pending' ? { ...file, categoryId } : file
                    ));
                  }}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id.toString()}>
                        <div className="flex items-center gap-2">
                          <i className={`${category.icon} text-[${category.color}]`} />
                          {category.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Upload Controls */}
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  onClick={toggleUpload}
                  variant={uploadPaused ? "default" : "secondary"}
                  className="h-8"
                >
                  {uploadPaused ? <Play className="w-3 h-3 mr-1" /> : <Pause className="w-3 h-3 mr-1" />}
                  {uploadPaused ? 'Reanudar' : 'Pausar'}
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => {
                    setFiles([]);
                    setLinks([]);
                    setGlobalProgress(0);
                  }}
                  variant="outline"
                  className="h-8"
                >
                  <X className="w-3 h-3 mr-1" />
                  Limpiar
                </Button>
              </div>

              {/* Queue Stats */}
              <div className="text-xs text-gray-600 space-y-1">
                <div>Total: {files.length + links.length}</div>
                <div className="flex gap-3">
                  <span className="text-green-600">✓ {files.filter(f => f.status === 'success').length + links.filter(l => l.status === 'success').length}</span>
                  <span className="text-blue-600">⟳ {files.filter(f => f.status === 'uploading').length + links.filter(l => l.status === 'uploading').length}</span>
                  <span className="text-red-600">✗ {files.filter(f => f.status === 'error').length + links.filter(l => l.status === 'error').length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Files and Links List */}
      {(files.length > 0 || links.length > 0) && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold">
              Elementos a cargar ({files.length + links.length})
              {files.length > 0 && <span className="text-sm text-gray-500 ml-2">• {files.length} archivos</span>}
              {links.length > 0 && <span className="text-sm text-gray-500 ml-2">• {links.length} enlaces</span>}
            </h4>
            
            <Button
              onClick={uploadFiles}
              disabled={uploadMutation.isPending || linkUploadMutation.isPending}
              className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
            >
              {uploadMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Cargando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Iniciar Carga ({files.filter(f => f.status === 'pending').length + links.filter(l => l.status === 'pending').length})
                </>
              )}
            </Button>
          </div>

          {/* Files */}
          {getFilteredFiles().map((fileItem, index) => (
            <div key={index} className={`p-4 border rounded-lg space-y-3 ${
              fileItem.isDuplicate ? 'border-orange-300 bg-orange-50' : 
              fileItem.status === 'success' ? 'border-green-300 bg-green-50' :
              fileItem.status === 'error' ? 'border-red-300 bg-red-50' :
              fileItem.status === 'uploading' ? 'border-blue-300 bg-blue-50' :
              'border-gray-300 bg-gray-50'
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 flex-1">
                  {getFileIcon(fileItem.file.name)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h5 className="font-medium text-sm">{fileItem.file.name}</h5>
                      {fileItem.isDuplicate && (
                        <Badge variant="outline" className="text-orange-600 border-orange-300">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Duplicado
                        </Badge>
                      )}
                      {fileItem.suggestedCategory && (
                        <Badge variant="outline" className="text-blue-600 border-blue-300">
                          <Zap className="w-3 h-3 mr-1" />
                          IA: {fileItem.suggestedCategory.categoryName} ({Math.round(fileItem.suggestedCategory.confidence)}%)
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{formatFileSize(fileItem.file.size)}</span>
                      {fileItem.uploadSpeed && (
                        <span>⚡ {formatFileSize(fileItem.uploadSpeed)}/s</span>
                      )}
                      {fileItem.estimatedTime && (
                        <span><Clock className="w-3 h-3 inline mr-1" />{formatTime(fileItem.estimatedTime)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Priority Selector */}
                  <Select 
                    value={fileItem.priority} 
                    onValueChange={(value: any) => updateFilePriority(index, value)}
                  >
                    <SelectTrigger className="w-20 h-6 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">🔴 Urgente</SelectItem>
                      <SelectItem value="high">🟡 Alta</SelectItem>
                      <SelectItem value="normal">⚪ Normal</SelectItem>
                      <SelectItem value="low">🔵 Baja</SelectItem>
                    </SelectContent>
                  </Select>

                  {fileItem.status === 'error' && (
                    <Button size="sm" variant="outline" onClick={() => retryFile(index)}>
                      <RotateCcw className="w-3 h-3" />
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => removeFile(index)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Progress Bar */}
              {fileItem.status === 'uploading' && (
                <div>
                  <Progress value={fileItem.progress} className="h-2" />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{Math.round(fileItem.progress)}%</span>
                    <span>{fileItem.uploadSpeed ? `${formatFileSize(fileItem.uploadSpeed)}/s` : ''}</span>
                  </div>
                </div>
              )}

              {/* Category Selection */}
              <div className="flex items-center gap-4">
                <Label className="text-xs font-medium">Categoría:</Label>
                <Select
                  value={fileItem.categoryId?.toString() || ""}
                  onValueChange={(value) => {
                    const categoryId = parseInt(value);
                    setFiles(prev => prev.map((f, i) => 
                      i === index ? { ...f, categoryId } : f
                    ));
                  }}
                >
                  <SelectTrigger className="w-48 h-8">
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id.toString()}>
                        <div className="flex items-center gap-2">
                          <i className={`${category.icon} text-[${category.color}]`} />
                          {category.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  {fileItem.status === 'pending' && (
                    <span className="text-xs text-gray-500">Listo</span>
                  )}
                  {fileItem.status === 'uploading' && (
                    <div className="flex items-center gap-1">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                      <span className="text-xs text-blue-600">Cargando...</span>
                    </div>
                  )}
                  {fileItem.status === 'success' && (
                    <div className="flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      <span className="text-xs text-green-600">Completado</span>
                    </div>
                  )}
                  {fileItem.status === 'error' && (
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-red-500" />
                      <span className="text-xs text-red-600">Error: {fileItem.error}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Links */}
          {links.map((linkItem, index) => (
            <div key={`link-${index}`} className={`p-4 border rounded-lg space-y-3 ${
              linkItem.status === 'success' ? 'border-green-300 bg-green-50' :
              linkItem.status === 'error' ? 'border-red-300 bg-red-50' :
              linkItem.status === 'uploading' ? 'border-blue-300 bg-blue-50' :
              'border-gray-300 bg-gray-50'
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Link2 className="w-4 h-4" />
                  <div className="flex-1">
                    <h5 className="font-medium text-sm">{linkItem.title}</h5>
                    <p className="text-xs text-gray-500 truncate">{linkItem.url}</p>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeLink(index)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              {/* Progress Bar */}
              {linkItem.status === 'uploading' && (
                <Progress value={linkItem.progress} className="h-2" />
              )}

              {/* Category Selection */}
              <div className="flex items-center gap-4">
                <Label className="text-xs font-medium">Categoría:</Label>
                <Select
                  value={linkItem.categoryId?.toString() || ""}
                  onValueChange={(value) => {
                    const categoryId = parseInt(value);
                    setLinks(prev => prev.map((l, i) => 
                      i === index ? { ...l, categoryId } : l
                    ));
                  }}
                >
                  <SelectTrigger className="w-48 h-8">
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id.toString()}>
                        <div className="flex items-center gap-2">
                          <i className={`${category.icon} text-[${category.color}]`} />
                          {category.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  {linkItem.status === 'pending' && (
                    <span className="text-xs text-gray-500">Listo</span>
                  )}
                  {linkItem.status === 'uploading' && (
                    <div className="flex items-center gap-1">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                      <span className="text-xs text-blue-600">Procesando...</span>
                    </div>
                  )}
                  {linkItem.status === 'success' && (
                    <div className="flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      <span className="text-xs text-green-600">Completado</span>
                    </div>
                  )}
                  {linkItem.status === 'error' && (
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-red-500" />
                      <span className="text-xs text-red-600">Error: {linkItem.error}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}