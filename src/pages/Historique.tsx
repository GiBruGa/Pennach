import { useEffect, useState } from 'react'
import { useProfil } from '../context/ProfilContext'
import { getHistorique } from '../lib/storage'
import type { Seance } from '../types'

function formatDuree(ms: number): string {
  const total = Math.round(ms / 1000)
  const min = Math.floor(total / 60)
  const sec = total % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export default function Historique() {
  const { profil } = useProfil()
  const [seances, setSeances] = useState<Seance[] | null>(null)

  useEffect(() => {
    getHistorique(profil.id).then(setSeances)
  }, [profil.id])

  return (
    <div className="ecran-historique">
      <h1>Historique de {profil.nom}</h1>
      {!seances ? (
        <p>Chargement…</p>
      ) : seances.length === 0 ? (
        <p>Aucune séance enregistrée.</p>
      ) : (
        <ul className="liste-seances">
          {seances.map((s) => (
            <li key={s.id} className="carte-seance">
              <strong>{s.programmeNom}</strong>
              <span>{new Date(s.debut).toLocaleString('fr-FR')}</span>
              <span>{s.fin ? formatDuree(s.fin - s.debut) : '—'}</span>
              <span className={`statut statut-${s.statut}`}>{s.statut}</span>
              <span>{s.evenements.length} événement(s)</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
