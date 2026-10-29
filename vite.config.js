import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs, so the build works from any sub-path (e.g. /memebreak/).
  base: './',
  build: { chunkSizeWarningLimit: 800 },
});
