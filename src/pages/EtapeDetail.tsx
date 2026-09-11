import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getPlanProgression, savePlanProgression } from '../lib/storage'
import type { EtapeProgression, PlanProgression } from '../types'

function formatDeiziad(ts?: number): string {
  return ts ? new Date(ts).toLocaleDateString('fr-FR') : '—'
}

function formatAmzervezh(secondes?: number): string {
  if (!secondes) return '—'
  const min = Math.floor(secondes / 60)
  const sec = secondes % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export default function EtapeDetail() {
  const { planId, etapeId } = useParams()
  const navigate = useNavigate()

  const [carnet, setCarnet] = useState<PlanProgression | null>(null)
  const [erreurChargement, setErreurChargement] = useState<string | null>(null)
  const [brouillon, setBrouillon] = useState<EtapeProgression | null>(null)

  useEffect(() => {
    if (!planId || !etapeId) return
    getPlanProgression(planId).then((p) => {
      if (!p) {
        setErreurChargement('Plan introuvable.')
        return
      }
      const e = p.etapes.find((x) => x.id === etapeId)
      if (!e) {
        setErreurChargement('Séance introuvable dans ce carnet.')
        return
      }
      setCarnet(p)
      setBrouillon({ ...e, parametres: { ...e.parametres } })
    })
  }, [planId, etapeId])

  if (erreurChargement) return <p className="erreur">{erreurChargement}</p>
  if (!carnet || !brouillon) return <p>Chargement…</p>

  const indexProchaine = carnet.etapes.findIndex((e) => !e.dateRealisee)
  const etapeIndex = carnet.etapes.findIndex((e) => e.id === brouillon.id)
  const realisee = Boolean(brouillon.dateRealisee)
  const estProchaine = etapeIndex === indexProchaine

  async function sauvegarderCarnet(etapes: EtapeProgression[]) {
    const carnetMaj = { ...carnet!, etapes }
    await savePlanProgression(carnetMaj)
  }

  async function sauvegarder() {
    await sauvegarderCarnet(carnet!.etapes.map((e) => (e.id === brouillon!.id ? brouillon! : e)))
    navigate('/')
  }

  async function lancer() {
    await sauvegarderCarnet(carnet!.etapes.map((e) => (e.id === brouillon!.id ? brouillon! : e)))
    navigate(`/seance/${carnet!.id}/${brouillon!.id}`)
  }

  return (
    <div className="ecran-etape-detail">
      <div className="barre-titre-carnet">
        <Link to="/" className="lien-retour-carnet">
          ◀ Retour
        </Link>
        <span className="titre-karned">Karned Heuliañ</span>
      </div>

      <div className="carte-etape-detail">
        <div className="detail-colonne-params">
        <div className="carte-etape-entete">
          <span>
            No. <strong>{brouillon.numero}</strong>&nbsp;&nbsp;&nbsp;Type{' '}
            <strong>{brouillon.typeSession}</strong>
          </span>
        </div>
        {estProchaine && <span className="badge-prochaine">Prochaine Séance</span>}
        {realisee && <span className="badge-terminee">Terminée</span>}

        <div className="liste-params-detail">
          <div className="ligne-param-detail">
            <span className="param-detail-label">Nerzh</span>
            {realisee ? (
              <span className="param-detail-boite pastille-nerzh">{brouillon.parametres.puissance}</span>
            ) : (
              <input
                type="number"
                min={1}
                max={10}
                className="param-detail-boite pastille-nerzh"
                value={brouillon.parametres.puissance}
                onChange={(e) =>
                  setBrouillon({
                    ...brouillon,
                    parametres: { ...brouillon.parametres, puissance: Number(e.target.value) },
                  })
                }
              />
            )}
          </div>
          <div className="ligne-param-detail">
            <span className="param-detail-label">Tizh</span>
            {realisee ? (
              <span className="param-detail-boite pastille-tizh">{brouillon.parametres.rythme}</span>
            ) : (
              <input
                type="number"
                min={1}
                max={10}
                className="param-detail-boite pastille-tizh"
                value={brouillon.parametres.rythme}
                onChange={(e) =>
                  setBrouillon({
                    ...brouillon,
                    parametres: { ...brouillon.parametres, rythme: Number(e.target.value) },
                  })
                }
              />
            )}
          </div>
          <div className="ligne-param-detail">
            <span className="param-detail-label">Adnerzhañ</span>
            {realisee ? (
              <span className="param-detail-boite pastille-adnerzhan">
                {brouillon.parametres.recuperation}
              </span>
            ) : (
              <input
                type="number"
                min={1}
                max={10}
                className="param-detail-boite pastille-adnerzhan"
                value={brouillon.parametres.recuperation}
                onChange={(e) =>
                  setBrouillon({
                    ...brouillon,
                    parametres: { ...brouillon.parametres, recuperation: Number(e.target.value) },
                  })
                }
              />
            )}
          </div>
          <div className="ligne-param-detail">
            <span className="param-detail-label">Padelezh</span>
            {realisee ? (
              <span className="param-detail-boite pastille-padelezh">
                {brouillon.parametres.dureeTotaleMinutes}
              </span>
            ) : (
              <input
                type="number"
                min={1}
                className="param-detail-boite pastille-padelezh"
                value={brouillon.parametres.dureeTotaleMinutes}
                onChange={(e) =>
                  setBrouillon({
                    ...brouillon,
                    parametres: { ...brouillon.parametres, dureeTotaleMinutes: Number(e.target.value) },
                  })
                }
              />
            )}
            <span className="param-detail-unite">min</span>
          </div>
        </div>

        <div className="arabat-detail">
          <div className="param-detail-label">Arabat Disoñjal</div>
          {realisee ? (
            <div className="arabat-detail-texte">{brouillon.remarques || '—'}</div>
          ) : (
            <textarea
              className="arabat-detail-texte arabat-detail-champ"
              value={brouillon.remarques ?? ''}
              onChange={(e) => setBrouillon({ ...brouillon, remarques: e.target.value })}
            />
          )}
        </div>

        {realisee && (
          <>
            <hr />
            <div className="titre-resultats-detail">Résultats</div>
            <div className="liste-params-detail">
              <div className="ligne-param-detail">
                <span className="param-detail-label">Deiziad</span>
                <span className="param-detail-valeur-simple">{formatDeiziad(brouillon.dateRealisee)}</span>
              </div>
              <div className="ligne-param-detail">
                <span className="param-detail-label">Amzervezh</span>
                <span className="param-detail-boite pastille-amzervezh">
                  {formatAmzervezh(brouillon.dureeReelleSecondes)}
                </span>
                <span className="param-detail-unite">min:ss</span>
              </div>
              <div className="ligne-param-detail">
                <span className="param-detail-label">Pellder</span>
                <span className="param-detail-boite pastille-pellder">
                  {brouillon.kmRealises !== undefined ? brouillon.kmRealises : '—'}
                </span>
                <span className="param-detail-unite">km</span>
              </div>
              <div className="ligne-param-detail">
                <span className="param-detail-label">Energiezh</span>
                <span className="param-detail-boite pastille-energiezh">
                  {brouillon.energieDepenseeKcal !== undefined ? brouillon.energieDepenseeKcal : '—'}
                </span>
                <span className="param-detail-unite">kcal</span>
              </div>
            </div>
          </>
        )}
        </div>

        {!realisee && (
          <div className="actions-detail">
            <button type="button" onClick={sauvegarder}>
              Sauvegarder
            </button>
            <button type="button" onClick={() => navigate('/')}>
              Abandonner
            </button>
            {estProchaine && (
              <button type="button" className="bouton-lancer-detail" onClick={lancer}>
                Lancer
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
