import { createCipheriv, createDecipheriv, randomBytes, scrypt, createHash } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

interface EncryptionResult {
  encryptedData: Buffer;
  iv: Buffer;
  salt: Buffer;
  authTag: Buffer;
  algorithm: string;
  keyLength: number;
}

interface DecryptionParams {
  encryptedData: Buffer;
  iv: Buffer;
  salt: Buffer;
  authTag: Buffer;
  algorithm: string;
  keyLength: number;
}

export class EndToEndEncryption {
  private algorithm: string = 'aes-256-gcm';
  private keyLength: number = 32;
  private ivLength: number = 16;
  private saltLength: number = 32;
  private tagLength: number = 16;

  constructor() {
    console.log('[SECURITY] End-to-end encryption module initialized');
  }

  /**
   * Encrypt data with AES-256-GCM using a password-derived key
   */
  async encryptData(data: Buffer, password: string): Promise<EncryptionResult> {
    try {
      // Generate random salt and IV
      const salt = randomBytes(this.saltLength);
      const iv = randomBytes(this.ivLength);

      // Derive key from password using scrypt
      const key = (await scryptAsync(password, salt, this.keyLength)) as Buffer;

      // Create cipher
      const cipher = createCipheriv(this.algorithm, key, iv);
      
      // Encrypt data
      const encryptedChunks: Buffer[] = [];
      encryptedChunks.push(cipher.update(data));
      encryptedChunks.push(cipher.final());
      
      const encryptedData = Buffer.concat(encryptedChunks);
      const authTag = cipher.getAuthTag();

      console.log(`[SECURITY] Data encrypted successfully (${data.length} bytes -> ${encryptedData.length} bytes)`);

      return {
        encryptedData,
        iv,
        salt,
        authTag,
        algorithm: this.algorithm,
        keyLength: this.keyLength
      };
    } catch (error) {
      console.error('[SECURITY] Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data encrypted with encryptData
   */
  async decryptData(params: DecryptionParams, password: string): Promise<Buffer> {
    try {
      const { encryptedData, iv, salt, authTag, algorithm, keyLength } = params;

      // Derive the same key from password and salt
      const key = (await scryptAsync(password, salt, keyLength)) as Buffer;

      // Create decipher
      const decipher = createDecipheriv(algorithm, key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt data
      const decryptedChunks: Buffer[] = [];
      decryptedChunks.push(decipher.update(encryptedData));
      decryptedChunks.push(decipher.final());

      const decryptedData = Buffer.concat(decryptedChunks);

      console.log(`[SECURITY] Data decrypted successfully (${encryptedData.length} bytes -> ${decryptedData.length} bytes)`);

      return decryptedData;
    } catch (error) {
      console.error('[SECURITY] Decryption failed:', error);
      throw new Error('Failed to decrypt data - invalid password or corrupted data');
    }
  }

  /**
   * Encrypt file for secure transfer
   */
  async encryptFileForTransfer(filePath: string, password: string): Promise<{
    encryptedPath: string;
    metadata: EncryptionResult;
  }> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Read original file
      const originalData = await fs.readFile(filePath);
      
      // Encrypt data
      const encryptionResult = await this.encryptData(originalData, password);
      
      // Create encrypted file
      const encryptedPath = filePath + '.encrypted';
      const encryptedFile = Buffer.concat([
        encryptionResult.salt,
        encryptionResult.iv,
        encryptionResult.authTag,
        encryptionResult.encryptedData
      ]);
      
      await fs.writeFile(encryptedPath, encryptedFile);
      
      console.log(`[SECURITY] File encrypted for transfer: ${path.basename(filePath)}`);
      
      return {
        encryptedPath,
        metadata: encryptionResult
      };
    } catch (error) {
      console.error('[SECURITY] File encryption failed:', error);
      throw new Error('Failed to encrypt file for transfer');
    }
  }

  /**
   * Decrypt file received from transfer
   */
  async decryptFileFromTransfer(encryptedPath: string, password: string, outputPath: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Read encrypted file
      const encryptedFile = await fs.readFile(encryptedPath);
      
      // Extract components
      const salt = encryptedFile.slice(0, this.saltLength);
      const iv = encryptedFile.slice(this.saltLength, this.saltLength + this.ivLength);
      const authTag = encryptedFile.slice(this.saltLength + this.ivLength, this.saltLength + this.ivLength + this.tagLength);
      const encryptedData = encryptedFile.slice(this.saltLength + this.ivLength + this.tagLength);
      
      // Decrypt data
      const decryptedData = await this.decryptData({
        encryptedData,
        iv,
        salt,
        authTag,
        algorithm: this.algorithm,
        keyLength: this.keyLength
      }, password);
      
      // Write decrypted file
      await fs.writeFile(outputPath, decryptedData);
      
      console.log(`[SECURITY] File decrypted from transfer: ${path.basename(outputPath)}`);
    } catch (error) {
      console.error('[SECURITY] File decryption failed:', error);
      throw new Error('Failed to decrypt file from transfer');
    }
  }

  /**
   * Generate secure hash for data integrity verification
   */
  generateSecureHash(data: Buffer, algorithm: string = 'sha256'): string {
    const hash = createHash(algorithm);
    hash.update(data);
    return hash.digest('hex');
  }

  /**
   * Verify data integrity using hash
   */
  verifyDataIntegrity(data: Buffer, expectedHash: string, algorithm: string = 'sha256'): boolean {
    const actualHash = this.generateSecureHash(data, algorithm);
    return actualHash === expectedHash;
  }

  /**
   * Generate encryption key from password with additional entropy
   */
  async generateStrongKey(password: string, additionalEntropy?: string): Promise<Buffer> {
    const salt = additionalEntropy ? 
      Buffer.from(additionalEntropy, 'utf8') : 
      randomBytes(this.saltLength);
    
    return (await scryptAsync(password, salt, this.keyLength)) as Buffer;
  }

  /**
   * Secure key derivation with multiple rounds
   */
  async deriveKeyWithRounds(password: string, salt: Buffer, rounds: number = 100000): Promise<Buffer> {
    let derivedKey = (await scryptAsync(password, salt, this.keyLength)) as Buffer;
    
    // Additional rounds for enhanced security
    for (let i = 0; i < rounds; i++) {
      const hash = createHash('sha256');
      hash.update(derivedKey);
      hash.update(salt);
      derivedKey = hash.digest();
    }
    
    return derivedKey;
  }

  /**
   * Encrypt sensitive configuration data
   */
  async encryptConfiguration(config: object, masterPassword: string): Promise<string> {
    const configJson = JSON.stringify(config);
    const configBuffer = Buffer.from(configJson, 'utf8');
    
    const encrypted = await this.encryptData(configBuffer, masterPassword);
    
    // Combine all encryption components into a single base64 string
    const combined = Buffer.concat([
      encrypted.salt,
      encrypted.iv,
      encrypted.authTag,
      encrypted.encryptedData
    ]);
    
    return combined.toString('base64');
  }

  /**
   * Decrypt sensitive configuration data
   */
  async decryptConfiguration(encryptedConfig: string, masterPassword: string): Promise<object> {
    const combined = Buffer.from(encryptedConfig, 'base64');
    
    const salt = combined.slice(0, this.saltLength);
    const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
    const authTag = combined.slice(this.saltLength + this.ivLength, this.saltLength + this.ivLength + this.tagLength);
    const encryptedData = combined.slice(this.saltLength + this.ivLength + this.tagLength);
    
    const decrypted = await this.decryptData({
      encryptedData,
      iv,
      salt,
      authTag,
      algorithm: this.algorithm,
      keyLength: this.keyLength
    }, masterPassword);
    
    const configJson = decrypted.toString('utf8');
    return JSON.parse(configJson);
  }

  /**
   * Generate secure session key for real-time encryption
   */
  generateSessionKey(): Buffer {
    return randomBytes(this.keyLength);
  }

  /**
   * Encrypt data stream chunk for real-time transfer
   */
  encryptStreamChunk(chunk: Buffer, sessionKey: Buffer, chunkIndex: number): Buffer {
    // Use chunk index as IV component for stream encryption
    const iv = Buffer.alloc(this.ivLength);
    iv.writeUInt32BE(chunkIndex, 0);
    iv.writeUInt32BE(Date.now() & 0xFFFFFFFF, 4);
    randomBytes(8).copy(iv, 8);
    
    const cipher = createCipheriv(this.algorithm, sessionKey, iv);
    const encrypted = Buffer.concat([cipher.update(chunk), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // Return: IV + AuthTag + EncryptedData
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt data stream chunk
   */
  decryptStreamChunk(encryptedChunk: Buffer, sessionKey: Buffer): Buffer {
    const iv = encryptedChunk.slice(0, this.ivLength);
    const authTag = encryptedChunk.slice(this.ivLength, this.ivLength + this.tagLength);
    const encryptedData = encryptedChunk.slice(this.ivLength + this.tagLength);
    
    const decipher = createDecipheriv(this.algorithm, sessionKey, iv);
    decipher.setAuthTag(authTag);
    
    return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  }
}

export const encryption = new EndToEndEncryption();