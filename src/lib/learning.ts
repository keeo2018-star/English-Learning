import type { ReviewState } from "./review";
export type LearningItem = {
  id: string;
  item_type?: "word" | "expression" | null;
  word: string;
  meaning: string;
  example: string;
  due_at: string;
  interval_days: number;
  created_at?: string;
  review_state?: ReviewState | null;
};
export const DEMO_STORAGE_KEY = "wordbook-demo-v1";

export function itemType(item: Pick<LearningItem, "word" | "item_type">): "word" | "expression" {
  return item.item_type ?? (/\s/u.test(item.word.trim()) ? "expression" : "word");
}
