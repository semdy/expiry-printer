import { ApiProvider } from 'ims-data'
import { getCurrentLang } from 'shared/i18n'
import { ThemeProvider } from 'shared/theme'
import { promisify } from 'shared/utils'
import MobileApp from './MobileApp'

export function getSearchParams(search = '', name = '') {
  const reg = new RegExp(`(^|&)${name}=([^&]*)(&|$)`)
  const r = search.substring(1).match(reg)
  if (r != null) return decodeURIComponent(r[2])
  return null
}

async function getHeader() {
  return {
    token: getSearchParams(window.location.search, 'token'),
    lang: await promisify(getCurrentLang()),
  }
}

export default function App() {
  return (
    <ApiProvider getHeaders={getHeader}>
      <ThemeProvider>
        <MobileApp />
      </ThemeProvider>
    </ApiProvider>
  )
}
