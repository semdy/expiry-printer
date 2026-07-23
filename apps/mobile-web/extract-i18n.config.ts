import { defineConfig } from 'extract-i18n-plugin';
import { GoogleTranslator } from 'extract-i18n-plugin/translators'

export default defineConfig({
  includePath: ['src'],
  excludedPath: ['**/node_modules/**', '**/src/locales/**', '**/src/components/LanguageSwitcher.tsx'],
  translateKey: 't',
  hooksIdentifier: 'useTranslation',
  injectHooks: true,
  fromLang: 'zh-cn',
  translateLangKeys: ['zh-tw', 'en'],
  outputPath: 'src/locales/gen',
  i18nPkgImportPath: '@/locales',
  translator: new GoogleTranslator({
    proxyOption: {
      port: 7890,
      host: '127.0.0.1',
      headers: {
        'User-Agent': 'Node'
      }
    }
  })
});
