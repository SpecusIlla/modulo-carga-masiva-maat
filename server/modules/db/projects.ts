
import { z } from 'zod';

// Zod schema para validación de proyectos
const ProjectSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  status: z.enum(['active', 'archived', 'draft']),
  ownerId: z.string().uuid(),
  settings: z.object({
    autoClassification: z.boolean(),
    retentionDays: z.number().positive(),
    allowedFileTypes: z.array(z.string())
  }),
  analytics: z.object({
    documentsCount: z.number().default(0),
    totalSize: z.number().default(0),
    lastActivity: z.date().optional()
  }).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type Project = z.infer<typeof ProjectSchema>;

export class ProjectsModule {
  private projects: Map<string, Project> = new Map();

  /**
   * CRUD - Create Project
   */
  async createProject(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const validatedData = ProjectSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(data);
    
    const project: Project = {
      id: this.generateId(),
      ...validatedData,
      analytics: {
        documentsCount: 0,
        totalSize: 0,
        lastActivity: new Date()
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.projects.set(project.id!, project);
    return project;
  }

  /**
   * CRUD - Read Project
   */
  async getProject(id: string): Promise<Project | null> {
    return this.projects.get(id) || null;
  }

  /**
   * CRUD - Update Project
   */
  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    const existing = this.projects.get(id);
    if (!existing) return null;

    const updated: Project = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };

    const validated = ProjectSchema.parse(updated);
    this.projects.set(id, validated);
    return validated;
  }

  /**
   * CRUD - Delete Project
   */
  async deleteProject(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  /**
   * Analytics Integration - Update project analytics
   */
  async updateAnalytics(projectId: string, deltaCount: number, deltaSize: number): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) return;

    project.analytics = {
      documentsCount: (project.analytics?.documentsCount || 0) + deltaCount,
      totalSize: (project.analytics?.totalSize || 0) + deltaSize,
      lastActivity: new Date()
    };

    await this.updateProject(projectId, project);
  }

  /**
   * Analytics Integration - Get project statistics
   */
  async getProjectStats(projectId: string): Promise<{
    documentsCount: number;
    totalSize: number;
    avgDocumentSize: number;
    lastActivity: Date | null;
  } | null> {
    const project = this.projects.get(projectId);
    if (!project || !project.analytics) return null;

    return {
      documentsCount: project.analytics.documentsCount,
      totalSize: project.analytics.totalSize,
      avgDocumentSize: project.analytics.documentsCount > 0 
        ? project.analytics.totalSize / project.analytics.documentsCount 
        : 0,
      lastActivity: project.analytics.lastActivity || null
    };
  }

  /**
   * Find projects by owner
   */
  async findByOwner(ownerId: string): Promise<Project[]> {
    return Array.from(this.projects.values())
      .filter(project => project.ownerId === ownerId);
  }

  /**
   * Find projects by status
   */
  async findByStatus(status: 'active' | 'archived' | 'draft'): Promise<Project[]> {
    return Array.from(this.projects.values())
      .filter(project => project.status === status);
  }

  private generateId(): string {
    return 'proj_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }
}

export const projectsModule = new ProjectsModule();
