// In-house categorizer: a multinomial naive Bayes model trained on the user's
// own already-categorized resources. Pure and dependency-free. Nothing leaves
// the server, and there's no external model or per-call cost.

export const CLASSIFIER_MIN_EXAMPLES = 8;
export const CLASSIFIER_MIN_CATEGORIES = 2;
export const CLASSIFIER_APPLY_THRESHOLD = 0.9;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "your", "you", "are", "from", "this", "that", "into", "its", "our", "use", "using",
  "https", "http", "www", "com", "org", "net", "io", "app", "tool", "tools",
]);

export interface ClassifierExample {
  text: string;
  label: string;
}

export interface ClassifierPrediction {
  label: string;
  confidence: number;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .slice(0, 400);
}

export interface NaiveBayesModel {
  labels: string[];
  docCount: Map<string, number>;
  tokenCount: Map<string, Map<string, number>>;
  totalTokens: Map<string, number>;
  vocab: Set<string>;
  totalDocs: number;
}

export function trainClassifier(examples: ClassifierExample[]): NaiveBayesModel | null {
  const labelSet = new Set(examples.map((e) => e.label));
  if (examples.length < CLASSIFIER_MIN_EXAMPLES || labelSet.size < CLASSIFIER_MIN_CATEGORIES) return null;

  const model: NaiveBayesModel = {
    labels: [...labelSet],
    docCount: new Map(),
    tokenCount: new Map(),
    totalTokens: new Map(),
    vocab: new Set(),
    totalDocs: examples.length,
  };

  for (const { text, label } of examples) {
    model.docCount.set(label, (model.docCount.get(label) ?? 0) + 1);
    const counts = model.tokenCount.get(label) ?? new Map<string, number>();
    for (const token of tokenize(text)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
      model.totalTokens.set(label, (model.totalTokens.get(label) ?? 0) + 1);
      model.vocab.add(token);
    }
    model.tokenCount.set(label, counts);
  }
  return model;
}

/** Returns the most likely label and its posterior probability. Null if the text has no usable tokens. */
export function predictCategory(model: NaiveBayesModel, text: string): ClassifierPrediction | null {
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;
  const vocabSize = model.vocab.size || 1;

  const logScores = model.labels.map((label) => {
    const prior = Math.log((model.docCount.get(label) ?? 0) / model.totalDocs);
    const counts = model.tokenCount.get(label) ?? new Map<string, number>();
    const total = model.totalTokens.get(label) ?? 0;
    let score = prior;
    for (const token of tokens) {
      score += Math.log(((counts.get(token) ?? 0) + 1) / (total + vocabSize));
    }
    return score;
  });

  const max = Math.max(...logScores);
  const weights = logScores.map((s) => Math.exp(s - max));
  const sum = weights.reduce((a, b) => a + b, 0);
  let best = 0;
  for (let i = 1; i < weights.length; i++) if (weights[i] > weights[best]) best = i;
  return { label: model.labels[best], confidence: weights[best] / sum };
}

export function shouldApplyPrediction(prediction: ClassifierPrediction | null): prediction is ClassifierPrediction {
  return prediction !== null && prediction.confidence >= CLASSIFIER_APPLY_THRESHOLD;
}
