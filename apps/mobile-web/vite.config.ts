import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { vitePluginI18n } from 'extract-i18n-plugin';
import svgr from 'vite-plugin-svgr';

export default defineConfig({
  base: './',
  plugins: [react(), vitePluginI18n(), svgr()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname
    }
  }
});
