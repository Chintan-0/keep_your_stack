export type FeedbackCategory = "bug" | "idea" | "confusing" | "other";

const CATEGORIES: readonly FeedbackCategory[] = ["bug", "idea", "confusing", "other"];

export function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}
