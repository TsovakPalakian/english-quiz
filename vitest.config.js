import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    exclude: ['src/**/*.test.mjs', 'speakout/**/*.test.js', 'node_modules/**']
  }
});
