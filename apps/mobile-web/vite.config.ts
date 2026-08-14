import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { vitePluginI18n } from 'extract-i18n-plugin';
import svgr from 'vite-plugin-svgr';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const apiMap = {
  dev: 'dev-',
  test: 'test-',
  stage: 'stage-',
  im: ''
}

const current = apiMap.test

export default defineConfig(({ command }) => ({
  base: './',
  define: {
    'process.env.NODE_ENV': JSON.stringify(command === 'build' ? 'production' : 'development'),
    'process.env.REACT_APP_DOMAIN': JSON.stringify(process.env.REACT_APP_DOMAIN || ''),
    'process.env.REACT_APP_ENV': JSON.stringify('web')
  },
  plugins: [
    {
      name: 'workspace-static-asset-require',
      enforce: 'pre',
      transform(code, id) {
        const cleanId = id.split('?', 1)[0];
        if (
          cleanId.includes('/node_modules/') ||
          !/\/(?:apps|packages|web-library|web-business)\//.test(cleanId) ||
          !/\.[cm]?[jt]sx?$/.test(cleanId)
        ) {
          return;
        }

        const assetImports = new Map<string, string>();
        const transformed = code.replace(
          /\brequire\(\s*(["'])([^"']+\.(?:png|jpe?g|gif|webp|avif|bmp|ico|svg)(?:\?[^"']*)?)\1\s*\)/gi,
          (_match, _quote, source: string) => {
            let identifier = assetImports.get(source);
            if (!identifier) {
              identifier = `__workspace_asset_${assetImports.size}`;
              assetImports.set(source, identifier);
            }
            return identifier;
          }
        );
        if (!assetImports.size) return;

        const imports = Array.from(assetImports, ([source, identifier]) =>
          `import ${identifier} from ${JSON.stringify(source)};`
        ).join('\n');
        return { code: `${imports}\n${transformed}`, map: null };
      }
    },
    react(),
    vitePluginI18n(),
    svgr()
  ],
  resolve: {
    extensions: [
      '.web.tsx',
      '.web.ts',
      '.web.jsx',
      '.web.js',

      '.tsx',
      '.ts',
      '.jsx',
      '.js',
      '.json',
    ],
    alias: [
      {
        find: '@',
        replacement: new URL('./src', import.meta.url).pathname
      },
      // Support React Native Web
      // https://www.smashingmagazine.com/2016/08/a-glimpse-into-the-future-with-react-native-for-web/
      {
        find: /^react-native$/,
        replacement: require.resolve('react-native-web')
      },
      {
        find: /^react-native-svg$/,
        replacement: require.resolve('react-native-svg/lib/module/ReactNativeSVG.web.js')
      },
      {
        find: /^react-native-scrollable-tab-view$/,
        replacement: require.resolve('react-native-web-scrollable-tab-view')
      },
      {
        find: /^react-native-linear-gradient$/,
        replacement: require.resolve('react-native-web-linear-gradient')
      },
      {
        find: /^electron$/,
        replacement: new URL('./src/shims/electron.ts', import.meta.url).pathname
      },
      {
        find: /ims-icons$/,
        replacement: require.resolve('ims-icons/web')
      },
      {
        find: './ConfigProvider',
        replacement: require.resolve('shared/i18n/ConfigProvider.antd.jsx')
      }
    ]
  },
  server: {
    host: '0.0.0.0',
    hmr: true,
    open: true,
    port: 9000,
    // 仅 H5 端生效，其他端不生效（其他端走build，不走devServer)
    proxy: {
      '/apiuser': {
        target: `https://${current}user-api.imsdom.com`,
        changeOrigin: true,
        rewrite: path => path.replace(/^\/apiuser/, '')
      },
      '/apispace': {
        target: `https://${current}space-api.imsdom.com`,
        changeOrigin: true,
        rewrite: path => path.replace(/^\/apispace/, '')
      },
      '/apical': {
        target: `https://${current}cal-api.imsdom.com`,
        changeOrigin: true,
        rewrite: path => path.replace(/^\/apical/, '')
      },
      '/apigo': {
        target: `https://${current}g-api.imsdom.com`,
        changeOrigin: true,
        rewrite: path => path.replace(/^\/apigo/, '')
      }
    }
  },
}));
