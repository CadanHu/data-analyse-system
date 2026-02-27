import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Language, getStoredLanguage, setStoredLanguage } from '../i18n/translations'

interface LanguageState {
  language: Language
  setLanguage: (lang: Language) => void
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: getStoredLanguage(),
      setLanguage: (lang) => {
        setStoredLanguage(lang)
        set({ language: lang })
      },
    }),
    {
      name: 'datapulse-language-storage',
      partialize: (state) => ({ language: state.language }),
    }
  )
)
