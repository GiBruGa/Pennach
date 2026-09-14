import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// URL publique de l'appli (cf. vite.config.ts, base: '/Pennach/', servie sur GitHub Pages) —
// encodée en QR code sous le logo pour se passer facilement l'appli d'un téléphone à l'autre.
const URL_APPLI = 'https://gibruga.github.io/Pennach/'

// L'appli dépend du Web Bluetooth (liaison rameur/ceinture cardio), non supporté sous iOS —
// tous les téléphones de la famille sont donc sous Android. On encode une intent URL Android
// qui force l'ouverture avec Chrome (au lieu du navigateur par défaut du téléphone), avec un
// repli sur l'URL normale si Chrome n'est pas installé.
const URL_QR_CODE = `intent://${URL_APPLI.replace(
  'https://',
  '',
)}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(URL_APPLI)};end`

function CodePartage() {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    QRCode.toDataURL(URL_QR_CODE, { width: 160, margin: 1 })
      .then(setDataUrl)
      .catch(() => {})
  }, [])

  if (!dataUrl) return null

  return (
    <div className="code-partage">
      <img src={dataUrl} alt="Code QR de l'appli Pennac'h" width={160} height={160} />
      <span className="code-partage-legende">Scanner pour ouvrir Pennac'h</span>
    </div>
  )
}

export default function Accueil({ onCommencer }: { onCommencer: () => void }) {
  return (
    <div className="ecran-accueil">
      <img
        src={`${import.meta.env.BASE_URL}logo-blanc.svg`}
        alt="Pennac'h"
        className="logo-accueil"
      />
      <CodePartage />
      <button type="button" className="bouton-commencer" onClick={onCommencer}>
        Commencer
      </button>
      <p className="mentions-legales">
        Ceci est une application offerte par Gilles Brun Gautier'h, tous droits réservés
      </p>
    </div>
  )
}
