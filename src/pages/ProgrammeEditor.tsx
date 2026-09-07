import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useProfil } from '../context/ProfilContext'
import { getProgramme, saveProgramme } from '../lib/storage'
import type { Programme, Section } from '../types'

function nouvelleSection(): Section {
  return { id: crypto.randomUUID(), dureeSecondes: 60, nerzh: 8, tizh: 20, explication: '' }
}

export default function ProgrammeEditor() {
  const { profil } = useProfil()
  const { slot } = useParams()
  const navigate = useNavigate()
  const [programme, setProgramme] = useState<Programme | null>(null)
  const [enregistrement, setEnregistrement] = useState(false)

  useEffect(() => {
    getProgramme(profil.id, Number(slot)).then(setProgramme)
  }, [profil.id, slot])

  if (!programme) return <p>Chargement…</p>

  const dureeAutresSections = programme.sections
    .slice(0, -1)
    .reduce((total, s) => total + s.dureeSecondes, 0)
  const dureeDerniereSection = Math.max(0, programme.dureeTotaleSecondes - dureeAutresSections)

  function majSection(index: number, patch: Partial<Section>) {
    setProgramme((p) => {
      if (!p) return p
      const sections = p.sections.map((s, i) => (i === index ? { ...s, ...patch } : s))
      return { ...p, sections }
    })
  }

  function ajouterSection() {
    setProgramme((p) => (p ? { ...p, sections: [...p.sections, nouvelleSection()] } : p))
  }

  function supprimerSection(index: number) {
    setProgramme((p) => (p ? { ...p, sections: p.sections.filter((_, i) => i !== index) } : p))
  }

  async function enregistrer() {
    if (!programme) return
    setEnregistrement(true)
    const sections = programme.sections.map((s, i) =>
      i === programme.sections.length - 1 ? { ...s, dureeSecondes: dureeDerniereSection } : s,
    )
    try {
      await saveProgramme(profil.id, { ...programme, sections })
      navigate('/')
    } finally {
      setEnregistrement(false)
    }
  }

  return (
    <div className="ecran-editeur-programme">
      <h1>{programme.nom}</h1>

      <label>
        Nom
        <input
          value={programme.nom}
          onChange={(e) => setProgramme({ ...programme, nom: e.target.value })}
        />
      </label>

      <label>
        Durée totale (minutes)
        <input
          type="number"
          min={1}
          value={Math.round(programme.dureeTotaleSecondes / 60)}
          onChange={(e) =>
            setProgramme({ ...programme, dureeTotaleSecondes: Number(e.target.value) * 60 })
          }
        />
      </label>

      <label>
        Seuil d'écart de Tizh déclenchant rouge/vert (%)
        <input
          type="number"
          min={1}
          max={100}
          value={programme.seuilEcartTizhPourcent}
          onChange={(e) =>
            setProgramme({ ...programme, seuilEcartTizhPourcent: Number(e.target.value) })
          }
        />
      </label>

      <label className="case-a-cocher">
        <input
          type="checkbox"
          checked={programme.signalSonoreTizh}
          onChange={(e) => setProgramme({ ...programme, signalSonoreTizh: e.target.checked })}
        />
        Signal sonore du Tizh (bip à chaque coup prévu)
      </label>

      <h2>Sections</h2>
      <ul className="liste-sections">
        {programme.sections.map((section, i) => {
          const estDerniere = i === programme.sections.length - 1
          return (
            <li key={section.id} className="carte-section">
              <strong>Section {i + 1}</strong>
              <label>
                Durée (secondes)
                {estDerniere ? (
                  <input type="number" value={dureeDerniereSection} disabled />
                ) : (
                  <input
                    type="number"
                    min={1}
                    value={section.dureeSecondes}
                    onChange={(e) => majSection(i, { dureeSecondes: Number(e.target.value) })}
                  />
                )}
              </label>
              {estDerniere && <span className="note">temps restant du programme</span>}
              <label>
                Nerzh (résistance, 1-16)
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={section.nerzh}
                  onChange={(e) => majSection(i, { nerzh: Number(e.target.value) })}
                />
              </label>
              <label>
                Tizh prévu (coups/min)
                <input
                  type="number"
                  min={1}
                  value={section.tizh}
                  onChange={(e) => majSection(i, { tizh: Number(e.target.value) })}
                />
              </label>
              <label>
                Explication de l'exercice
                <textarea
                  maxLength={200}
                  value={section.explication}
                  onChange={(e) => majSection(i, { explication: e.target.value })}
                />
              </label>
              {!estDerniere && (
                <button type="button" onClick={() => supprimerSection(i)}>
                  Supprimer cette section
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <button type="button" onClick={ajouterSection}>
        Ajouter une section
      </button>

      <div className="actions-bas">
        <button type="button" onClick={() => navigate('/')}>
          Annuler
        </button>
        <button type="button" disabled={enregistrement} onClick={enregistrer}>
          Enregistrer
        </button>
      </div>
    </div>
  )
}
