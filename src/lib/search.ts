import type { Resource, SearchMatch } from "./types";
import { categories, stacks, tags } from "./mock-data";

function tagNames(ids: string[]): string[] {
  return ids.map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean) as string[];
}
function stackNames(ids: string[]): string[] {
  return ids.map((id) => stacks.find((s) => s.id === id)?.name).filter(Boolean) as string[];
}
function categoryName(id: string | null): string {
  return categories.find((c) => c.id === id)?.name ?? "";
}

// Lightweight synonym expansion so intent-style queries ("test an api",
// "compress images") reach resources described with related words.
const SYNONYMS: Record<string, string[]> = {
  test: ["testing", "debug", "client"],
  compress: ["compression", "optimize", "shrink", "reduce"],
  convert: ["conversion", "transform"],
  decode: ["decoder", "inspect", "verify"],
  format: ["formatter", "prettify"],
  visualize: ["visualizer", "graph", "inspect"],
  api: ["rest", "graphql", "endpoint"],
  image: ["images", "png", "jpeg", "webp", "photo"],
  database: ["db", "sql", "postgres"],
  icon: ["icons", "svg"],
  free: ["open-source", "no cost"],
};

function expandTerms(query: string): string[] {
  const base = query
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/i)
    .filter(Boolean);
  const expanded = new Set(base);
  for (const term of base) {
    const syns = SYNONYMS[term];
    if (syns) syns.forEach((s) => expanded.add(s));
  }
  return Array.from(expanded);
}

interface FieldWeight {
  text: string;
  weight: number;
  label: string;
}

export function searchResources(resources: Resource[], rawQuery: string): SearchMatch[] {
  const query = rawQuery.trim();
  if (!query) return [];
  const terms = expandTerms(query);
  if (terms.length === 0) return [];

  const results: SearchMatch[] = [];

  for (const resource of resources) {
    const fields: FieldWeight[] = [
      { text: resource.title, weight: 6, label: resource.title },
      { text: resource.domain, weight: 3, label: resource.domain },
      { text: resource.description, weight: 2, label: "Description" },
      { text: resource.useCases.join(" • "), weight: 5, label: "Useful for" },
      { text: resource.notes, weight: 4, label: "Your note" },
      { text: categoryName(resource.categoryId), weight: 3, label: categoryName(resource.categoryId) },
      { text: tagNames(resource.tagIds).join(" "), weight: 3, label: "Tags" },
      { text: stackNames(resource.stackIds).join(" "), weight: 2, label: "Stack" },
    ];

    let score = 0;
    const matchedOn = new Set<string>();

    for (const term of terms) {
      for (const field of fields) {
        const haystack = field.text.toLowerCase();
        if (!haystack) continue;
        if (haystack === term) {
          score += field.weight * 3;
          matchedOn.add(field.label);
        } else if (haystack.split(/\W+/).includes(term)) {
          score += field.weight * 2;
          matchedOn.add(field.label);
        } else if (haystack.includes(term)) {
          score += field.weight;
          matchedOn.add(field.label);
        }
      }
    }

    // Exact phrase bonus (title or description contains the raw query)
    const lowerQuery = query.toLowerCase();
    if (resource.title.toLowerCase().includes(lowerQuery)) score += 10;
    if (resource.description.toLowerCase().includes(lowerQuery)) score += 4;

    if (score > 0) {
      matchedOn.delete("Description");
      const labels = Array.from(matchedOn).slice(0, 4);
      results.push({ resource, score, matchedOn: labels.length ? labels : ["Description"] });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
