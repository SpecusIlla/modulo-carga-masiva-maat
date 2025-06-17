import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

interface AuditEvent {
  id: string;
  timestamp: string;
  userId: string;
  username: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  sessionId: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  success: boolean;
  errorMessage?: string;
  metadata: {
    duration?: number;
    fileSize?: number;
    changes?: Record<string, any>;
    permissions?: string[];
    context?: Record<string, any>;
  };
}

interface SecurityMetrics {
  totalEvents: number;
  criticalEvents: number;
  failedAttempts: number;
  suspiciousActivity: number;
  uniqueUsers: number;
  topActions: Array<{ action: string; count: number }>;
  riskDistribution: Record<string, number>;
}

interface AccessPattern {
  userId: string;
  username: string;
  firstAccess: string;
  lastAccess: string;
  totalAccesses: number;
  resourcesAccessed: string[];
  suspiciousPatterns: string[];
  riskScore: number;
}

export class AuditLogger {
  private logDirectory: string;
  private currentLogFile: string;
  private eventCache: AuditEvent[];
  private maxCacheSize: number = 1000;
  private flushInterval: NodeJS.Timeout;

  constructor() {
    this.logDirectory = path.join(process.cwd(), 'audit-logs');
    this.currentLogFile = '';
    this.eventCache = [];
    this.initializeAuditSystem();
    
    // Auto-flush cache every 30 seconds
    this.flushInterval = setInterval(() => {
      this.flushCache();
    }, 30000);
  }

  private async initializeAuditSystem() {
    try {
      await fs.mkdir(this.logDirectory, { recursive: true });
      this.currentLogFile = this.generateLogFileName();
      console.log('[AUDIT] Audit logging system initialized');
    } catch (error) {
      console.error('[AUDIT] Failed to initialize audit system:', error);
    }
  }

  private generateLogFileName(): string {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    return path.join(this.logDirectory, `audit-${dateStr}.jsonl`);
  }

  async logEvent(
    userId: string,
    username: string,
    action: string,
    resource: string,
    request: any,
    success: boolean = true,
    errorMessage?: string,
    resourceId?: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      const event: AuditEvent = {
        id: this.generateEventId(),
        timestamp: new Date().toISOString(),
        userId,
        username,
        action,
        resource,
        resourceId,
        details: this.sanitizeDetails(request),
        ipAddress: this.extractIPAddress(request),
        userAgent: request.get ? request.get('User-Agent') || 'unknown' : 'unknown',
        sessionId: request.sessionID || 'no-session',
        riskLevel: this.calculateRiskLevel(action, resource, success),
        success,
        errorMessage,
        metadata: {
          duration: metadata.duration,
          fileSize: metadata.fileSize,
          changes: metadata.changes,
          permissions: metadata.permissions,
          context: metadata.context
        }
      };

      // Add to cache
      this.eventCache.push(event);

      // Check for suspicious activity
      await this.analyzeSuspiciousActivity(event);

      // Flush cache if it's getting full
      if (this.eventCache.length >= this.maxCacheSize) {
        await this.flushCache();
      }

      // Log critical events immediately
      if (event.riskLevel === 'critical') {
        await this.handleCriticalEvent(event);
      }

    } catch (error) {
      console.error('[AUDIT] Failed to log event:', error);
    }
  }

  private generateEventId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    return createHash('sha256').update(timestamp + random).digest('hex').substring(0, 16);
  }

  private sanitizeDetails(request: any): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    // Extract safe request details
    if (request.body) {
      sanitized.body = this.sanitizeObject(request.body);
    }
    if (request.params) {
      sanitized.params = request.params;
    }
    if (request.query) {
      sanitized.query = request.query;
    }
    if (request.method) {
      sanitized.method = request.method;
    }
    if (request.path) {
      sanitized.path = request.path;
    }

    return sanitized;
  }

  private sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    const sanitized: any = {};
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth', 'credential'];

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private extractIPAddress(request: any): string {
    if (!request.ip && !request.connection) return 'unknown';
    
    return request.ip || 
           request.connection.remoteAddress || 
           request.socket?.remoteAddress || 
           request.connection.socket?.remoteAddress || 
           'unknown';
  }

  private calculateRiskLevel(action: string, resource: string, success: boolean): 'low' | 'medium' | 'high' | 'critical' {
    // Failed authentication attempts
    if (!success && (action.includes('login') || action.includes('auth'))) {
      return 'high';
    }

    // System administration actions
    if (action.includes('admin') || action.includes('system') || action.includes('config')) {
      return success ? 'medium' : 'critical';
    }

    // File operations
    if (action.includes('upload') || action.includes('download') || action.includes('delete')) {
      return success ? 'low' : 'medium';
    }

    // Data modification
    if (action.includes('update') || action.includes('modify') || action.includes('edit')) {
      return success ? 'low' : 'medium';
    }

    // Security-related events
    if (action.includes('security') || action.includes('permission') || action.includes('access')) {
      return success ? 'medium' : 'high';
    }

    return success ? 'low' : 'medium';
  }

  private async analyzeSuspiciousActivity(event: AuditEvent): Promise<void> {
    try {
      const suspiciousPatterns = [];

      // Check for rapid consecutive actions
      const recentEvents = this.eventCache
        .filter(e => e.userId === event.userId && 
                     Date.now() - new Date(e.timestamp).getTime() < 60000) // Last minute
        .length;

      if (recentEvents > 50) {
        suspiciousPatterns.push('Rapid consecutive actions detected');
      }

      // Check for failed login attempts
      const failedLogins = this.eventCache
        .filter(e => e.userId === event.userId && 
                     e.action.includes('login') && 
                     !e.success &&
                     Date.now() - new Date(e.timestamp).getTime() < 300000) // Last 5 minutes
        .length;

      if (failedLogins > 3) {
        suspiciousPatterns.push('Multiple failed login attempts');
      }

      // Check for unusual access patterns
      if (event.action.includes('admin') && event.timestamp) {
        const hour = new Date(event.timestamp).getHours();
        if (hour < 6 || hour > 22) {
          suspiciousPatterns.push('Administrative access during off-hours');
        }
      }

      // Log suspicious activity
      if (suspiciousPatterns.length > 0) {
        await this.logSecurityAlert(event, suspiciousPatterns);
      }

    } catch (error) {
      console.error('[AUDIT] Failed to analyze suspicious activity:', error);
    }
  }

  private async logSecurityAlert(event: AuditEvent, patterns: string[]): Promise<void> {
    const alertEvent: AuditEvent = {
      ...event,
      id: this.generateEventId(),
      action: 'SECURITY_ALERT',
      riskLevel: 'critical',
      details: {
        originalEvent: event.id,
        suspiciousPatterns: patterns,
        alertGenerated: new Date().toISOString()
      }
    };

    this.eventCache.push(alertEvent);
    await this.handleCriticalEvent(alertEvent);
  }

  private async handleCriticalEvent(event: AuditEvent): Promise<void> {
    try {
      // Immediately flush critical events
      const criticalLogFile = path.join(this.logDirectory, `critical-${new Date().toISOString().split('T')[0]}.jsonl`);
      await fs.appendFile(criticalLogFile, JSON.stringify(event) + '\n');
      
      console.warn(`[AUDIT] CRITICAL EVENT: ${event.action} by ${event.username} (${event.userId})`);
      
      // Send real-time notification (could integrate with alerting system)
      this.sendSecurityNotification(event);
      
    } catch (error) {
      console.error('[AUDIT] Failed to handle critical event:', error);
    }
  }

  private sendSecurityNotification(event: AuditEvent): void {
    // This could integrate with email, Slack, SMS, etc.
    console.log(`[SECURITY-ALERT] ${event.timestamp} - ${event.action} by ${event.username}`);
    if (event.details.suspiciousPatterns) {
      console.log(`[SECURITY-ALERT] Patterns: ${JSON.stringify(event.details.suspiciousPatterns)}`);
    }
  }

  private async flushCache(): Promise<void> {
    if (this.eventCache.length === 0) return;

    try {
      // Ensure we're writing to today's log file
      const todayLogFile = this.generateLogFileName();
      if (todayLogFile !== this.currentLogFile) {
        this.currentLogFile = todayLogFile;
      }

      // Write all cached events
      const logData = this.eventCache.map(event => JSON.stringify(event)).join('\n') + '\n';
      await fs.appendFile(this.currentLogFile, logData);

      console.log(`[AUDIT] Flushed ${this.eventCache.length} events to log file`);
      this.eventCache = [];

    } catch (error) {
      console.error('[AUDIT] Failed to flush cache:', error);
    }
  }

  async getSecurityMetrics(timeRange: { start: Date; end: Date }): Promise<SecurityMetrics> {
    try {
      const events = await this.getEventsInRange(timeRange);
      
      const metrics: SecurityMetrics = {
        totalEvents: events.length,
        criticalEvents: events.filter(e => e.riskLevel === 'critical').length,
        failedAttempts: events.filter(e => !e.success).length,
        suspiciousActivity: events.filter(e => e.action === 'SECURITY_ALERT').length,
        uniqueUsers: new Set(events.map(e => e.userId)).size,
        topActions: this.calculateTopActions(events),
        riskDistribution: this.calculateRiskDistribution(events)
      };

      return metrics;
    } catch (error) {
      console.error('[AUDIT] Failed to generate security metrics:', error);
      throw error;
    }
  }

  private async getEventsInRange(timeRange: { start: Date; end: Date }): Promise<AuditEvent[]> {
    const events: AuditEvent[] = [];
    
    try {
      // Get all log files in the date range
      const files = await fs.readdir(this.logDirectory);
      const logFiles = files.filter(f => f.startsWith('audit-') && f.endsWith('.jsonl'));

      for (const file of logFiles) {
        const filePath = path.join(this.logDirectory, file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const event: AuditEvent = JSON.parse(line);
            const eventTime = new Date(event.timestamp);
            
            if (eventTime >= timeRange.start && eventTime <= timeRange.end) {
              events.push(event);
            }
          } catch (parseError) {
            console.error('[AUDIT] Failed to parse log line:', parseError);
          }
        }
      }
    } catch (error) {
      console.error('[AUDIT] Failed to read log files:', error);
    }

    return events;
  }

  private calculateTopActions(events: AuditEvent[]): Array<{ action: string; count: number }> {
    const actionCounts: Record<string, number> = {};
    
    events.forEach(event => {
      actionCounts[event.action] = (actionCounts[event.action] || 0) + 1;
    });

    return Object.entries(actionCounts)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private calculateRiskDistribution(events: AuditEvent[]): Record<string, number> {
    const distribution: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };

    events.forEach(event => {
      distribution[event.riskLevel]++;
    });

    return distribution;
  }

  async getUserAccessPatterns(userId: string, days: number = 30): Promise<AccessPattern> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const events = await this.getEventsInRange({ start: startDate, end: endDate });
    const userEvents = events.filter(e => e.userId === userId);

    if (userEvents.length === 0) {
      throw new Error('No access data found for user');
    }

    const timestamps = userEvents.map(e => new Date(e.timestamp));
    const resources = [...new Set(userEvents.map(e => e.resource))];
    
    // Analyze suspicious patterns
    const suspiciousPatterns = [];
    
    // Check for off-hours access
    const offHoursAccess = userEvents.filter(e => {
      const hour = new Date(e.timestamp).getHours();
      return hour < 6 || hour > 22;
    });
    
    if (offHoursAccess.length > userEvents.length * 0.3) {
      suspiciousPatterns.push('Frequent off-hours access');
    }

    // Check for failed attempts
    const failedAttempts = userEvents.filter(e => !e.success);
    if (failedAttempts.length > userEvents.length * 0.1) {
      suspiciousPatterns.push('High failure rate');
    }

    // Calculate risk score (0-100)
    let riskScore = 0;
    riskScore += Math.min(suspiciousPatterns.length * 20, 60);
    riskScore += Math.min(failedAttempts.length / userEvents.length * 100, 30);
    riskScore += Math.min(offHoursAccess.length / userEvents.length * 100, 10);

    return {
      userId,
      username: userEvents[0].username,
      firstAccess: new Date(Math.min(...timestamps.map(t => t.getTime()))).toISOString(),
      lastAccess: new Date(Math.max(...timestamps.map(t => t.getTime()))).toISOString(),
      totalAccesses: userEvents.length,
      resourcesAccessed: resources,
      suspiciousPatterns,
      riskScore: Math.min(Math.round(riskScore), 100)
    };
  }

  async exportAuditReport(timeRange: { start: Date; end: Date }, format: 'json' | 'csv' = 'json'): Promise<string> {
    const events = await this.getEventsInRange(timeRange);
    const reportPath = path.join(this.logDirectory, `audit-report-${Date.now()}.${format}`);

    if (format === 'json') {
      const report = {
        generatedAt: new Date().toISOString(),
        timeRange,
        totalEvents: events.length,
        events
      };
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    } else {
      // CSV format
      const csvHeader = 'Timestamp,User ID,Username,Action,Resource,Success,Risk Level,IP Address\n';
      const csvRows = events.map(e => 
        `"${e.timestamp}","${e.userId}","${e.username}","${e.action}","${e.resource}","${e.success}","${e.riskLevel}","${e.ipAddress}"`
      ).join('\n');
      await fs.writeFile(reportPath, csvHeader + csvRows);
    }

    return reportPath;
  }

  async cleanup(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flushCache();
    console.log('[AUDIT] Audit logger cleaned up');
  }
}

export const auditLogger = new AuditLogger();