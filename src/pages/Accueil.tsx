import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// URL publique de l'appli (cf. vite.config.ts, base: '/Pennach/', servie sur GitHub Pages) —
// encodée en QR code sous le logo pour se passer facilement l'appli d'un téléphone à l'autre.
const URL_APPLI = 'https://gibruga.github.io/Pennach/'

function CodePartage() {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    QRCode.toDataURL(URL_APPLI, { width: 160, margin: 1 })
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
