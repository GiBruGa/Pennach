import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Longhand properties (pas le raccourci `background`) pour laisser `background-position`
// entièrement piloté par CSS (media query portrait/paysage dans index.css) sans conflit
// avec le style inline, plus prioritaire qu'une règle de feuille de style.
document.body.style.backgroundColor = '#0a1930'
document.body.style.backgroundImage = `url(${import.meta.env.BASE_URL}fond.jpg)`
document.body.style.backgroundSize = 'cover'
document.body.style.backgroundAttachment = 'fixed'
document.body.style.backgroundRepeat = 'no-repeat'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
