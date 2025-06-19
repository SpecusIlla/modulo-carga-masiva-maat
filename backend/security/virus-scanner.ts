
import { createHash } from 'crypto';
import { spawn, exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ScanResult {
  isClean: boolean;
  threats: string[];
  scanTime: number;
  fileHash: string;
  scanEngine: string;
  confidence: number;
  clamavResult?: ClamAVResult;
  deepAnalysis?: DeepAnalysisResult;
}

interface ClamAVResult {
  status: 'clean' | 'infected' | 'error';
  virusName?: string;
  engineVersion: string;
  definitionsDate: string;
}

interface DeepAnalysisResult {
  fileStructure: any;
  embeddedFiles: string[];
  suspiciousStrings: string[];
  networkConnections: string[];
  registryModifications: string[];
  processCreation: string[];
}

interface ThreatSignature {
  id: string;
  name: string;
  pattern: RegExp | Buffer;
  type: 'regex' | 'binary' | 'hash';
  severity: number;
  description: string;
  lastUpdated: Date;
}

export class AdvancedVirusScanner {
  private quarantineDir: string;
  private scanCache: Map<string, ScanResult>;
  private threatSignatures: Map<string, ThreatSignature>;
  private clamavAvailable: boolean = false;
  private signaturesLastUpdate: Date;
  private signaturesUpdateInterval: NodeJS.Timeout;

  constructor() {
    this.quarantineDir = path.join(process.cwd(), 'quarantine');
    this.scanCache = new Map();
    this.threatSignatures = new Map();
    this.signaturesLastUpdate = new Date(0);
    this.initializeSecurityDatabase();
    this.checkClamAVAvailability();
    this.startSignatureUpdateScheduler();
  }

  private async initializeSecurityDatabase() {
    try {
      await fs.mkdir(this.quarantineDir, { recursive: true });
      await fs.mkdir(path.join(this.quarantineDir, 'reports'), { recursive: true });
      await fs.mkdir(path.join(process.cwd(), 'signatures'), { recursive: true });
      
      // Load threat signatures from database
      await this.loadThreatSignatures();
      
      console.log('[SECURITY] Advanced virus scanner initialized');
    } catch (error) {
      console.error('[SECURITY] Failed to initialize virus scanner:', error);
    }
  }

  private async checkClamAVAvailability(): Promise<void> {
    try {
      const { stdout } = await execAsync('clamscan --version');
      this.clamavAvailable = stdout.includes('ClamAV');
      console.log(`[SECURITY] ClamAV ${this.clamavAvailable ? 'available' : 'not available'}`);
      
      if (this.clamavAvailable) {
        await this.updateClamAVSignatures();
      }
    } catch (error) {
      this.clamavAvailable = false;
      console.log('[SECURITY] ClamAV not installed, using internal scanner only');
    }
  }

  private async updateClamAVSignatures(): Promise<void> {
    if (!this.clamavAvailable) return;
    
    try {
      console.log('[SECURITY] Updating ClamAV virus signatures...');
      await execAsync('freshclam --quiet');
      console.log('[SECURITY] ClamAV signatures updated successfully');
    } catch (error) {
      console.error('[SECURITY] Failed to update ClamAV signatures:', error);
    }
  }

  private async loadThreatSignatures(): Promise<void> {
    // Load built-in signatures
    const builtinSignatures: ThreatSignature[] = [
      {
        id: 'js_eval_injection',
        name: 'JavaScript Eval Injection',
        pattern: /eval\s*\(\s*[^)]*\s*\)/gi,
        type: 'regex',
        severity: 9,
        description: 'Potential code injection via eval()',
        lastUpdated: new Date()
      },
      {
        id: 'pdf_javascript',
        name: 'PDF JavaScript Exploit',
        pattern: /\/JavaScript\s*\(/gi,
        type: 'regex',
        severity: 8,
        description: 'JavaScript execution in PDF document',
        lastUpdated: new Date()
      },
      {
        id: 'office_macro_autoopen',
        name: 'Office AutoOpen Macro',
        pattern: /Auto_Open|Workbook_Open|Document_Open/gi,
        type: 'regex',
        severity: 7,
        description: 'Automatically executing macro detected',
        lastUpdated: new Date()
      },
      {
        id: 'shell_command_execution',
        name: 'Shell Command Execution',
        pattern: /Shell\s*\(|WScript\.Shell|cmd\.exe|powershell/gi,
        type: 'regex',
        severity: 10,
        description: 'Shell command execution attempt',
        lastUpdated: new Date()
      },
      {
        id: 'pe_executable_magic',
        name: 'Windows PE Executable',
        pattern: Buffer.from([0x4D, 0x5A]), // MZ header
        type: 'binary',
        severity: 6,
        description: 'Windows executable file detected',
        lastUpdated: new Date()
      },
      {
        id: 'elf_executable_magic',
        name: 'Linux ELF Executable',
        pattern: Buffer.from([0x7F, 0x45, 0x4C, 0x46]), // ELF header
        type: 'binary',
        severity: 6,
        description: 'Linux executable file detected',
        lastUpdated: new Date()
      }
    ];

    builtinSignatures.forEach(sig => {
      this.threatSignatures.set(sig.id, sig);
    });

    // Load custom signatures from file
    try {
      const signaturesPath = path.join(process.cwd(), 'signatures', 'custom-signatures.json');
      const customSigs = await fs.readFile(signaturesPath, 'utf8');
      const parsedSigs = JSON.parse(customSigs);
      
      parsedSigs.forEach((sig: any) => {
        this.threatSignatures.set(sig.id, {
          ...sig,
          pattern: sig.type === 'regex' ? new RegExp(sig.pattern, 'gi') : Buffer.from(sig.pattern, 'hex'),
          lastUpdated: new Date(sig.lastUpdated)
        });
      });
    } catch (error) {
      // Custom signatures file doesn't exist yet
      console.log('[SECURITY] No custom signatures found, using built-in signatures only');
    }

    console.log(`[SECURITY] Loaded ${this.threatSignatures.size} threat signatures`);
  }

  private startSignatureUpdateScheduler(): void {
    // Update signatures every 6 hours
    this.signaturesUpdateInterval = setInterval(async () => {
      await this.updateThreatSignatures();
    }, 6 * 60 * 60 * 1000);
  }

  private async updateThreatSignatures(): Promise<void> {
    try {
      console.log('[SECURITY] Checking for signature updates...');
      
      // Update ClamAV signatures
      if (this.clamavAvailable) {
        await this.updateClamAVSignatures();
      }

      // Update custom signatures (simulate downloading from threat intelligence feed)
      await this.downloadLatestSignatures();
      
      this.signaturesLastUpdate = new Date();
      console.log('[SECURITY] Threat signatures updated successfully');
    } catch (error) {
      console.error('[SECURITY] Failed to update threat signatures:', error);
    }
  }

  private async downloadLatestSignatures(): Promise<void> {
    // In a real implementation, this would download from a threat intelligence feed
    // For now, we'll simulate by adding some additional signatures
    
    const newSignatures: ThreatSignature[] = [
      {
        id: 'crypto_miner_pattern',
        name: 'Cryptocurrency Miner',
        pattern: /stratum\+tcp|mining\.pool|cryptonight|scrypt|ethash/gi,
        type: 'regex',
        severity: 8,
        description: 'Cryptocurrency mining software detected',
        lastUpdated: new Date()
      },
      {
        id: 'ransomware_extension',
        name: 'Ransomware File Extension',
        pattern: /\.locked|\.encrypted|\.crypto|\.cerber|\.locky/gi,
        type: 'regex',
        severity: 10,
        description: 'Ransomware encrypted file pattern',
        lastUpdated: new Date()
      }
    ];

    newSignatures.forEach(sig => {
      this.threatSignatures.set(sig.id, sig);
    });
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

      // Perform comprehensive scanning
      const results = await Promise.all([
        this.signatureBasedScan(fileBuffer, originalName),
        this.heuristicAnalysis(fileBuffer, originalName),
        this.behavioralAnalysis(filePath, originalName),
        this.entropyAnalysis(fileBuffer),
        this.clamavAvailable ? this.scanWithClamAV(filePath) : null,
        this.performDeepAnalysis(fileBuffer, originalName)
      ]);

      const threats: string[] = [];
      let isClean = true;
      let confidence = 100;
      let clamavResult: ClamAVResult | undefined;
      let deepAnalysis: DeepAnalysisResult | undefined;

      // Process internal scan results
      results.slice(0, 4).forEach(result => {
        if (result && result.threats.length > 0) {
          threats.push(...result.threats);
          isClean = false;
          confidence = Math.min(confidence, result.confidence);
        }
      });

      // Process ClamAV result
      if (results[4]) {
        clamavResult = results[4] as ClamAVResult;
        if (clamavResult.status === 'infected') {
          threats.push(`CLAMAV_DETECTION: ${clamavResult.virusName}`);
          isClean = false;
          confidence = Math.min(confidence, 90);
        }
      }

      // Process deep analysis result
      if (results[5]) {
        deepAnalysis = results[5] as DeepAnalysisResult;
        if (deepAnalysis.suspiciousStrings.length > 0 || 
            deepAnalysis.networkConnections.length > 0 ||
            deepAnalysis.processCreation.length > 0) {
          threats.push('DEEP_ANALYSIS: Suspicious behavior patterns detected');
          confidence = Math.min(confidence, 70);
        }
      }

      const scanResult: ScanResult = {
        isClean,
        threats,
        scanTime: Date.now() - startTime,
        fileHash,
        scanEngine: 'MAAT-AdvancedScanner-v1.1.0',
        confidence,
        clamavResult,
        deepAnalysis
      };

      // Cache result
      this.scanCache.set(fileHash, scanResult);

      // Quarantine if threats found
      if (!isClean) {
        await this.quarantineFile(filePath, originalName, threats, scanResult);
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
        scanEngine: 'MAAT-AdvancedScanner-v1.1.0',
        confidence: 0
      };
    }
  }

  private async scanWithClamAV(filePath: string): Promise<ClamAVResult> {
    try {
      const { stdout, stderr } = await execAsync(`clamscan --no-summary "${filePath}"`);
      
      // Get ClamAV version and definitions info
      const { stdout: versionInfo } = await execAsync('clamscan --version');
      const engineVersion = versionInfo.split('\n')[0];
      
      const { stdout: dbInfo } = await execAsync('sigtool --info /var/lib/clamav/daily.cvd 2>/dev/null || echo "Unknown"');
      const definitionsDate = dbInfo.includes('Build time:') ? 
        dbInfo.split('Build time:')[1].split('\n')[0].trim() : 'Unknown';

      if (stdout.includes('FOUND')) {
        const virusName = stdout.split(':')[1].trim().replace(' FOUND', '');
        return {
          status: 'infected',
          virusName,
          engineVersion,
          definitionsDate
        };
      } else {
        return {
          status: 'clean',
          engineVersion,
          definitionsDate
        };
      }
    } catch (error) {
      return {
        status: 'error',
        engineVersion: 'Unknown',
        definitionsDate: 'Unknown'
      };
    }
  }

  private async performDeepAnalysis(buffer: Buffer, fileName: string): Promise<DeepAnalysisResult> {
    const result: DeepAnalysisResult = {
      fileStructure: {},
      embeddedFiles: [],
      suspiciousStrings: [],
      networkConnections: [],
      registryModifications: [],
      processCreation: []
    };

    const content = buffer.toString('utf8');
    
    // Analyze file structure based on type
    const ext = path.extname(fileName).toLowerCase();
    
    if (['.zip', '.docx', '.xlsx', '.pptx'].includes(ext)) {
      result.embeddedFiles = await this.analyzeArchiveStructure(buffer);
    }

    // Look for suspicious strings
    const suspiciousPatterns = [
      /https?:\/\/[^\s]+\.(?:tk|ml|ga|cf|pw|bit\.ly|tinyurl)/gi, // Suspicious domains
      /(?:cmd|powershell|bash)\s+[^\r\n]+/gi, // Command execution
      /(?:wget|curl|invoke-webrequest)\s+[^\r\n]+/gi, // Downloads
      /(?:127\.0\.0\.1|localhost|0\.0\.0\.0):\d+/gi, // Local network connections
      /(?:password|pass|pwd|token|key)\s*[:=]\s*[^\s]+/gi, // Credentials
      /(?:bitcoin|btc|ethereum|eth|monero|xmr)\s*[a-zA-Z0-9]{20,}/gi // Crypto addresses
    ];

    suspiciousPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        result.suspiciousStrings.push(...matches.slice(0, 10)); // Limit to first 10 matches
      }
    });

    // Network connection patterns
    const networkPatterns = [
      /(?:connect|socket|request)\s*\(\s*["']([^"']+)["']/gi,
      /(?:http|https|ftp|tcp|udp):\/\/([^\s]+)/gi
    ];

    networkPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        result.networkConnections.push(...matches.slice(0, 5));
      }
    });

    // Registry modification patterns (Windows)
    const registryPatterns = [
      /HKEY_[A-Z_]+\\[^\r\n]+/gi,
      /RegWrite|RegDelete|RegCreateKey/gi
    ];

    registryPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        result.registryModifications.push(...matches.slice(0, 5));
      }
    });

    // Process creation patterns
    const processPatterns = [
      /CreateProcess|ShellExecute|WinExec/gi,
      /exec\s*\(\s*["']([^"']+)["']/gi,
      /system\s*\(\s*["']([^"']+)["']/gi
    ];

    processPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        result.processCreation.push(...matches.slice(0, 5));
      }
    });

    return result;
  }

  private async analyzeArchiveStructure(buffer: Buffer): Promise<string[]> {
    // Basic ZIP file structure analysis
    const embeddedFiles: string[] = [];
    
    try {
      // Look for ZIP file signatures and extract file names
      const content = buffer.toString('binary');
      const fileEntries = content.match(/[\x00-\xFF]{30}[^\x00]+\.[\w]{1,4}/g);
      
      if (fileEntries) {
        fileEntries.forEach(entry => {
          const fileName = entry.slice(30).replace(/[^\x20-\x7E]/g, '');
          if (fileName.length > 0 && fileName.length < 100) {
            embeddedFiles.push(fileName);
          }
        });
      }
    } catch (error) {
      // Archive analysis failed
    }

    return embeddedFiles.slice(0, 20); // Limit to first 20 files
  }

  private async signatureBasedScan(buffer: Buffer, fileName: string): Promise<{ threats: string[], confidence: number }> {
    const threats: string[] = [];
    const content = buffer.toString('utf8');
    const binaryContent = buffer;
    
    for (const [threatId, signature] of this.threatSignatures.entries()) {
      let matches = false;
      
      if (signature.type === 'regex' && signature.pattern instanceof RegExp) {
        matches = signature.pattern.test(content);
      } else if (signature.type === 'binary' && Buffer.isBuffer(signature.pattern)) {
        matches = binaryContent.includes(signature.pattern);
      }
      
      if (matches) {
        threats.push(`SIGNATURE_THREAT: ${signature.name} (Severity: ${signature.severity})`);
      }
    }

    return { threats, confidence: threats.length > 0 ? 85 : 95 };
  }

  private async heuristicAnalysis(buffer: Buffer, fileName: string): Promise<{ threats: string[], confidence: number }> {
    const threats: string[] = [];
    const content = buffer.toString('utf8');

    // File extension analysis
    const ext = path.extname(fileName).toLowerCase();
    const realType = this.detectFileType(buffer);
    
    if (ext !== realType && ['.exe', '.bat', '.cmd', '.scr'].includes(realType)) {
      threats.push('HEURISTIC_THREAT: Executable file disguised with different extension');
    }

    // Obfuscation detection
    const obfuscationScore = this.calculateObfuscationScore(content);
    if (obfuscationScore > 7) {
      threats.push(`HEURISTIC_THREAT: High obfuscation score (${obfuscationScore}/10)`);
    }

    // Packing detection
    const packingEntropy = this.calculateEntropy(buffer);
    if (packingEntropy > 7.8) {
      threats.push('HEURISTIC_THREAT: High entropy suggests file packing or encryption');
    }

    // Suspicious API calls
    const suspiciousAPIs = [
      'VirtualAlloc', 'WriteProcessMemory', 'CreateRemoteThread',
      'SetWindowsHookEx', 'GetProcAddress', 'LoadLibrary'
    ];

    suspiciousAPIs.forEach(api => {
      if (content.includes(api)) {
        threats.push(`HEURISTIC_THREAT: Suspicious API call detected: ${api}`);
      }
    });

    return { threats, confidence: threats.length > 0 ? 75 : 90 };
  }

  private calculateObfuscationScore(content: string): number {
    let score = 0;
    
    // Base64 encoding detection
    const base64Matches = content.match(/[A-Za-z0-9+/]{40,}={0,2}/g);
    if (base64Matches && base64Matches.length > 3) score += 2;
    
    // Hex encoding detection
    const hexMatches = content.match(/\\x[0-9a-fA-F]{2}/g);
    if (hexMatches && hexMatches.length > 20) score += 2;
    
    // URL encoding detection
    const urlMatches = content.match(/%[0-9a-fA-F]{2}/g);
    if (urlMatches && urlMatches.length > 10) score += 1;
    
    // String concatenation patterns
    const concatPatterns = content.match(/["'][^"']*["']\s*\+\s*["'][^"']*["']/g);
    if (concatPatterns && concatPatterns.length > 5) score += 2;
    
    // Character substitution patterns
    const charSubstitution = content.match(/String\.fromCharCode|chr\(|char\(/g);
    if (charSubstitution && charSubstitution.length > 3) score += 3;
    
    return Math.min(score, 10);
  }

  private async behavioralAnalysis(filePath: string, fileName: string): Promise<{ threats: string[], confidence: number }> {
    const threats: string[] = [];

    try {
      const stats = await fs.stat(filePath);
      
      // Size-based analysis
      if (stats.size === 0) {
        threats.push('BEHAVIORAL_THREAT: Zero-byte file (potential placeholder)');
      } else if (stats.size > 1024 * 1024 * 1024) { // 1GB
        threats.push('BEHAVIORAL_THREAT: Extremely large file (potential zip bomb)');
      }

      // Filename analysis
      const suspiciousNames = [
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i, // Windows reserved names
        /\.(exe|bat|cmd|scr|pif|com)$/i, // Executable extensions
        /[<>:"|?*\x00-\x1f]/, // Invalid characters
        /^\s+|\s+$/, // Leading/trailing spaces
        /\.{2,}/, // Multiple dots
        /.{200,}/ // Extremely long names
      ];

      suspiciousNames.forEach((pattern, index) => {
        if (pattern.test(fileName)) {
          threats.push(`BEHAVIORAL_THREAT: Suspicious filename pattern (type ${index + 1})`);
        }
      });

      // Timestamp analysis
      const now = new Date();
      const fileAge = now.getTime() - stats.mtime.getTime();
      const futureTime = stats.mtime.getTime() - now.getTime();
      
      if (futureTime > 0) {
        threats.push('BEHAVIORAL_THREAT: File has future timestamp (time manipulation)');
      }

    } catch (error) {
      threats.push('BEHAVIORAL_THREAT: Unable to analyze file properties');
    }

    return { threats, confidence: threats.length > 0 ? 70 : 85 };
  }

  private async entropyAnalysis(buffer: Buffer): Promise<{ threats: string[], confidence: number }> {
    const threats: string[] = [];
    const entropy = this.calculateEntropy(buffer);
    
    if (entropy > 7.8) {
      threats.push(`ENTROPY_THREAT: Very high entropy (${entropy.toFixed(2)}) - possible encryption/compression`);
    } else if (entropy < 1.0) {
      threats.push(`ENTROPY_THREAT: Very low entropy (${entropy.toFixed(2)}) - possible padding attack`);
    } else if (entropy > 7.0) {
      threats.push(`ENTROPY_THREAT: High entropy (${entropy.toFixed(2)}) - possible obfuscation`);
    }

    return { threats, confidence: threats.length > 0 ? 80 : 90 };
  }

  private calculateEntropy(buffer: Buffer): number {
    const freq: { [key: number]: number } = {};
    const length = buffer.length;

    for (let i = 0; i < length; i++) {
      const byte = buffer[i];
      freq[byte] = (freq[byte] || 0) + 1;
    }

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
      'ffd8ffe2': '.jpg',
      '47494638': '.gif',
      '25504446': '.pdf',
      '504b0304': '.zip',
      '504b0506': '.zip',
      '504b0708': '.zip',
      'd0cf11e0': '.doc',
      '4d5a9000': '.exe',
      '4d5a5000': '.exe',
      '7f454c46': '.elf',
      'cafebabe': '.class',
      'feedface': '.macho',
      '377abcaf': '.7z'
    };

    for (const [magic, ext] of Object.entries(signatures)) {
      if (magicBytes.toLowerCase().startsWith(magic)) {
        return ext;
      }
    }

    return '.unknown';
  }

  private async quarantineFile(filePath: string, originalName: string, threats: string[], scanResult: ScanResult): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const quarantineName = `${timestamp}_${originalName}`;
      const quarantinePath = path.join(this.quarantineDir, quarantineName);
      
      // Copy file to quarantine
      await fs.copyFile(filePath, quarantinePath);
      
      // Create detailed threat report
      const report = {
        originalName,
        quarantineTime: new Date().toISOString(),
        threats,
        originalPath: filePath,
        quarantinePath,
        scanResult,
        fileHash: scanResult.fileHash,
        scanEngine: scanResult.scanEngine,
        systemInfo: {
          platform: process.platform,
          nodeVersion: process.version,
          scannerVersion: '1.1.0'
        }
      };
      
      const reportPath = path.join(this.quarantineDir, 'reports', `${quarantineName}.report.json`);
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

      // Log quarantine event
      console.log(`[SECURITY] File quarantined: ${originalName} -> ${quarantineName}`);
      console.log(`[SECURITY] Threats detected: ${threats.join(', ')}`);
      
      // Optional: Send alert to security team
      await this.sendSecurityAlert(report);
      
    } catch (error) {
      console.error('[SECURITY] Failed to quarantine file:', error);
    }
  }

  private async sendSecurityAlert(report: any): Promise<void> {
    // In a real implementation, this would send alerts via email, Slack, etc.
    console.log(`[SECURITY ALERT] Malicious file detected and quarantined: ${report.originalName}`);
    console.log(`[SECURITY ALERT] Threat summary: ${report.threats.slice(0, 3).join(', ')}`);
  }

  async getQuarantinedFiles(): Promise<Array<{ name: string; date: string; threats: string[]; riskLevel: string }>> {
    try {
      const reportsDir = path.join(this.quarantineDir, 'reports');
      const files = await fs.readdir(reportsDir);
      const reports = files.filter(f => f.endsWith('.report.json'));
      
      const quarantinedFiles = await Promise.all(
        reports.map(async (reportFile) => {
          const reportPath = path.join(reportsDir, reportFile);
          const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
          
          // Determine risk level based on threats
          let riskLevel = 'low';
          const threatCount = report.threats.length;
          const hasCriticalThreat = report.threats.some((t: string) => 
            t.includes('Shell') || t.includes('CLAMAV') || t.includes('Severity: 10')
          );
          
          if (hasCriticalThreat) riskLevel = 'critical';
          else if (threatCount >= 5) riskLevel = 'high';
          else if (threatCount >= 3) riskLevel = 'medium';
          
          return {
            name: report.originalName,
            date: report.quarantineTime,
            threats: report.threats,
            riskLevel
          };
        })
      );

      return quarantinedFiles.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (error) {
      console.error('[SECURITY] Failed to list quarantined files:', error);
      return [];
    }
  }

  async cleanQuarantine(olderThanDays: number = 30): Promise<number> {
    try {
      const files = await fs.readdir(this.quarantineDir);
      const reportsDir = path.join(this.quarantineDir, 'reports');
      const reports = await fs.readdir(reportsDir);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      let cleanedCount = 0;
      
      // Clean old quarantine files
      for (const file of files) {
        if (file === 'reports') continue;
        
        const filePath = path.join(this.quarantineDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          cleanedCount++;
        }
      }
      
      // Clean old reports
      for (const report of reports) {
        const reportPath = path.join(reportsDir, report);
        const stats = await fs.stat(reportPath);
        
        if (stats.mtime < cutoffDate) {
          await fs.unlink(reportPath);
          cleanedCount++;
        }
      }

      console.log(`[SECURITY] Cleaned ${cleanedCount} old quarantine items`);
      return cleanedCount;
    } catch (error) {
      console.error('[SECURITY] Failed to clean quarantine:', error);
      return 0;
    }
  }

  async getSignatureStats(): Promise<{ total: number; lastUpdate: Date; nextUpdate: Date }> {
    const nextUpdate = new Date(this.signaturesLastUpdate.getTime() + (6 * 60 * 60 * 1000));
    
    return {
      total: this.threatSignatures.size,
      lastUpdate: this.signaturesLastUpdate,
      nextUpdate
    };
  }

  async forceThreatSignatureUpdate(): Promise<boolean> {
    try {
      await this.updateThreatSignatures();
      return true;
    } catch (error) {
      console.error('[SECURITY] Manual signature update failed:', error);
      return false;
    }
  }

  destroy(): void {
    if (this.signaturesUpdateInterval) {
      clearInterval(this.signaturesUpdateInterval);
    }
  }
}

export const virusScanner = new AdvancedVirusScanner();
