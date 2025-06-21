/**
 * Documentación OpenAPI 3.0 para Sistema MAAT v1.3.1
 * API REST completa con autenticación JWT y validación de esquemas
 */

import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MAAT v1.3.1 API',
      version: '1.3.1',
      description: 'Sistema Empresarial de Carga Masiva - API REST Completa',
      contact: {
        name: 'MAAT Support',
        email: 'support@maat.com'
      }
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:5000',
        description: 'Servidor de desarrollo'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        FileUpload: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            filename: { type: 'string' },
            originalName: { type: 'string' },
            size: { type: 'number' },
            mimeType: { type: 'string' },
            hash: { type: 'string' },
            uploadedAt: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] }
          }
        },
        BulkUploadResult: {
          type: 'object',
          properties: {
            totalFiles: { type: 'number' },
            successfulUploads: { type: 'number' },
            failedUploads: { type: 'number' },
            results: {
              type: 'array',
              items: { $ref: '#/components/schemas/FileUpload' }
            }
          }
        },
        HealthStatus: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'down'] },
            timestamp: { type: 'string', format: 'date-time' },
            services: { type: 'object' },
            version: { type: 'string' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            code: { type: 'number' }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./backend/routes/*.ts', './backend/api/*.ts']
};

const specs = swaggerJSDoc(options);

export { specs, swaggerUi };