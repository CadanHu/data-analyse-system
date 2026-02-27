import { useTranslation } from '../hooks/useTranslation'

interface LanguageSwitcherProps {
  className?: string
}

export default function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const { language, changeLanguage } = useTranslation()

  return (
    <div className={`inline-flex items-center gap-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-1 ${className}`}>
      <button
        onClick={() => changeLanguage('zh')}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
          language === 'zh'
            ? 'bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] text-white shadow-md'
            : 'text-gray-400 hover:text-white hover:bg-white/5'
        }`}
      >
        中文
      </button>
      <button
        onClick={() => changeLanguage('en')}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
          language === 'en'
            ? 'bg-gradient-to-r from-[#3b82f6] to-[#06d6a0] text-white shadow-md'
            : 'text-gray-400 hover:text-white hover:bg-white/5'
        }`}
      >
        EN
      </button>
    </div>
  )
}
