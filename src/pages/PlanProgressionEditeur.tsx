import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getPlanProgression, savePlanProgression } from '../lib/storage'
import type { EtapeProgression, PlanProgression } from '../types'

function nouvelleEtape(numero: number): EtapeProgression {
  return {
    id: crypto.randomUUID(),
    numero,
    phase: '',
    parametres: { puissance: 5, rythme: 5, recuperation: 5, dureeTotaleMinutes: 45 },
  }
}

function formatDateInput(ts?: number): string {
  if (!ts) return ''
  return new Date(ts).toISOString().slice(0, 10)
}

export default function PlanProgressionEditeur() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [plan, setPlan] = useState<PlanProgression | null>(null)
  const [enregistrement, setEnregistrement] = useState(false)

  useEffect(() => {
    if (id) getPlanProgression(id).then(setPlan)
  }, [id])

  if (!plan) return <p>Chargement…</p>

  function majEtape(index: number, patch: Partial<EtapeProgression>) {
    setPlan((p) => {
      if (!p) return p
      const etapes = p.etapes.map((e, i) => (i === index ? { ...e, ...patch } : e))
      return { ...p, etapes }
    })
  }

  function ajouterEtape() {
    setPlan((p) => (p ? { ...p, etapes: [...p.etapes, nouvelleEtape(p.etapes.length + 1)] } : p))
  }

  function supprimerEtape(index: number) {
    setPlan((p) =>
      p
        ? {
            ...p,
            etapes: p.etapes
              .filter((_, i) => i !== index)
              .map((e, i) => ({ ...e, numero: i + 1 })),
          }
        : p,
    )
  }

  async function enregistrer() {
    if (!plan) return
    setEnregistrement(true)
    try {
      await savePlanProgression(plan)
      navigate('/progression')
    } finally {
      setEnregistrement(false)
    }
  }

  return (
    <div className="ecran-plan-progression">
      <label>
        Nom du plan
        <input value={plan.nom} onChange={(e) => setPlan({ ...plan, nom: e.target.value })} />
      </label>

      <ul className="liste-etapes-progression">
        {plan.etapes.map((etape, i) => (
          <li key={etape.id} className="carte-etape-progression">
            <strong>Séance {etape.numero}</strong>
            <label>
              Phase
              <input
                value={etape.phase}
                onChange={(e) => majEtape(i, { phase: e.target.value })}
                placeholder="ex : Phase 1 - Adaptation Volume"
              />
            </label>
            <div className="ligne-parametres">
              <label>
                Puissance (1-10)
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={etape.parametres.puissance}
                  onChange={(e) =>
                    majEtape(i, {
                      parametres: { ...etape.parametres, puissance: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                Rythme (1-10)
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={etape.parametres.rythme}
                  onChange={(e) =>
                    majEtape(i, {
                      parametres: { ...etape.parametres, rythme: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                Récupération (1-10)
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={etape.parametres.recuperation}
                  onChange={(e) =>
                    majEtape(i, {
                      parametres: { ...etape.parametres, recuperation: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                Durée (min)
                <input
                  type="number"
                  min={1}
                  value={etape.parametres.dureeTotaleMinutes}
                  onChange={(e) =>
                    majEtape(i, {
                      parametres: {
                        ...etape.parametres,
                        dureeTotaleMinutes: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>

            <details>
              <summary>Résultats réels</summary>
              <div className="ligne-resultats">
                <label>
                  Date réalisée
                  <input
                    type="date"
                    value={formatDateInput(etape.dateRealisee)}
                    onChange={(e) =>
                      majEtape(i, {
                        dateRealisee: e.target.value ? new Date(e.target.value).getTime() : undefined,
                      })
                    }
                  />
                </label>
                <label>
                  Kalon moyen (bpm)
                  <input
                    type="number"
                    value={etape.frequenceCardiaqueMoyenne ?? ''}
                    onChange={(e) =>
                      majEtape(i, { frequenceCardiaqueMoyenne: Number(e.target.value) || undefined })
                    }
                  />
                </label>
                <label>
                  Kalon max (bpm)
                  <input
                    type="number"
                    value={etape.frequenceCardiaqueMax ?? ''}
                    onChange={(e) =>
                      majEtape(i, { frequenceCardiaqueMax: Number(e.target.value) || undefined })
                    }
                  />
                </label>
                <label>
                  km réalisés
                  <input
                    type="number"
                    step="0.1"
                    value={etape.kmRealises ?? ''}
                    onChange={(e) => majEtape(i, { kmRealises: Number(e.target.value) || undefined })}
                  />
                </label>
                <label>
                  Énergie dépensée (kcal)
                  <input
                    type="number"
                    value={etape.energieDepensee ?? ''}
                    onChange={(e) =>
                      majEtape(i, { energieDepensee: Number(e.target.value) || undefined })
                    }
                  />
                </label>
              </div>
              <label>
                Remarques
                <textarea
                  value={etape.remarques ?? ''}
                  onChange={(e) => majEtape(i, { remarques: e.target.value })}
                />
              </label>
            </details>

            <button type="button" onClick={() => supprimerEtape(i)}>
              Supprimer cette étape
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={ajouterEtape}>
        Ajouter une étape
      </button>

      <div className="actions-bas">
        <button type="button" onClick={() => navigate('/progression')}>
          Annuler
        </button>
        <button type="button" disabled={enregistrement} onClick={enregistrer}>
          Enregistrer
        </button>
      </div>
    </div>
  )
}
