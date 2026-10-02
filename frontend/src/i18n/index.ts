import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ta from './locales/ta.json'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
] as const

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('bhoomi-lang') : null

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ta: { translation: ta } },
  lng: stored ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
  try {
    localStorage.setItem('bhoomi-lang', lng)
  } catch {
    /* storage unavailable */
  }
})
if (typeof document !== 'undefined') document.documentElement.lang = i18n.language

export default i18n
