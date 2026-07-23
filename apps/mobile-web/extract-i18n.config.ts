import { defineConfig } from 'extract-i18n-plugin';
import { GoogleTranslator } from 'extract-i18n-plugin/translators';

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
  customTranslatedText: (text: string, toLang: string): string => {
    if (toLang === 'en') {
      const textArr = text.split(/\s+/)
      // 少于4个单词的句子每个单词首字母大写
      if (textArr.length <= 3) {
        return textArr
          .map(v => {
            return v.charAt(0).toUpperCase() + v.slice(1)
          })
          .join(' ')
      }
    }
    return text
  },
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
