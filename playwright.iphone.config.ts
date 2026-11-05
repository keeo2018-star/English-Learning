import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: ['**/dictionary-edit.spec.ts', '**/library-performance.spec.ts', '**/learning-progress.spec.ts', '**/mobile-selection-inputs.spec.ts', '**/review-audio.spec.ts', '**/dictionary-highlight.spec.ts', '**/dictionary-controls.spec.ts', '**/pronunciation-consistency.spec.ts'],
  use: {
    ...base.use,
    ...devices['iPhone 13'],
    browserName: 'webkit',
    // UI fixtures mock Supabase; service-worker behavior is tested separately.
    serviceWorkers: 'block',
  },
});
