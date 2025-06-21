
/**
 * Documentación OpenAPI 3.0 para Sistema MAAT v1.3.0
 * API REST completa con autenticación JWT y validación de esquemas
 */

import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Sistema MAAT API',
      version: '1.3.0',
      description: 'API REST para módulo de carga masiva con IA integrada',
      contact: {
        name: 'MAAT Support',
        email: 'support@maat.system'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000/api/v1',
        description: 'Servidor de desarrollo'
      },
      {
        url: 'https://maat-api.replit.app/api/v1',
        description: 'Servidor de producción'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      },
      schemas: {
        UploadResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                fileId: { type: 'string' },
                fileName: { type: 'string' },
                fileSize: { type: 'number' },
                hash: { type: 'string' },
                mimeType: { type: 'string' },
                url: { type: 'string' },
                categoryId: { type: 'number' },
                scanResults: { $ref: '#/components/schemas/ScanResults' },
                metadata: { $ref: '#/components/schemas/FileMetadata' }
              }
            },
            timestamp: { type: 'string', format: 'date-time' },
            requestId: { type: 'string' }
          }
        },
        ScanResults: {
          type: 'object',
          properties: {
            clean: { type: 'boolean' },
            engine: { type: 'string' },
            version: { type: 'string' },
            scanTime: { type: 'number' },
            threats: {
              type: 'array',
              items: { $ref: '#/components/schemas/ThreatInfo' }
            }
          }
        },
        ThreatInfo: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['virus', 'malware', 'trojan', 'suspicious'] },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            description: { type: 'string' }
          }
        },
        FileMetadata: {
          type: 'object',
          properties: {
            mimeType: { type: 'string' },
            actualType: { type: 'string' },
            fileSignature: { type: 'string' },
            entropy: { type: 'number' },
            embeddedContent: { type: 'boolean' },
            suspiciousPatterns: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' }
              }
            },
            timestamp: { type: 'string', format: 'date-time' },
            requestId: { type: 'string' }
          }
        }
      }
    },
    security: [
      { bearerAuth: [] },
      { apiKey: [] }
    ]
  },
  apis: ['./backend/routes/*.ts', './backend/api/*.ts']
};

export const specs = swaggerJSDoc(options);

// Rutas de documentación
export const swaggerRoutes = {
  '/docs': swaggerUi.serve,
  '/docs/*': swaggerUi.setup(specs, {
    explorer: true,
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { color: #1f2937 }
    `,
    customSiteTitle: 'MAAT API Documentation'
  })
};

/**
 * @swagger
 * /upload/initialize:
 *   post:
 *     summary: Inicializar sesión de carga
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fileName
 *               - fileSize
 *               - totalChunks
 *             properties:
 *               fileName:
 *                 type: string
 *                 description: Nombre del archivo
 *               fileSize:
 *                 type: number
 *                 description: Tamaño del archivo en bytes
 *               totalChunks:
 *                 type: number
 *                 description: Número total de chunks
 *               metadata:
 *                 type: object
 *                 description: Metadatos adicionales
 *     responses:
 *       200:
 *         description: Sesión inicializada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uploadId:
 *                   type: string
 *                 chunkSize:
 *                   type: number
 *                 compressed:
 *                   type: boolean
 *                 encrypted:
 *                   type: boolean
 *       400:
 *         description: Parámetros inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Límite de cargas paralelas alcanzado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 * 
 * /upload/{uploadId}/chunk:
 *   post:
 *     summary: Cargar chunk de archivo
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uploadId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la sesión de carga
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               chunk:
 *                 type: string
 *                 format: binary
 *               chunkNumber:
 *                 type: number
 *               hash:
 *                 type: string
 *     responses:
 *       200:
 *         description: Chunk procesado exitosamente
 *       404:
 *         description: Sesión de carga no encontrada
 * 
 * /files/{fileId}:
 *   get:
 *     summary: Obtener información de archivo
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Información del archivo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UploadResponse'
 *   delete:
 *     summary: Eliminar archivo
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Archivo eliminado exitosamente
 *       404:
 *         description: Archivo no encontrado
 * 
 * /health:
 *   get:
 *     summary: Estado de salud del sistema
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Estado del sistema
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, warning, critical]
 *                 uptime:
 *                   type: number
 *                 version:
 *                   type: string
 *                 metrics:
 *                   type: object
 * 
 * /metrics:
 *   get:
 *     summary: Métricas de rendimiento
 *     tags: [System]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Métricas del sistema
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 performance:
 *                   type: object
 *                 cache:
 *                   type: object
 *                 uploads:
 *                   type: object
 */
