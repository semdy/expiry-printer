import react from '@vitejs/plugin-react';
import { vitePluginI18n } from 'extract-i18n-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react(), vitePluginI18n()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname
    }
  }
});
