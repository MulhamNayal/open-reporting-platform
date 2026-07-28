import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import './index.css'
import './meridian-tokens.css'
import App from './App.tsx'
import { buildTheme } from './theme.ts'
import { AppearanceProvider, useAppearance } from './appearance/AppearanceContext'

function ThemedApp() {
  const { mode } = useAppearance()
  return (
    <ThemeProvider theme={buildTheme(mode)}>
      <App />
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppearanceProvider>
      <ThemedApp />
    </AppearanceProvider>
  </StrictMode>,
)
