import type { ReviewState } from "./review";
export type LearningItem = {
  id: string;
  word: string;
  meaning: string;
  example: string;
  due_at: string;
  interval_days: number;
  created_at?: string;
  review_state?: ReviewState | null;
};
export const DEMO_STORAGE_KEY = "wordbook-demo-v1";
