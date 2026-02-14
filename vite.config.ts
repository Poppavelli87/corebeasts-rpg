import { defineConfig } from 'vite';

const basePath = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base: basePath
});
