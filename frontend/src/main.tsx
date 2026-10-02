import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import { App } from './app/App'

try {
  const theme = localStorage.getItem('bhoomi-theme')
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  if (theme === 'dark' || (!theme && prefersDark)) document.documentElement.classList.add('dark')
} catch {
  /* storage unavailable */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
