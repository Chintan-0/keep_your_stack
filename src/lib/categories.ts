import type { Category } from "./types";

// Shared, permanent category taxonomy — not demo content. This mirrors
// the rows seeded into the real database (supabase/seed.sql) and is used
// as static reference data for category pickers/labels, the same way
// every account (empty or full of real resources) sees the same
// category tree.
export const categories: Category[] = [
  { id: "development", name: "Development", parentId: null },
  { id: "dev-frontend", name: "Frontend", parentId: "development" },
  { id: "dev-backend", name: "Backend", parentId: "development" },
  { id: "dev-api", name: "API Tools", parentId: "development" },
  { id: "dev-web-images", name: "Image Tools", parentId: "development" },
  { id: "dev-devops", name: "DevOps", parentId: "development" },
  { id: "dev-database", name: "Database", parentId: "development" },
  { id: "design", name: "Design", parentId: null },
  { id: "design-ui", name: "UI Design", parentId: "design" },
  { id: "design-assets", name: "Assets & Icons", parentId: "design" },
  { id: "ai", name: "AI & ML", parentId: null },
  { id: "ai-models", name: "Models & Inference", parentId: "ai" },
  { id: "ai-frameworks", name: "Frameworks", parentId: "ai" },
  { id: "utilities", name: "Utilities", parentId: null },
  { id: "utilities-converters", name: "Converters", parentId: "utilities" },
  { id: "utilities-formatters", name: "Formatters & Validators", parentId: "utilities" },
  { id: "learning", name: "Learning", parentId: null },
];
