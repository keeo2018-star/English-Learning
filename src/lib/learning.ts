export type LearningItem = {
  id: string;
  word: string;
  meaning: string;
  example: string;
  due_at: string;
  interval_days: number;
};
export const DEMO_STORAGE_KEY = "wordbook-demo-v1";
