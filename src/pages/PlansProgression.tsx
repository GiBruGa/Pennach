import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProfil } from '../context/ProfilContext'
import { getPlansProgression, savePlanProgression, supprimerPlanProgression } from '../lib/storage'
import type { PlanProgression } from '../types'

export default function PlansProgression() {
  const { profil } = useProfil()
  const navigate = useNavigate()
  const [plans, setPlans] = useState<PlanProgression[] | null>(null)

  useEffect(() => {
    getPlansProgression(profil.id).then(setPlans)
  }, [profil.id])

  async function creerPlan() {
    const plan: PlanProgression = {
      id: crypto.randomUUID(),
      profilId: profil.id,
      nom: 'Nouveau plan de progression',
      etapes: [],
    }
    await savePlanProgression(plan)
    navigate(`/progression/${plan.id}`)
  }

  async function supprimer(id: string) {
    if (!confirm('Supprimer ce plan de progression ?')) return
    await supprimerPlanProgression(id)
    setPlans((p) => p?.filter((pl) => pl.id !== id) ?? null)
  }

  return (
    <div className="ecran-plans-progression">
      <h1>Karned Heuliañ — {profil.nom}</h1>
      {!plans ? (
        <p>Chargement…</p>
      ) : plans.length === 0 ? (
        <p>Aucun plan de progression.</p>
      ) : (
        <ul className="liste-programmes">
          {plans.map((p) => (
            <li key={p.id} className="carte-programme">
              <div className="infos">
                <strong>{p.nom}</strong>
                <span>{p.etapes.length} étape(s)</span>
              </div>
              <div className="actions">
                <Link to={`/progression/${p.id}`}>Ouvrir</Link>
                <button type="button" onClick={() => supprimer(p.id)}>
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={creerPlan}>
        Nouveau plan de progression
      </button>
    </div>
  )
}
