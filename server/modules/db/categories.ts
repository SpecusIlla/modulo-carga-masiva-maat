
import { z } from 'zod';

// Zod schema para validación de categorías
const CategorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  parentId: z.string().uuid().optional(),
  rules: z.object({
    keywords: z.array(z.string()),
    fileTypes: z.array(z.string()),
    sizeRange: z.object({
      min: z.number().optional(),
      max: z.number().optional()
    }).optional()
  }),
  isActive: z.boolean().default(true),
  sortOrder: z.number().default(0),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type Category = z.infer<typeof CategorySchema>;

export class CategoriesModule {
  private categories: Map<string, Category> = new Map();

  /**
   * CRUD - Create Category
   */
  async createCategory(data: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): Promise<Category> {
    const validatedData = CategorySchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(data);
    
    const category: Category = {
      id: this.generateId(),
      ...validatedData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.categories.set(category.id!, category);
    return category;
  }

  /**
   * CRUD - Read Category
   */
  async getCategory(id: string): Promise<Category | null> {
    return this.categories.get(id) || null;
  }

  /**
   * CRUD - Update Category
   */
  async updateCategory(id: string, updates: Partial<Category>): Promise<Category | null> {
    const existing = this.categories.get(id);
    if (!existing) return null;

    const updated: Category = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };

    const validated = CategorySchema.parse(updated);
    this.categories.set(id, validated);
    return validated;
  }

  /**
   * CRUD - Delete Category
   */
  async deleteCategory(id: string): Promise<boolean> {
    return this.categories.delete(id);
  }

  /**
   * Classification Category Management - Get all active categories
   */
  async getActiveCategories(): Promise<Category[]> {
    return Array.from(this.categories.values())
      .filter(category => category.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /**
   * Classification Category Management - Get category hierarchy
   */
  async getCategoryHierarchy(): Promise<Category[]> {
    const categories = Array.from(this.categories.values());
    const roots = categories.filter(cat => !cat.parentId);
    
    return this.buildHierarchy(roots, categories);
  }

  /**
   * Classification Category Management - Find category for document
   */
  async findCategoryForDocument(fileName: string, fileType: string, fileSize: number): Promise<Category | null> {
    const activeCategories = await this.getActiveCategories();
    
    for (const category of activeCategories) {
      if (this.matchesCategory(category, fileName, fileType, fileSize)) {
        return category;
      }
    }
    
    return null;
  }

  /**
   * Get subcategories
   */
  async getSubcategories(parentId: string): Promise<Category[]> {
    return Array.from(this.categories.values())
      .filter(category => category.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private buildHierarchy(roots: Category[], allCategories: Category[]): Category[] {
    return roots.map(root => ({
      ...root,
      subcategories: this.buildHierarchy(
        allCategories.filter(cat => cat.parentId === root.id),
        allCategories
      )
    }));
  }

  private matchesCategory(category: Category, fileName: string, fileType: string, fileSize: number): boolean {
    const rules = category.rules;
    
    // Check file type
    if (rules.fileTypes.length > 0 && !rules.fileTypes.includes(fileType)) {
      return false;
    }
    
    // Check size range
    if (rules.sizeRange) {
      if (rules.sizeRange.min && fileSize < rules.sizeRange.min) return false;
      if (rules.sizeRange.max && fileSize > rules.sizeRange.max) return false;
    }
    
    // Check keywords
    if (rules.keywords.length > 0) {
      const lowerFileName = fileName.toLowerCase();
      return rules.keywords.some(keyword => 
        lowerFileName.includes(keyword.toLowerCase())
      );
    }
    
    return true;
  }

  private generateId(): string {
    return 'cat_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }
}

export const categoriesModule = new CategoriesModule();
