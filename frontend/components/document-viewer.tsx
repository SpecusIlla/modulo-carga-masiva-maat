import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText, X, Maximize2, Minimize2 } from 'lucide-react';

interface DocumentViewerProps {
  document: {
    id: number;
    title: string;
    filename: string;
    fileSize: string;
    uploadDate: string;
    status: string;
    categoryId: number;
  };
  onClose: () => void;
}

export default function DocumentViewer({ document: doc, onClose }: DocumentViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const viewUrl = `/api/documents/${doc.id}/view`;

  useEffect(() => {
    // Prevent body scroll when modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = `/api/documents/${doc.id}/download`;
    link.download = doc.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleNativeView = async () => {
    try {
      // Show loading state by temporarily disabling the button
      const button = document.querySelector('[data-native-view]') as HTMLButtonElement;
      if (button) {
        button.disabled = true;
        button.textContent = 'Preparando...';
      }

      const response = await fetch(`/api/documents/${doc.id}/temp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const { viewUrl } = await response.json();
        window.open(viewUrl, '_blank');
      } else {
        const error = await response.json();
        console.error('Error creating temporary view:', error.message);
        alert('No se pudo preparar el documento para visualización nativa');
      }
    } catch (error) {
      console.error('Error opening native view:', error);
      alert('Error al abrir el documento en formato original');
    } finally {
      // Reset button state
      const button = document.querySelector('[data-native-view]') as HTMLButtonElement;
      if (button) {
        button.disabled = false;
        button.innerHTML = '<FileText className="w-4 h-4 mr-2" />Formato Original';
      }
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-[9999]"
      onClick={handleBackdropClick}
    >
      <div className={`bg-white rounded-lg shadow-2xl flex flex-col ${
        isFullscreen 
          ? 'w-full h-full rounded-none' 
          : 'w-[95vw] h-[95vh] max-w-7xl'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-lg">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold truncate text-gray-900">{doc.title}</h3>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                {doc.filename}
              </span>
              <span>{doc.fileSize}</span>
              <span>{doc.uploadDate}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="hidden sm:flex"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNativeView}
              data-native-view
              className="bg-green-50 hover:bg-green-100 border-green-200 text-green-700 font-medium"
            >
              <FileText className="w-4 h-4 mr-2" />
              Formato Original
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
            >
              <Download className="w-4 h-4 mr-2" />
              Descargar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 bg-gray-100 relative">
          <div className="h-full bg-white rounded border shadow-inner">
            <iframe
              src={viewUrl}
              className="w-full h-full border-0 rounded"
              title={`Vista previa de ${doc.filename}`}
              onLoad={() => setIsLoading(false)}
            />
            {isLoading && (
              <div className="absolute inset-4 flex items-center justify-center bg-white rounded">
                <div className="flex flex-col items-center gap-3 text-gray-600">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  <span className="text-lg font-medium">Cargando documento...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}