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
  const refOuverte = useRef<HTMLTableRowElement | null>(null)
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

  useEffect(() => {
    if (etapeOuverteId && refOuverte.current) {
      refOuverte.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [etapeOuverteId])

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

  async function ajouterEtape() {
    if (!carnet) return
    const nouvelle = nouvelleEtape(0)
    const etapes = [...carnet.etapes, nouvelle].map((e, i) => ({ ...e, numero: i + 1 }))
    await sauvegarderCarnet(etapes)
    const ajoutee = etapes.find((e) => e.id === nouvelle.id)
    if (ajoutee) ouvrir(ajoutee)
  }

  async function ajouterApres(etapeId: string) {
    if (!carnet) return
    const index = carnet.etapes.findIndex((e) => e.id === etapeId)
    if (index < 0) return
    const nouvelle = nouvelleEtape(0)
    const etapes = [
      ...carnet.etapes.slice(0, index + 1),
      nouvelle,
      ...carnet.etapes.slice(index + 1),
    ].map((e, i) => ({ ...e, numero: i + 1 }))
    await sauvegarderCarnet(etapes)
    const ajoutee = etapes.find((e) => e.id === nouvelle.id)
    if (ajoutee) ouvrir(ajoutee)
  }

  return (
    <div className="ecran-carnet-de-suivi">
      <h1>Karned Heuliañ — {profil.nom}</h1>
      <div className="barre-outils-carnet">
        <button type="button" onClick={ajouterEtape}>
          Ajouter une séance
        </button>
      </div>
      <div className="table-carnet-conteneur">
        <table className="table-carnet">
          <thead>
            <tr>
              <th className="cellule-numerique">N°</th>
              <th>Type</th>
              <th className="cellule-numerique">Nerzh</th>
              <th className="cellule-numerique">Tizh</th>
              <th className="cellule-numerique">Adnerzhañ</th>
              <th className="cellule-numerique">Padelezh</th>
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
                    <td className="cellule-numerique" data-label="N°">
                      {etape.numero}
                      {estProchaine && <span className="badge-prochaine">prochaine</span>}
                    </td>
                    <td data-label="Type">{etape.typeSession}</td>
                    <td className="cellule-numerique" data-label="Nerzh">
                      {etape.parametres.puissance}
                    </td>
                    <td className="cellule-numerique" data-label="Tizh">
                      {etape.parametres.rythme}
                    </td>
                    <td className="cellule-numerique" data-label="Adnerzhañ">
                      {etape.parametres.recuperation}
                    </td>
                    <td className="cellule-numerique" data-label="Padelezh">
                      {etape.parametres.dureeTotaleMinutes} min
                    </td>
                    <td className="cellule-resultat" data-label="Résultat">
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
                    <td className="cellule-arabat" data-label="Arabat Disoñjal">
                      {etape.remarques || '—'}
                    </td>
                  </tr>
                  {estOuverte && brouillon && (
                    <tr className="ligne-edition" ref={refOuverte}>
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
                            <div className="groupe-actions">
                              <div className="actions-panneau">
                                <button type="button" onClick={supprimer}>
                                  Supprimer
                                </button>
                                <button type="button" onClick={sauvegarder}>
                                  Fermer (sauvegarder)
                                </button>
                              </div>
                              <button
                                type="button"
                                className="bouton-ajouter-apres"
                                onClick={() => ajouterApres(brouillon.id)}
                              >
                                Ajouter après
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="panneau-edition" onClick={(e) => e.stopPropagation()}>
                            <div className="ligne-parametres">
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
                              <label className="champ-etale-3">
                                Arabat Disoñjal
                                <textarea
                                  value={brouillon.remarques ?? ''}
                                  onChange={(e) => setBrouillon({ ...brouillon, remarques: e.target.value })}
                                />
                              </label>
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
                            <div className="groupe-actions">
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
                                <button type="button" onClick={sauvegarderEtLancer} className="bouton-lancer">
                                  Lancer
                                </button>
                              </div>
                              <button
                                type="button"
                                className="bouton-ajouter-apres"
                                onClick={() => ajouterApres(brouillon.id)}
                              >
                                Ajouter après
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
