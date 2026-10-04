import { describe, it, expect } from "vitest";
import {
  trainClassifier,
  predictCategory,
  shouldApplyPrediction,
  tokenize,
  CLASSIFIER_MIN_EXAMPLES,
} from "./ai-classifier";

const DEV = [
  "React component library frontend",
  "Next.js server rendering framework",
  "TypeScript compiler build tool",
  "npm package registry javascript",
  "CSS utility framework tailwind frontend",
  "Node runtime server javascript",
  "git repository hosting code review",
  "API client testing rest requests",
];
const DESIGN = [
  "Figma design prototype interface",
  "icon library svg vector design",
  "color palette generator design",
  "font pairing typography web fonts",
];

function examples() {
  return [
    ...DEV.map((text) => ({ text, label: "Development" })),
    ...DESIGN.map((text) => ({ text, label: "Design" })),
  ];
}

describe("tokenize", () => {
  it("lowercases, splits on punctuation, and drops stopwords and single characters", () => {
    expect(tokenize("The Next.js API & the UI")).toEqual(["next", "js", "api", "ui"]);
  });
});

describe("trainClassifier", () => {
  it("refuses to train on too little data", () => {
    expect(trainClassifier(examples().slice(0, CLASSIFIER_MIN_EXAMPLES - 1))).toBeNull();
  });

  it("refuses to train when only one category exists", () => {
    const one = DEV.map((text) => ({ text, label: "Development" }));
    expect(trainClassifier(one)).toBeNull();
  });

  it("trains when there is enough data across two categories", () => {
    expect(trainClassifier(examples())).not.toBeNull();
  });
});

describe("predictCategory", () => {
  const model = trainClassifier(examples());

  it("predicts the category a similar resource was filed under", () => {
    const p = predictCategory(model!, "vite frontend build tool for react javascript");
    expect(p?.label).toBe("Development");
  });

  it("predicts a design resource as Design", () => {
    const p = predictCategory(model!, "svg icon set for design systems");
    expect(p?.label).toBe("Design");
  });

  it("returns a probability between 0 and 1", () => {
    const p = predictCategory(model!, "react framework");
    expect(p!.confidence).toBeGreaterThan(0);
    expect(p!.confidence).toBeLessThanOrEqual(1);
  });

  it("returns null for text with no usable tokens", () => {
    expect(predictCategory(model!, "the and for")).toBeNull();
  });

  it("applies only a confident prediction", () => {
    expect(shouldApplyPrediction({ label: "Design", confidence: 0.95 })).toBe(true);
    expect(shouldApplyPrediction({ label: "Design", confidence: 0.6 })).toBe(false);
    expect(shouldApplyPrediction(null)).toBe(false);
  });
});
