// In-house similarity: TF-IDF vectors and cosine similarity over a resource's
// text. Pure and dependency-free; nothing is sent anywhere.

import { tokenize } from "@/lib/ai-classifier";

export interface SimilarityDoc {
  id: string;
  text: string;
}

export interface SimilarMatch {
  id: string;
  score: number;
}

export function similarDocs(docs: SimilarityDoc[], targetId: string, limit = 4, minScore = 0.15): SimilarMatch[] {
  const target = docs.find((d) => d.id === targetId);
  if (!target) return [];

  const tokenized = docs.map((d) => ({ id: d.id, tokens: tokenize(d.text) }));
  const docCount = tokenized.length;
  const df = new Map<string, number>();
  for (const d of tokenized) {
    for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const vectorize = (tokens: string[]) => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const vec = new Map<string, number>();
    for (const [t, count] of tf) {
      const idf = Math.log((docCount + 1) / ((df.get(t) ?? 0) + 1)) + 1;
      vec.set(t, (count / tokens.length) * idf);
    }
    return vec;
  };

  const norm = (v: Map<string, number>) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));
  const targetTokens = tokenized.find((d) => d.id === targetId)?.tokens ?? [];
  const tv = vectorize(targetTokens);
  const tn = norm(tv);
  if (tn === 0) return [];

  const matches: SimilarMatch[] = [];
  for (const d of tokenized) {
    if (d.id === targetId || d.tokens.length === 0) continue;
    const v = vectorize(d.tokens);
    const vn = norm(v);
    if (vn === 0) continue;
    let dot = 0;
    for (const [t, w] of tv) dot += w * (v.get(t) ?? 0);
    const score = dot / (tn * vn);
    if (score >= minScore) matches.push({ id: d.id, score });
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}
