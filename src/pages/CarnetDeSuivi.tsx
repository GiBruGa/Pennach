import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfil } from '../context/ProfilContext'
import { getOuCreerCarnet, savePlanProgression } from '../lib/storage'
import type { EtapeProgression, PlanProgression } from '../types'

const TYPES_SESSION = ["Reiñ Bec'h"]

function nouvelleEtape(numero: number): EtapeProgression {
  return {
    id: crypto.randomUUID(),
    numero,
    typeSession: TYPES_SESSION[0],
    parametres: { puissance: 5, rythme: 5, recuperation: 5, dureeTotaleMinutes: 45 },
  }
}

function formatDeiziad(ts?: number): string {
  return ts ? new Date(ts).toLocaleDateString('fr-FR') : '—'
}

function formatAmzervezh(secondes?: number): string {
  if (!secondes) return '—'
  const min = Math.floor(secondes / 60)
  const sec = secondes % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export default function CarnetDeSuivi() {
  const { profil } = useProfil()
  const navigate = useNavigate()
  const [carnet, setCarnet] = useState<PlanProgression | null>(null)
  const [etapeOuverteId, setEtapeOuverteId] = useState<string | null>(null)
  const [brouillon, setBrouillon] = useState<EtapeProgression | null>(null)

  const refProchaine = useRef<HTMLTableRowElement | null>(null)
  const dejaDefile = useRef(false)

  useEffect(() => {
    getOuCreerCarnet(profil.id).then(setCarnet)
  }, [profil.id])

  useEffect(() => {
    if (carnet && !dejaDefile.current && refProchaine.current) {
      refProchaine.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
      dejaDefile.current = true
    }
  }, [carnet])

  if (!carnet) return <p>Chargement…</p>

  const indexProchaine = carnet.etapes.findIndex((e) => !e.dateRealisee)

  function ouvrir(etape: EtapeProgression) {
    setEtapeOuverteId(etape.id)
    setBrouillon({ ...etape, parametres: { ...etape.parametres } })
  }

  function fermer() {
    setEtapeOuverteId(null)
    setBrouillon(null)
  }

  async function sauvegarderCarnet(etapes: EtapeProgression[]) {
    if (!carnet) return
    const carnetMaj = { ...carnet, etapes }
    await savePlanProgression(carnetMaj)
    setCarnet(carnetMaj)
  }

  async function sauvegarder() {
    if (!carnet || !brouillon) return
    await sauvegarderCarnet(carnet.etapes.map((e) => (e.id === brouillon.id ? brouillon : e)))
    fermer()
  }

  async function sauvegarderEtLancer() {
    if (!carnet || !brouillon) return
    const etapes = carnet.etapes.map((e) => (e.id === brouillon.id ? brouillon : e))
    await sauvegarderCarnet(etapes)
    navigate(`/seance/${carnet.id}/${brouillon.id}`)
  }

  async function supprimer() {
    if (!carnet || !brouillon) return
    await sauvegarderCarnet(
      carnet.etapes.filter((e) => e.id !== brouillon.id).map((e, i) => ({ ...e, numero: i + 1 })),
    )
    fermer()
  }

  function ajouterEtape() {
    if (!carnet) return
    const indexSelectionnee = etapeOuverteId
      ? carnet.etapes.findIndex((e) => e.id === etapeOuverteId)
      : -1
    const nouvelle = nouvelleEtape(0)
    const etapes =
      indexSelectionnee >= 0
        ? [
            ...carnet.etapes.slice(0, indexSelectionnee + 1),
            nouvelle,
            ...carnet.etapes.slice(indexSelectionnee + 1),
          ]
        : [...carnet.etapes, nouvelle]
    sauvegarderCarnet(etapes.map((e, i) => ({ ...e, numero: i + 1 })))
  }

  return (
    <div className="ecran-carnet-de-suivi">
      <h1>Karned Heuliañ — {profil.nom}</h1>
      <div className="barre-outils-carnet">
        <button type="button" onClick={ajouterEtape}>
          {etapeOuverteId ? 'Ajouter après' : 'Ajouter une séance'}
        </button>
      </div>
      <div className="table-carnet-conteneur">
        <table className="table-carnet">
          <thead>
            <tr>
              <th>N°</th>
              <th>Type</th>
              <th>Nerzh</th>
              <th>Tizh</th>
              <th>Adnerzhañ</th>
              <th>Padelezh</th>
              <th>Résultat</th>
              <th>Arabat Disoñjal</th>
            </tr>
          </thead>
          <tbody>
            {carnet.etapes.map((etape, i) => {
              const estProchaine = i === indexProchaine
              const estOuverte = etapeOuverteId === etape.id
              const realisee = Boolean(etape.dateRealisee)
              return (
                <Fragment key={etape.id}>
                  <tr
                    ref={estProchaine ? refProchaine : undefined}
                    className={`ligne-etape${estProchaine ? ' ligne-prochaine' : ''}${estOuverte ? ' ligne-ouverte' : ''}`}
                    onClick={() => (estOuverte ? fermer() : ouvrir(etape))}
                  >
                    <td>
                      {etape.numero}
                      {estProchaine && <span className="badge-prochaine">prochaine</span>}
                    </td>
                    <td>{etape.typeSession}</td>
                    <td>{etape.parametres.puissance}</td>
                    <td>{etape.parametres.rythme}</td>
                    <td>{etape.parametres.recuperation}</td>
                    <td>{etape.parametres.dureeTotaleMinutes} min</td>
                    <td className="cellule-resultat">
                      {realisee ? (
                        <>
                          Deiziad : {formatDeiziad(etape.dateRealisee)}
                          <br />
                          Amzervezh : {formatAmzervezh(etape.dureeReelleSecondes)}
                          {etape.kmRealises !== undefined && (
                            <>
                              <br />
                              Pellder : {etape.kmRealises} km
                            </>
                          )}
                        </>
                      ) : (
                        'à venir'
                      )}
                    </td>
                    <td className="cellule-arabat">{etape.remarques || '—'}</td>
                  </tr>
                  {estOuverte && brouillon && (
                    <tr className="ligne-edition">
                      <td colSpan={8}>
                        {realisee ? (
                          <div className="panneau-edition" onClick={(e) => e.stopPropagation()}>
                            <div className="resume-resultat">
                              <div>Deiziad : {formatDeiziad(brouillon.dateRealisee)}</div>
                              <div>Amzervezh : {formatAmzervezh(brouillon.dureeReelleSecondes)}</div>
                              <div>
                                Pellder : {brouillon.kmRealises !== undefined ? `${brouillon.kmRealises} km` : '—'}
                              </div>
                              <div>
                                Energiezh :{' '}
                                {brouillon.energieDepenseeKcal !== undefined
                                  ? `${brouillon.energieDepenseeKcal} kcal`
                                  : '—'}
                              </div>
                            </div>
                            <label>
                              Arabat Disoñjal
                              <textarea
                                value={brouillon.remarques ?? ''}
                                onChange={(e) => setBrouillon({ ...brouillon, remarques: e.target.value })}
                              />
                            </label>
                            <div className="actions-panneau">
                              <button type="button" onClick={supprimer}>
                                Supprimer
                              </button>
                              <button type="button" onClick={sauvegarder}>
                                Fermer (sauvegarder)
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="panneau-edition" onClick={(e) => e.stopPropagation()}>
                            <label>
                              Type de séance
                              <select
                                value={brouillon.typeSession}
                                onChange={(e) => setBrouillon({ ...brouillon, typeSession: e.target.value })}
                              >
                                {TYPES_SESSION.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div className="ligne-parametres">
                              <label>
                                Nerzh (1-10)
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={brouillon.parametres.puissance}
                                  onChange={(e) =>
                                    setBrouillon({
                                      ...brouillon,
                                      parametres: { ...brouillon.parametres, puissance: Number(e.target.value) },
                                    })
                                  }
                                />
                              </label>
                              <label>
                                Tizh (Riw/min)
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={brouillon.parametres.rythme}
                                  onChange={(e) =>
                                    setBrouillon({
                                      ...brouillon,
                                      parametres: { ...brouillon.parametres, rythme: Number(e.target.value) },
                                    })
                                  }
                                />
                              </label>
                              <label>
                                Adnerzhañ (1-10)
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={brouillon.parametres.recuperation}
                                  onChange={(e) =>
                                    setBrouillon({
                                      ...brouillon,
                                      parametres: {
                                        ...brouillon.parametres,
                                        recuperation: Number(e.target.value),
                                      },
                                    })
                                  }
                                />
                              </label>
                              <label>
                                Padelezh (min)
                                <input
                                  type="number"
                                  min={1}
                                  value={brouillon.parametres.dureeTotaleMinutes}
                                  onChange={(e) =>
                                    setBrouillon({
                                      ...brouillon,
                                      parametres: {
                                        ...brouillon.parametres,
                                        dureeTotaleMinutes: Number(e.target.value),
                                      },
                                    })
                                  }
                                />
                              </label>
                            </div>
                            <label>
                              Arabat Disoñjal
                              <textarea
                                value={brouillon.remarques ?? ''}
                                onChange={(e) => setBrouillon({ ...brouillon, remarques: e.target.value })}
                              />
                            </label>
                            <div className="actions-panneau">
                              <button type="button" onClick={fermer}>
                                Sortir
                              </button>
                              <button type="button" onClick={supprimer}>
                                Supprimer
                              </button>
                              <button type="button" onClick={sauvegarder}>
                                Sauvegarder
                              </button>
                              <button type="button" onClick={sauvegarderEtLancer}>
                                Lancer
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
