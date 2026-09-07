import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfil } from '../context/ProfilContext'
import { getProgrammes } from '../lib/storage'
import type { Programme } from '../types'

export default function ProgrammesList() {
  const { profil } = useProfil()
  const [programmes, setProgrammes] = useState<Programme[] | null>(null)

  useEffect(() => {
    getProgrammes(profil.id).then(setProgrammes)
  }, [profil.id])

  return (
    <div className="ecran-programmes">
      <h1>Programmes de {profil.nom}</h1>
      {!programmes ? (
        <p>Chargement…</p>
      ) : (
        <ul className="liste-programmes">
          {programmes.map((p) => (
            <li key={p.slot} className="carte-programme">
              <div className="infos">
                <strong>{p.nom}</strong>
                <span>{p.sections.length} section(s)</span>
              </div>
              <div className="actions">
                <Link to={`/programme/${p.slot}`}>Modifier</Link>
                {p.sections.length > 0 && <Link to={`/seance/${p.slot}`}>Démarrer</Link>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
