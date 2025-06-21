
import { pgTable, serial, text, timestamp, integer, boolean, jsonb, uuid, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Tabla de usuarios
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  lastLogin: timestamp('last_login'),
  metadata: jsonb('metadata'),
}, (table) => ({
  usernameIdx: index('username_idx').on(table.username),
  emailIdx: index('email_idx').on(table.email),
}));

// Tabla de archivos
export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileName: text('file_name').notNull(),
  originalName: text('original_name').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  fileHash: text('file_hash').notNull().unique(),
  uploadSessionId: text('upload_session_id'),
  userId: uuid('user_id').notNull().references(() => users.id),
  status: text('status').notNull().default('uploaded'), // uploaded, processing, completed, quarantined
  isCompressed: boolean('is_compressed').notNull().default(false),
  isEncrypted: boolean('is_encrypted').notNull().default(false),
  scanStatus: text('scan_status').notNull().default('pending'), // pending, clean, infected, error
  scanResult: jsonb('scan_result'),
  tags: text('tags').array(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  fileHashIdx: index('file_hash_idx').on(table.fileHash),
  userIdIdx: index('user_id_idx').on(table.userId),
  statusIdx: index('status_idx').on(table.status),
  scanStatusIdx: index('scan_status_idx').on(table.scanStatus),
  createdAtIdx: index('created_at_idx').on(table.createdAt),
}));

// Tabla de versiones de archivos
export const fileVersions = pgTable('file_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileId: uuid('file_id').notNull().references(() => files.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull(),
  changes: text('changes'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  metadata: jsonb('metadata'),
}, (table) => ({
  fileIdIdx: index('file_version_file_id_idx').on(table.fileId),
  versionIdx: index('file_version_number_idx').on(table.fileId, table.versionNumber),
}));

// Tabla de sesiones de carga
export const uploadSessions = pgTable('upload_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  uploadId: text('upload_id').notNull().unique(),
  userId: uuid('user_id').notNull().references(() => users.id),
  totalChunks: integer('total_chunks').notNull(),
  chunksReceived: integer('chunks_received').notNull().default(0),
  fileSize: integer('file_size').notNull(),
  fileName: text('file_name').notNull(),
  status: text('status').notNull().default('active'), // active, completed, cancelled, expired
  compressed: boolean('compressed').notNull().default(false),
  encrypted: boolean('encrypted').notNull().default(false),
  startTime: timestamp('start_time').notNull().defaultNow(),
  lastActivity: timestamp('last_activity').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  metadata: jsonb('metadata'),
}, (table) => ({
  uploadIdIdx: index('upload_id_idx').on(table.uploadId),
  userIdIdx: index('upload_session_user_id_idx').on(table.userId),
  statusIdx: index('upload_session_status_idx').on(table.status),
}));

// Tabla de eventos de auditoría
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  username: text('username'),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id'),
  success: boolean('success').notNull(),
  errorMessage: text('error_message'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  details: jsonb('details'),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('audit_user_id_idx').on(table.userId),
  actionIdx: index('audit_action_idx').on(table.action),
  timestampIdx: index('audit_timestamp_idx').on(table.timestamp),
  resourceIdx: index('audit_resource_idx').on(table.resource),
}));

// Tabla de métricas de rendimiento
export const performanceMetrics = pgTable('performance_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  metricType: text('metric_type').notNull(), // upload_speed, cpu_usage, memory_usage, cache_hit_rate
  value: integer('value').notNull(),
  unit: text('unit').notNull(), // MB/s, percentage, bytes
  tags: jsonb('tags'),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
}, (table) => ({
  metricTypeIdx: index('metric_type_idx').on(table.metricType),
  timestampIdx: index('performance_timestamp_idx').on(table.timestamp),
}));

// Tabla de archivos en cuarentena
export const quarantinedFiles = pgTable('quarantined_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  originalFileId: uuid('original_file_id').references(() => files.id),
  fileName: text('file_name').notNull(),
  quarantinePath: text('quarantine_path').notNull(),
  threats: text('threats').array(),
  scanEngine: text('scan_engine').notNull(),
  quarantinedAt: timestamp('quarantined_at').notNull().defaultNow(),
  status: text('status').notNull().default('quarantined'), // quarantined, reviewed, restored, deleted
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  notes: text('notes'),
}, (table) => ({
  statusIdx: index('quarantine_status_idx').on(table.status),
  quarantinedAtIdx: index('quarantined_at_idx').on(table.quarantinedAt),
}));

// Relaciones
export const usersRelations = relations(users, ({ many }) => ({
  files: many(files),
  uploadSessions: many(uploadSessions),
  auditLogs: many(auditLogs),
  fileVersions: many(fileVersions),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  user: one(users, {
    fields: [files.userId],
    references: [users.id],
  }),
  versions: many(fileVersions),
}));

export const fileVersionsRelations = relations(fileVersions, ({ one }) => ({
  file: one(files, {
    fields: [fileVersions.fileId],
    references: [files.id],
  }),
  createdBy: one(users, {
    fields: [fileVersions.createdBy],
    references: [users.id],
  }),
}));

export const uploadSessionsRelations = relations(uploadSessions, ({ one }) => ({
  user: one(users, {
    fields: [uploadSessions.userId],
    references: [users.id],
  }),
}));
