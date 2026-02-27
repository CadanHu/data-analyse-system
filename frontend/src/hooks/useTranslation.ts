import { useCallback } from 'react'
import { useLanguageStore } from '../stores/languageStore'
import { translations, Language, TranslationKey } from '../i18n/translations'

export function useTranslation() {
  const { language, setLanguage } = useLanguageStore()

  const t = useCallback(
    (key: TranslationKey): string => {
      return translations[language][key] || key
    },
    [language]
  )

  const changeLanguage = useCallback(
    (lang: Language) => {
      setLanguage(lang)
    },
    [setLanguage]
  )

  return {
    t,
    language,
    changeLanguage,
  }
}
