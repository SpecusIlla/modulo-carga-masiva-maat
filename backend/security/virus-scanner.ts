import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

interface ScanResult {
  isClean: boolean;
  threats: string[];
  scanTime: number;
  fileHash: string;
  scanEngine: string;
  confidence: number;
}

interface ContentAnalysis {
  isMalicious: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  threats: Array<{
    type: string;
    description: string;
    severity: number;
  }>;
  fileType: string;
  entropy: number;
  suspiciousPatterns: string[];
}

export class AdvancedVirusScanner {
  private quarantineDir: string;
  private scanCache: Map<string, ScanResult>;
  private threatSignatures: Map<string, RegExp>;

  constructor() {
    this.quarantineDir = path.join(process.cwd(), 'quarantine');
    this.scanCache = new Map();
    this.threatSignatures = new Map();
    this.initializeSecurityDatabase();
  }

  private async initializeSecurityDatabase() {
    try {
      await fs.mkdir(this.quarantineDir, { recursive: true });
      
      // Initialize threat signatures database
      this.threatSignatures.set('suspicious_js', /eval\s*\(|document\.write|window\.location|\.innerHTML\s*=|script.*src/gi);
      this.threatSignatures.set('malicious_pdf', /%PDF.*\/JavaScript|\/JS|\/Action/gi);
      this.threatSignatures.set('macro_virus', /Auto_Open|Workbook_Open|Document_Open|Shell|WScript/gi);
      this.threatSignatures.set('executable_embed', /MZ\x90\x00\x03|PE\x00\x00|ELF/g);
      this.threatSignatures.set('suspicious_urls', /bit\.ly|tinyurl|t\.co|goo\.gl|short\.link/gi);
      
      console.log('[SECURITY] Virus scanner initialized with threat database');
    } catch (error) {
      console.error('[SECURITY] Failed to initialize virus scanner:', error);
    }
  }

  async scanFile(filePath: string, originalName: string): Promise<ScanResult> {
    const startTime = Date.now();
    
    try {
      // Calculate file hash for caching
      const fileBuffer = await fs.readFile(filePath);
      const fileHash = createHash('sha256').update(fileBuffer).digest('hex');
      
      // Check cache first
      if (this.scanCache.has(fileHash)) {
        const cached = this.scanCache.get(fileHash)!;
        console.log(`[SECURITY] Using cached scan result for ${originalName}`);
        return cached;
      }

      // Perform multi-layered scanning
      const results = await Promise.all([
        this.signatureBasedScan(fileBuffer, originalName),
        this.heuristicAnalysis(fileBuffer, originalName),
        this.behavioralAnalysis(filePath, originalName),
        this.entropyAnalysis(fileBuffer)
      ]);

      const threats: string[] = [];
      let isClean = true;
      let confidence = 100;

      // Aggregate results
      results.forEach(result => {
        if (result.threats.length > 0) {
          threats.push(...result.threats);
          isClean = false;
          confidence = Math.min(confidence, result.confidence);
        }
      });

      const scanResult: ScanResult = {
        isClean,
        threats,
        scanTime: Date.now() - startTime,
        fileHash,
        scanEngine: 'MAAT-AdvancedScanner-v1.0',
        confidence
      };

      // Cache result
      this.scanCache.set(fileHash, scanResult);

      // Quarantine if threats found
      if (!isClean) {
        await this.quarantineFile(filePath, originalName, threats);
      }

      console.log(`[SECURITY] Scanned ${originalName}: ${isClean ? 'CLEAN' : 'THREATS DETECTED'} (${scanResult.scanTime}ms)`);
      return scanResult;

    } catch (error) {
      console.error(`[SECURITY] Scan failed for ${originalName}:`, error);
      return {
        isClean: false,
        threats: ['SCAN_ERROR: Unable to complete security scan'],
        scanTime: Date.now() - startTime,
        fileHash: '',
        scanEngine: 'MAAT-AdvancedScanner-v1.0',
        confidence: 0
      };
    }
  }

  private async signatureBasedScan(buffer: Buffer, fileName: string): Promise<{ threats: string[], confidence: number }> {
    const threats: string[] = [];
    const content = buffer.toString('utf8');
    
    for (const [threatName, pattern] of this.threatSignatures.entries()) {
      if (pattern.test(content)) {
        threats.push(`SIGNATURE_THREAT: ${threatName.toUpperCase()}`);
      }
    }

    // Check for known malicious file signatures
    const magicBytes = buffer.slice(0, 16).toString('hex');
    const suspiciousMagics = [
      '4d5a9000', // PE executable
      '504b0304', // ZIP (could contain malicious content)
      '377abcaf271c', // 7z archive
      'd0cf11e0a1b11ae1' // Microsoft Office (macro risk)
    ];

    if (suspiciousMagics.some(magic => magicBytes.startsWith(magic))) {
      threats.push('SUSPICIOUS_FILE_TYPE: Potentially dangerous file format');
    }

    return { threats, confidence: threats.length > 0 ? 50 : 95 };
  }

  private async heuristicAnalysis(buffer: Buffer, fileName: string): Promise<{ threats: string[], confidence: number }> {
    const threats: string[] = [];
    const content = buffer.toString('utf8');

    // Analyze file extension vs content mismatch
    const ext = path.extname(fileName).toLowerCase();
    const realType = this.detectFileType(buffer);
    
    if (ext !== realType && realType === '.exe') {
      threats.push('HEURISTIC_THREAT: File extension mismatch - executable disguised');
    }

    // Check for obfuscated content
    const suspiciousPatterns = [
      /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\xFF]{20,}/g, // High byte values
      /[A-Za-z0-9+/]{100,}={0,2}/g, // Potential base64
      /\\x[0-9a-fA-F]{2}/g, // Hex encoding
      /%[0-9a-fA-F]{2}/g // URL encoding
    ];

    suspiciousPatterns.forEach((pattern, index) => {
      const matches = content.match(pattern);
      if (matches && matches.length > 5) {
        threats.push(`HEURISTIC_THREAT: Suspicious encoding pattern detected (type ${index + 1})`);
      }
    });

    // Check for script injection attempts
    const injectionPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=\s*["'][^"']*["']/gi,
      /\$\([^)]*\)\.html\(/gi
    ];

    injectionPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        threats.push('HEURISTIC_THREAT: Potential script injection detected');
      }
    });

    return { threats, confidence: threats.length > 0 ? 60 : 90 };
  }

  private async behavioralAnalysis(filePath: string, fileName: string): Promise<{ threats: string[], confidence: number }> {
    const threats: string[] = [];

    // Check file size anomalies
    const stats = await fs.stat(filePath);
    const ext = path.extname(fileName).toLowerCase();

    // Suspicious size patterns
    if (stats.size === 0) {
      threats.push('BEHAVIORAL_THREAT: Zero-byte file (potential placeholder attack)');
    } else if (stats.size > 500 * 1024 * 1024) { // 500MB
      threats.push('BEHAVIORAL_THREAT: Unusually large file (potential zip bomb)');
    }

    // Check for suspicious file names
    const suspiciousNames = [
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i,
      /\.(exe|bat|cmd|scr|pif|com)$/i,
      /[<>:"|?*]/,
      /\x00/,
      /^\./
    ];

    suspiciousNames.forEach(pattern => {
      if (pattern.test(fileName)) {
        threats.push('BEHAVIORAL_THREAT: Suspicious filename pattern');
      }
    });

    return { threats, confidence: threats.length > 0 ? 70 : 85 };
  }

  private async entropyAnalysis(buffer: Buffer): Promise<{ threats: string[], confidence: number }> {
    const threats: string[] = [];
    
    // Calculate Shannon entropy
    const entropy = this.calculateEntropy(buffer);
    
    // High entropy might indicate compression, encryption, or obfuscation
    if (entropy > 7.5) {
      threats.push('ENTROPY_THREAT: High entropy content (potential encryption/obfuscation)');
    } else if (entropy < 1.0) {
      threats.push('ENTROPY_THREAT: Very low entropy (potential padding attack)');
    }

    return { threats, confidence: threats.length > 0 ? 65 : 80 };
  }

  private calculateEntropy(buffer: Buffer): number {
    const freq: { [key: number]: number } = {};
    const length = buffer.length;

    // Count byte frequencies
    for (let i = 0; i < length; i++) {
      const byte = buffer[i];
      freq[byte] = (freq[byte] || 0) + 1;
    }

    // Calculate entropy
    let entropy = 0;
    Object.values(freq).forEach(count => {
      const p = count / length;
      entropy -= p * Math.log2(p);
    });

    return entropy;
  }

  private detectFileType(buffer: Buffer): string {
    const magicBytes = buffer.slice(0, 16).toString('hex');
    
    const signatures: { [key: string]: string } = {
      '89504e47': '.png',
      'ffd8ffe0': '.jpg',
      'ffd8ffe1': '.jpg',
      '47494638': '.gif',
      '25504446': '.pdf',
      '504b0304': '.zip',
      'd0cf11e0': '.doc',
      '4d5a9000': '.exe',
      '7f454c46': '.elf',
      '504b0708': '.docx'
    };

    for (const [magic, ext] of Object.entries(signatures)) {
      if (magicBytes.startsWith(magic)) {
        return ext;
      }
    }

    return '.unknown';
  }

  private async quarantineFile(filePath: string, originalName: string, threats: string[]): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const quarantineName = `${timestamp}_${originalName}`;
      const quarantinePath = path.join(this.quarantineDir, quarantineName);
      
      await fs.copyFile(filePath, quarantinePath);
      
      // Create threat report
      const report = {
        originalName,
        quarantineTime: new Date().toISOString(),
        threats,
        originalPath: filePath,
        quarantinePath
      };
      
      await fs.writeFile(
        path.join(this.quarantineDir, `${quarantineName}.report.json`),
        JSON.stringify(report, null, 2)
      );

      console.log(`[SECURITY] File quarantined: ${originalName} -> ${quarantineName}`);
    } catch (error) {
      console.error('[SECURITY] Failed to quarantine file:', error);
    }
  }

  async analyzeContent(buffer: Buffer, mimeType: string): Promise<ContentAnalysis> {
    const threats: Array<{ type: string; description: string; severity: number }> = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const suspiciousPatterns: string[] = [];

    // Content-specific analysis based on MIME type
    if (mimeType.includes('javascript') || mimeType.includes('text/html')) {
      const jsThreats = this.analyzeJavaScriptContent(buffer.toString());
      threats.push(...jsThreats);
    }

    if (mimeType.includes('pdf')) {
      const pdfThreats = this.analyzePDFContent(buffer);
      threats.push(...pdfThreats);
    }

    if (mimeType.includes('office') || mimeType.includes('msword')) {
      const officeThreats = this.analyzeOfficeContent(buffer);
      threats.push(...officeThreats);
    }

    // Determine risk level
    const maxSeverity = Math.max(...threats.map(t => t.severity), 0);
    if (maxSeverity >= 9) riskLevel = 'critical';
    else if (maxSeverity >= 7) riskLevel = 'high';
    else if (maxSeverity >= 4) riskLevel = 'medium';

    return {
      isMalicious: threats.length > 0,
      riskLevel,
      threats,
      fileType: mimeType,
      entropy: this.calculateEntropy(buffer),
      suspiciousPatterns
    };
  }

  private analyzeJavaScriptContent(content: string): Array<{ type: string; description: string; severity: number }> {
    const threats: Array<{ type: string; description: string; severity: number }> = [];

    const dangerousPatterns = [
      { pattern: /eval\s*\(/, type: 'Code Injection', description: 'eval() function detected', severity: 8 },
      { pattern: /document\.write/, type: 'DOM Manipulation', description: 'document.write() usage', severity: 6 },
      { pattern: /\.innerHTML\s*=/, type: 'XSS Risk', description: 'innerHTML assignment', severity: 7 },
      { pattern: /window\.location/, type: 'Redirect Attack', description: 'Window location manipulation', severity: 5 },
      { pattern: /XMLHttpRequest/, type: 'Network Request', description: 'AJAX request detected', severity: 4 },
      { pattern: /fetch\s*\(/, type: 'Network Request', description: 'Fetch API usage', severity: 4 }
    ];

    dangerousPatterns.forEach(({ pattern, type, description, severity }) => {
      if (pattern.test(content)) {
        threats.push({ type, description, severity });
      }
    });

    return threats;
  }

  private analyzePDFContent(buffer: Buffer): Array<{ type: string; description: string; severity: number }> {
    const threats: Array<{ type: string; description: string; severity: number }> = [];
    const content = buffer.toString('binary');

    const pdfThreats = [
      { pattern: /\/JavaScript/, type: 'PDF JavaScript', description: 'Embedded JavaScript in PDF', severity: 9 },
      { pattern: /\/JS/, type: 'PDF Script', description: 'Script object in PDF', severity: 8 },
      { pattern: /\/Launch/, type: 'PDF Launch', description: 'Launch action in PDF', severity: 7 },
      { pattern: /\/GoToR/, type: 'PDF Remote', description: 'Remote goto action', severity: 6 }
    ];

    pdfThreats.forEach(({ pattern, type, description, severity }) => {
      if (pattern.test(content)) {
        threats.push({ type, description, severity });
      }
    });

    return threats;
  }

  private analyzeOfficeContent(buffer: Buffer): Array<{ type: string; description: string; severity: number }> {
    const threats: Array<{ type: string; description: string; severity: number }> = [];
    const content = buffer.toString('binary');

    const macroPatterns = [
      { pattern: /Auto_Open/, type: 'Office Macro', description: 'Auto-execution macro detected', severity: 9 },
      { pattern: /Workbook_Open/, type: 'Office Macro', description: 'Workbook open macro', severity: 8 },
      { pattern: /Document_Open/, type: 'Office Macro', description: 'Document open macro', severity: 8 },
      { pattern: /Shell/, type: 'System Command', description: 'Shell command execution', severity: 10 },
      { pattern: /WScript/, type: 'Script Execution', description: 'Windows Script Host usage', severity: 9 }
    ];

    macroPatterns.forEach(({ pattern, type, description, severity }) => {
      if (pattern.test(content)) {
        threats.push({ type, description, severity });
      }
    });

    return threats;
  }

  async getQuarantinedFiles(): Promise<Array<{ name: string; date: string; threats: string[] }>> {
    try {
      const files = await fs.readdir(this.quarantineDir);
      const reports = files.filter(f => f.endsWith('.report.json'));
      
      const quarantinedFiles = await Promise.all(
        reports.map(async (reportFile) => {
          const reportPath = path.join(this.quarantineDir, reportFile);
          const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
          return {
            name: report.originalName,
            date: report.quarantineTime,
            threats: report.threats
          };
        })
      );

      return quarantinedFiles;
    } catch (error) {
      console.error('[SECURITY] Failed to list quarantined files:', error);
      return [];
    }
  }

  async cleanQuarantine(olderThanDays: number = 30): Promise<number> {
    try {
      const files = await fs.readdir(this.quarantineDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      let cleanedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(this.quarantineDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          cleanedCount++;
        }
      }

      console.log(`[SECURITY] Cleaned ${cleanedCount} old quarantine files`);
      return cleanedCount;
    } catch (error) {
      console.error('[SECURITY] Failed to clean quarantine:', error);
      return 0;
    }
  }
}

export const virusScanner = new AdvancedVirusScanner();