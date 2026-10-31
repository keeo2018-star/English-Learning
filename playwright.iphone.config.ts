import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: '**/mobile-selection-inputs.spec.ts',
  use: {
    ...base.use,
    ...devices['iPhone 13'],
    browserName: 'webkit',
    // UI fixtures mock Supabase; service-worker behavior is tested separately.
    serviceWorkers: 'block',
  },
});
