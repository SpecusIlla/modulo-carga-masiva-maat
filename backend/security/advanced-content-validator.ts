// Validador avanzado de contenido de archivos
// Módulo de Carga v1.0.0 - Mejoras de seguridad

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

interface ValidationResult {
  isValid: boolean;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  issues: string[];
  metadata: FileMetadata;
  scanTime: number;
}

interface FileMetadata {
  mimeType: string;
  actualType: string;
  fileSignature: string;
  entropy: number;
  embeddedContent: boolean;
  suspiciousPatterns: string[];
}

interface FileSignature {
  extension: string;
  signature: Buffer;
  offset: number;
}

export class AdvancedContentValidator {
  private knownSignatures: Map<string, FileSignature[]>;
  private suspiciousPatterns: RegExp[];
  private maxScanSize = 10 * 1024 * 1024; // 10MB máximo para escaneo profundo

  constructor() {
    this.initializeSignatures();
    this.initializeSuspiciousPatterns();
  }

  private initializeSignatures(): void {
    this.knownSignatures = new Map([
      ['pdf', [
        { extension: 'pdf', signature: Buffer.from([0x25, 0x50, 0x44, 0x46]), offset: 0 }
      ]],
      ['jpg', [
        { extension: 'jpg', signature: Buffer.from([0xFF, 0xD8, 0xFF]), offset: 0 }
      ]],
      ['png', [
        { extension: 'png', signature: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), offset: 0 }
      ]],
      ['docx', [
        { extension: 'docx', signature: Buffer.from([0x50, 0x4B, 0x03, 0x04]), offset: 0 }
      ]],
      ['zip', [
        { extension: 'zip', signature: Buffer.from([0x50, 0x4B, 0x03, 0x04]), offset: 0 }
      ]]
    ]);
  }

  private initializeSuspiciousPatterns(): void {
    this.suspiciousPatterns = [
      /eval\s*\(/gi,                    // JavaScript eval
      /<script[^>]*>/gi,                // Script tags
      /javascript:/gi,                  // JavaScript protocol
      /vbscript:/gi,                    // VBScript protocol
      /onload\s*=/gi,                   // Event handlers
      /onclick\s*=/gi,
      /onerror\s*=/gi,
      /\$\{.*\}/g,                      // Template literals
      /<%[\s\S]*?%>/g,                  // Server-side includes
      /\.\.[\/\\]/g,                    // Directory traversal
      /cmd\.exe/gi,                     // Windows commands
      /\/bin\/sh/gi,                    // Unix shell
      /base64/gi,                       // Base64 encoding
      /fromCharCode/gi,                 // Character encoding
      /String\.fromCharCode/gi,
      /unescape/gi,                     // URL decoding
      /decodeURIComponent/gi
    ];
  }

  async validateFile(filePath: string, originalName: string): Promise<ValidationResult> {
    const startTime = Date.now();
    const issues: string[] = [];
    let threatLevel: ValidationResult['threatLevel'] = 'low';

    try {
      const stats = await fs.stat(filePath);
      const fileBuffer = await fs.readFile(filePath, { 
        flag: 'r',
        signal: AbortSignal.timeout(30000) // 30 segundos timeout
      });

      // Validar tamaño para escaneo profundo
      const scanBuffer = stats.size > this.maxScanSize 
        ? fileBuffer.slice(0, this.maxScanSize)
        : fileBuffer;

      // 1. Verificar firma de archivo vs extensión
      const signatureValidation = this.validateFileSignature(scanBuffer, originalName);
      if (!signatureValidation.isValid) {
        issues.push(`Firma de archivo no coincide con extensión: ${signatureValidation.reason}`);
        threatLevel = this.escalateThreatLevel(threatLevel, 'medium');
      }

      // 2. Calcular entropía para detectar contenido cifrado/comprimido
      const entropy = this.calculateEntropy(scanBuffer);
      if (entropy > 7.5) {
        issues.push('Alta entropía detectada - posible contenido cifrado o comprimido');
        threatLevel = this.escalateThreatLevel(threatLevel, 'medium');
      }

      // 3. Buscar patrones sospechosos
      const suspiciousContent = this.scanForSuspiciousContent(scanBuffer);
      if (suspiciousContent.length > 0) {
        issues.push(...suspiciousContent.map(pattern => `Patrón sospechoso: ${pattern}`));
        threatLevel = this.escalateThreatLevel(threatLevel, 'high');
      }

      // 4. Detectar contenido embebido
      const embeddedContent = this.detectEmbeddedContent(scanBuffer);
      if (embeddedContent.detected) {
        issues.push(`Contenido embebido detectado: ${embeddedContent.types.join(', ')}`);
        threatLevel = this.escalateThreatLevel(threatLevel, 'medium');
      }

      // 5. Validar metadatos EXIF/XMP para imágenes
      if (this.isImageFile(originalName)) {
        const metadataIssues = await this.validateImageMetadata(scanBuffer);
        if (metadataIssues.length > 0) {
          issues.push(...metadataIssues);
          threatLevel = this.escalateThreatLevel(threatLevel, 'medium');
        }
      }

      const metadata: FileMetadata = {
        mimeType: this.detectMimeType(scanBuffer),
        actualType: signatureValidation.detectedType || 'unknown',
        fileSignature: scanBuffer.slice(0, 16).toString('hex'),
        entropy,
        embeddedContent: embeddedContent.detected,
        suspiciousPatterns: suspiciousContent
      };

      return {
        isValid: threatLevel !== 'critical' && threatLevel !== 'high',
        threatLevel,
        issues,
        metadata,
        scanTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        isValid: false,
        threatLevel: 'critical',
        issues: [`Error durante validación: ${error instanceof Error ? error.message : 'Error desconocido'}`],
        metadata: {
          mimeType: 'unknown',
          actualType: 'unknown',
          fileSignature: '',
          entropy: 0,
          embeddedContent: false,
          suspiciousPatterns: []
        },
        scanTime: Date.now() - startTime
      };
    }
  }

  private validateFileSignature(buffer: Buffer, filename: string): { isValid: boolean; reason?: string; detectedType?: string } {
    const extension = path.extname(filename).toLowerCase().substring(1);
    const signatures = this.knownSignatures.get(extension);

    if (!signatures) {
      return { isValid: true }; // No hay firmas conocidas para esta extensión
    }

    for (const sig of signatures) {
      const headerSlice = buffer.slice(sig.offset, sig.offset + sig.signature.length);
      if (headerSlice.equals(sig.signature)) {
        return { isValid: true, detectedType: sig.extension };
      }
    }

    // Intentar detectar el tipo real
    for (const [type, sigs] of this.knownSignatures) {
      for (const sig of sigs) {
        const headerSlice = buffer.slice(sig.offset, sig.offset + sig.signature.length);
        if (headerSlice.equals(sig.signature)) {
          return { 
            isValid: false, 
            reason: `Archivo aparenta ser ${type} pero tiene extensión ${extension}`,
            detectedType: type
          };
        }
      }
    }

    return { isValid: false, reason: 'Firma de archivo no reconocida' };
  }

  private calculateEntropy(buffer: Buffer): number {
    const frequencies = new Array(256).fill(0);

    for (let i = 0; i < buffer.length; i++) {
      frequencies[buffer[i]]++;
    }

    let entropy = 0;
    const length = buffer.length;

    for (let i = 0; i < 256; i++) {
      if (frequencies[i] > 0) {
        const probability = frequencies[i] / length;
        entropy -= probability * Math.log2(probability);
      }
    }

    return entropy;
  }

  private scanForSuspiciousContent(buffer: Buffer): string[] {
    const content = buffer.toString('utf8', 0, Math.min(buffer.length, 1024 * 1024)); // 1MB máximo
    const found: string[] = [];

    for (const pattern of this.suspiciousPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        found.push(pattern.toString());
      }
    }

    return found;
  }

  private detectEmbeddedContent(buffer: Buffer): { detected: boolean; types: string[] } {
    const types: string[] = [];

    // Buscar firmas de archivos embebidos
    const commonSignatures = [
      { type: 'ZIP', signature: Buffer.from([0x50, 0x4B, 0x03, 0x04]) },
      { type: 'PDF', signature: Buffer.from([0x25, 0x50, 0x44, 0x46]) },
      { type: 'JPEG', signature: Buffer.from([0xFF, 0xD8, 0xFF]) },
      { type: 'PNG', signature: Buffer.from([0x89, 0x50, 0x4E, 0x47]) },
      { type: 'EXE', signature: Buffer.from([0x4D, 0x5A]) }
    ];

    for (let i = 100; i < buffer.length - 10; i++) { // Saltar header inicial
      for (const sig of commonSignatures) {
        if (buffer.slice(i, i + sig.signature.length).equals(sig.signature)) {
          if (!types.includes(sig.type)) {
            types.push(sig.type);
          }
        }
      }
    }

    return { detected: types.length > 0, types };
  }

  private async validateImageMetadata(buffer: Buffer): Promise<string[]> {
    const issues: string[] = [];

    try {
      // Buscar metadatos EXIF sospechosos
      const exifStart = buffer.indexOf('Exif');
      if (exifStart !== -1) {
        const exifData = buffer.slice(exifStart, Math.min(exifStart + 1000, buffer.length));
        const exifString = exifData.toString('ascii');

        // Buscar patrones sospechosos en metadatos
        if (exifString.includes('script') || exifString.includes('javascript')) {
          issues.push('Script detectado en metadatos EXIF');
        }

        if (exifString.includes('<?php') || exifString.includes('<%')) {
          issues.push('Código de servidor detectado en metadatos');
        }
      }
    } catch (error) {
      // Error al procesar metadatos, no crítico
    }

    return issues;
  }

  private detectMimeType(buffer: Buffer): string {
    const header = buffer.slice(0, 16);

    if (header.slice(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46]))) return 'application/pdf';
    if (header.slice(0, 3).equals(Buffer.from([0xFF, 0xD8, 0xFF]))) return 'image/jpeg';
    if (header.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
    if (header.slice(0, 4).equals(Buffer.from([0x50, 0x4B, 0x03, 0x04]))) return 'application/zip';

    return 'application/octet-stream';
  }

  private isImageFile(filename: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'];
    const ext = path.extname(filename).toLowerCase();
    return imageExtensions.includes(ext);
  }

  private escalateThreatLevel(
    current: ValidationResult['threatLevel'], 
    proposed: ValidationResult['threatLevel']
  ): ValidationResult['threatLevel'] {
    const levels = { low: 0, medium: 1, high: 2, critical: 3 };
    const currentLevel = levels[current];
    const proposedLevel = levels[proposed];

    return proposedLevel > currentLevel ? proposed : current;
  }
}

export const advancedValidator = new AdvancedContentValidator();
async validateFile(
    file: Buffer,
    filename: string,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    try {
      console.log(`[CONTENT_VALIDATOR] Validando archivo: ${filename}`);

      // Validación de virus (si está disponible)
      let virusScanResult: boolean = true;
      try {
        const virusScanner = await import('./virus-scanner');
        virusScanResult = await virusScanner.virusScanner.scanBuffer(file, filename);
      } catch (error) {
        console.warn('[CONTENT_VALIDATOR] Virus scanner no disponible, continuando...');
      }

      // Validación básica de seguridad - implementación compatible
      const scanResult = await this.performSecurityScan(file, filename);

      // Validación de integridad de archivo - implementación básica
      const integrityResult = await this.checkFileIntegrity(file, filename);
constructor() {
    // Inicialización básica - sin dependencias externas
  }

  /**
   * Escaneo básico de seguridad para archivos
   */
  private async performSecurityScan(file: Buffer, filename: string): Promise<boolean> {
    try {
      // Validación básica de tamaño
      if (file.length > 100 * 1024 * 1024) { // 100MB límite
        return false;
      }

      // Validación básica de tipo de archivo por extensión
      const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.jpg', '.png', '.zip'];
      const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));

      if (!allowedExtensions.includes(extension)) {
        return false;
      }

      // Escaneo básico de contenido malicioso
      const content = file.toString('utf8', 0, Math.min(1024, file.length));
      const maliciousPatterns = ['<script', 'javascript:', 'vbscript:', 'onload='];

      for (const pattern of maliciousPatterns) {
        if (content.toLowerCase().includes(pattern)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('[CONTENT_VALIDATOR] Error en escaneo de seguridad:', error);
      return false;
    }
  }

  /**
   * Verificación básica de integridad de archivo
   */
  private async checkFileIntegrity(file: Buffer, filename: string): Promise<boolean> {
    try {
      // Verificación básica de integridad
      if (file.length === 0) {
        return false;
      }

      // Verificar que el archivo no esté corrupto (validación básica)
      const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));

      switch (extension) {
        case '.pdf':
          return file.subarray(0, 4).toString() === '%PDF';
        case '.jpg':
        case '.jpeg':
          return file.subarray(0, 2).toString('hex') === 'ffd8';
        case '.png':
          return file.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
        case '.zip':
          return file.subarray(0, 2).toString('hex') === '504b';
        default:
          return true; // Asumir válido para otros tipos
      }
    } catch (error) {
      console.error('[CONTENT_VALIDATOR] Error en verificación de integridad:', error);
      return false;
    }
  }