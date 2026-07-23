import { useState, type ChangeEvent } from 'react';
import { type SupportLocale, locale, changeLanguage, languageList } from '@/locales';

export default function LanguageSwitcher() {
  const [value, setValue] = useState(locale);
  const onChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const locale = event.target.value as SupportLocale;
    setValue(locale);
    changeLanguage(locale);
  };

  return (
    <select className="language-switcher" aria-label="Language" value={value} onChange={onChange}>
      {languageList.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
