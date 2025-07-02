
import { z } from 'zod';

// Zod schema para validación de documentos
const DocumentSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  content: z.string().optional(),
  category: z.string().min(1).max(100),
  fileType: z.string().min(1).max(50),
  size: z.number().positive(),
  hash: z.string().min(1),
  projectId: z.string().uuid(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type Document = z.infer<typeof DocumentSchema>;

export class DocumentsModule {
  private documents: Map<string, Document> = new Map();

  /**
   * CRUD - Create Document
   */
  async createDocument(data: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Document> {
    const validatedData = DocumentSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(data);
    
    const document: Document = {
      id: this.generateId(),
      ...validatedData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.documents.set(document.id!, document);
    return document;
  }

  /**
   * CRUD - Read Document
   */
  async getDocument(id: string): Promise<Document | null> {
    return this.documents.get(id) || null;
  }

  /**
   * CRUD - Update Document
   */
  async updateDocument(id: string, updates: Partial<Document>): Promise<Document | null> {
    const existing = this.documents.get(id);
    if (!existing) return null;

    const updated: Document = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };

    const validated = DocumentSchema.parse(updated);
    this.documents.set(id, validated);
    return validated;
  }

  /**
   * CRUD - Delete Document
   */
  async deleteDocument(id: string): Promise<boolean> {
    return this.documents.delete(id);
  }

  /**
   * Advanced Querying - Find by category
   */
  async findByCategory(category: string): Promise<Document[]> {
    return Array.from(this.documents.values())
      .filter(doc => doc.category === category);
  }

  /**
   * Advanced Querying - Find by project
   */
  async findByProject(projectId: string): Promise<Document[]> {
    return Array.from(this.documents.values())
      .filter(doc => doc.projectId === projectId);
  }

  /**
   * Advanced Querying - Search documents
   */
  async searchDocuments(query: string): Promise<Document[]> {
    const searchTerm = query.toLowerCase();
    return Array.from(this.documents.values())
      .filter(doc => 
        doc.title.toLowerCase().includes(searchTerm) ||
        (doc.content && doc.content.toLowerCase().includes(searchTerm))
      );
  }

  private generateId(): string {
    return 'doc_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }
}

export const documentsModule = new DocumentsModule();
