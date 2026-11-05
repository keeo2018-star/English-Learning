import { itemType, type LearningItem } from './learning';
export const LIBRARY_PAGE_SIZE = 30;
export const normalizeLibraryQuery = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
export function indexLibrary(words: LearningItem[]) {
  return words.map(word => ({ word, type: itemType(word), text: normalizeLibraryQuery(`${word.word} ${word.meaning} ${word.example || ''}`) }));
}
