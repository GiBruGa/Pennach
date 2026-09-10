import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

document.body.style.background = `#0a1930 url(${import.meta.env.BASE_URL}fond.jpg) left center / cover fixed no-repeat`

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
