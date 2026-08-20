import { ApiProvider } from 'ims-data';
import { getCurrentLang } from 'shared/i18n';
import MobileApp from '@/MobileApp';

export function getSearchParams(search = '', name = '') {
  const reg = new RegExp(`(^|&)${name}=([^&]*)(&|$)`);
  const r = search.substring(1).match(reg);
  if (r != null) return decodeURIComponent(r[2]);
  return null;
}

function getHeader() {
  return {
    token: localStorage.getItem('ims_token') || getSearchParams(window.location.search, 'token'),
    lang: getCurrentLang()
  };
}

export default function App() {
  return (
    <ApiProvider getHeaders={getHeader}>
      <MobileApp />
    </ApiProvider>
  );
}
