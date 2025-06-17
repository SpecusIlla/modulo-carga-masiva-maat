# MÓDULO DE CARGA MASIVA AUTOCONTENIDO v1.0.1
🟡 Jinn del Equilibrio, la Verdad y la Trazabilidad

## GUÍA DE IMPLEMENTACIÓN PARA AVICEN

### PASO 1: INSTALACIÓN EN TU REPLIT AVICEN

#### 1.1 Copia los archivos del módulo
```bash
# En tu proyecto Avicen, crear carpeta del módulo
mkdir -p src/modules/bulk-upload

# Copiar archivos desde MAAT
cp -r modulo-carga-export/* src/modules/bulk-upload/
```

#### 1.2 Instala las dependencias requeridas
```bash
npm install @tanstack/react-query lucide-react
```

### PASO 2: CONFIGURACIÓN BÁSICA

#### 2.1 Importar el módulo en tu página
```tsx
// En tu componente de Avicen (ejemplo: src/pages/Upload.tsx)
import { BulkUploadZone } from '@/modules/bulk-upload';
import type { BulkUploadZoneProps } from '@/modules/bulk-upload';

function UploadPage() {
  const categories = [
    { id: 1, name: "Documentos", color: "blue", icon: "FileText" },
    { id: 2, name: "Imágenes", color: "green", icon: "Image" },
    { id: 3, name: "Videos", color: "purple", icon: "Video" }
  ];

  const handleUploadComplete = () => {
    console.log("Carga completada!");
    // Actualizar tu estado de Avicen aquí
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Carga Masiva - Avicen</h1>
      
      <BulkUploadZone
        projectId={1} // Tu ID de proyecto de Avicen
        categories={categories}
        onUploadComplete={handleUploadComplete}
        apiBaseUrl="https://tu-avicen-app.replit.app" // Tu URL de Avicen
        config={{
          maxFileSize: 50 * 1024 * 1024, // 50MB para Avicen
          concurrentUploads: 5,
          enableAI: true,
          apiEndpoints: {
            upload: '/api/avicen/upload',
            batchUpload: '/api/avicen/batch-upload',
            classify: '/api/avicen/classify',
            categories: '/api/avicen/categories'
          }
        }}
      />
    </div>
  );
}

export default UploadPage;
```

### PASO 3: CONFIGURAR APIs EN AVICEN

#### 3.1 API de carga individual
```tsx
// server/routes.ts en Avicen
app.post('/api/avicen/upload', async (req, res) => {
  try {
    const { file, projectId, categoryId } = req.body;
    
    // Tu lógica de Avicen para guardar archivos
    const result = await avicenStorage.saveFile({
      file,
      projectId,
      categoryId,
      uploadedAt: new Date()
    });
    
    res.json({ success: true, fileId: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### 3.2 API de categorías
```tsx
// En tu servidor de Avicen
app.get('/api/avicen/categories', async (req, res) => {
  const categories = await avicenDatabase.getCategories();
  res.json(categories);
});
```

### PASO 4: PERSONALIZACIÓN VISUAL

#### 4.1 Ajustar colores de Avicen
```css
/* En tu archivo CSS de Avicen */
.bulk-upload-zone {
  --primary-color: #your-avicen-blue;
  --secondary-color: #your-avicen-gray;
  --accent-color: #your-avicen-accent;
}
```

#### 4.2 Personalizar textos
```tsx
const customTexts = {
  title: "Carga Masiva Avicen",
  subtitle: "Procesamiento inteligente de documentos",
  dragMessage: "Arrastra tus archivos de Avicen aquí"
};
```

### PASO 5: FUNCIONALIDADES INCLUIDAS

#### ✅ YA FUNCIONA AUTOMÁTICAMENTE:
- **Drag & Drop masivo**: Carpetas completas
- **Clasificación IA**: Sugerencias automáticas
- **Detección duplicados**: Hash SHA-256
- **Estadísticas en vivo**: Métricas detalladas
- **Reportes descargables**: Análisis completo
- **Cola inteligente**: Procesamiento optimizado
- **Validación de archivos**: Tamaños y tipos
- **Progreso granular**: Estado individual y global

#### 🔧 PERSONALIZACIONES DISPONIBLES:
- **Límites de archivo**: Configurable por proyecto
- **Tipos permitidos**: Lista personalizada
- **Endpoints API**: URLs específicas de Avicen
- **Concurrencia**: Ajustable según servidor
- **Interfaz visual**: Colores y textos

### PASO 6: EJEMPLO COMPLETO DE INTEGRACIÓN

```tsx
// src/pages/AvicenUpload.tsx
import { useState } from 'react';
import { BulkUploadZone } from '@/modules/bulk-upload';
import { useQuery } from '@tanstack/react-query';

export default function AvicenUpload() {
  const [uploadStats, setUploadStats] = useState(null);
  
  // Cargar categorías desde tu API de Avicen
  const { data: categories } = useQuery({
    queryKey: ['/api/avicen/categories'],
    queryFn: () => fetch('/api/avicen/categories').then(r => r.json())
  });

  const handleUploadComplete = () => {
    // Actualizar dashboard de Avicen
    window.location.reload(); // O tu método de actualización
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Avicen - Carga Masiva
          </h1>
          <p className="text-gray-600 mt-2">
            Sistema autocontenido de procesamiento de documentos
          </p>
        </header>

        {categories && (
          <BulkUploadZone
            projectId={1}
            categories={categories}
            onUploadComplete={handleUploadComplete}
            apiBaseUrl=""
            config={{
              maxFileSize: 100 * 1024 * 1024,
              concurrentUploads: 8,
              enableAI: true,
              enableDuplicateDetection: true,
              apiEndpoints: {
                upload: '/api/avicen/upload',
                batchUpload: '/api/avicen/batch-upload',
                classify: '/api/avicen/classify',
                categories: '/api/avicen/categories'
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
```

### PASO 7: TESTEO Y VALIDACIÓN

#### 7.1 Prueba básica
1. Arrastra un archivo simple
2. Verifica que se clasifique automáticamente
3. Confirma que se suba correctamente

#### 7.2 Prueba masiva
1. Arrastra una carpeta con subcarpetas
2. Revisa las estadísticas generadas
3. Descarga el reporte completo

#### 7.3 Verificar integración
1. Comprueba que los archivos aparezcan en tu base de datos de Avicen
2. Valida que las categorías se asignen correctamente
3. Confirma que los duplicados se detecten

### SOPORTE Y MANTENIMIENTO

El módulo es completamente autocontenido y no requiere actualizaciones frecuentes. Todas las funcionalidades están integradas y probadas.

Para dudas específicas de implementación, revisa los logs del navegador y verifica que las APIs de Avicen respondan correctamente.

---
**Módulo probado y funcionando en Sistema MAAT v1.0.1**
*Listo para producción en Avicen*