import type { Category } from "./types";

// Reference copy of the DEFAULT category taxonomy every new signup starts
// with — actual live categories now come from the database (per-user,
// fully editable: see src/lib/data/categories.ts and the
// public.seed_default_categories() SQL function this mirrors). Nothing in
// the running app reads this array for rendering categories anymore; it's
// kept only so src/lib/data/demo-data.ts can resolve its old slug-style
// category ids (e.g. "dev-frontend") to whichever real category a given
// user's own "Frontend" row actually has. Keep in sync with
// supabase/migrations/20260101000005_dynamic_categories.sql's
// seed_default_categories() if the default set ever changes.
export const categories: Category[] = [
  { id: "development", name: "Development", parentId: null, sortOrder: 0 },
  { id: "dev-frontend", name: "Frontend", parentId: "development", sortOrder: 0 },
  { id: "dev-backend", name: "Backend", parentId: "development", sortOrder: 1 },
  { id: "dev-api", name: "API Tools", parentId: "development", sortOrder: 2 },
  { id: "dev-web-images", name: "Image Tools", parentId: "development", sortOrder: 3 },
  { id: "dev-devops", name: "DevOps", parentId: "development", sortOrder: 4 },
  { id: "dev-database", name: "Database", parentId: "development", sortOrder: 5 },
  { id: "design", name: "Design", parentId: null, sortOrder: 1 },
  { id: "design-ui", name: "UI Design", parentId: "design", sortOrder: 0 },
  { id: "design-assets", name: "Assets & Icons", parentId: "design", sortOrder: 1 },
  { id: "ai", name: "AI & ML", parentId: null, sortOrder: 2 },
  { id: "ai-models", name: "Models & Inference", parentId: "ai", sortOrder: 0 },
  { id: "ai-frameworks", name: "Frameworks", parentId: "ai", sortOrder: 1 },
  { id: "utilities", name: "Utilities", parentId: null, sortOrder: 3 },
  { id: "utilities-converters", name: "Converters", parentId: "utilities", sortOrder: 0 },
  { id: "utilities-formatters", name: "Formatters & Validators", parentId: "utilities", sortOrder: 1 },
  { id: "learning", name: "Learning", parentId: null, sortOrder: 4 },
];
