import { useEffect, useRef, useState } from 'react'
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

export default function CarnetDeSuivi() {
  const { profil } = useProfil()
  const navigate = useNavigate()
  const [carnet, setCarnet] = useState<PlanProgression | null>(null)

  const refProchaine = useRef<HTMLDivElement | null>(null)
  const dejaDefile = useRef(false)

  useEffect(() => {
    getOuCreerCarnet(profil.id).then(setCarnet)
  }, [profil.id])

  useEffect(() => {
    if (carnet && !dejaDefile.current && refProchaine.current) {
      refProchaine.current.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
      dejaDefile.current = true
    }
  }, [carnet])

  if (!carnet) return <p>Chargement…</p>

  const indexProchaine = carnet.etapes.findIndex((e) => !e.dateRealisee)

  async function ajouterEtape() {
    if (!carnet) return
    const nouvelle = nouvelleEtape(0)
    const etapes = [...carnet.etapes, nouvelle].map((e, i) => ({ ...e, numero: i + 1 }))
    const carnetMaj = { ...carnet, etapes }
    await savePlanProgression(carnetMaj)
    setCarnet(carnetMaj)
    navigate(`/etape/${carnet.id}/${nouvelle.id}`)
  }

  return (
    <div className="ecran-carnet-de-suivi">
      <div className="barre-titre-carnet">
        <span className="titre-karned">Karned Heuliañ</span>
        <button type="button" onClick={ajouterEtape}>
          + Ajouter
        </button>
      </div>

      <div className="liste-cartes-carnet">
        {carnet.etapes.map((etape, i) => {
          const estProchaine = i === indexProchaine
          const realisee = Boolean(etape.dateRealisee)
          return (
            <div
              key={etape.id}
              ref={(el) => {
                if (estProchaine) refProchaine.current = el
              }}
              className="carte-etape"
              onClick={() => navigate(`/etape/${carnet.id}/${etape.id}`)}
            >
              <div className="carte-etape-entete">
                <span>
                  No. <strong>{etape.numero}</strong>&nbsp;&nbsp;&nbsp;Type{' '}
                  <strong>{etape.typeSession}</strong>
                </span>
              </div>
              {estProchaine && <span className="badge-prochaine">Prochaine Séance</span>}

              <div className="carte-etape-grandeurs">
                <div className="grandeur">
                  <span className="grandeur-label">Nerzh</span>
                  <span className="grandeur-valeur pastille-nerzh">{etape.parametres.puissance}</span>
                </div>
                <div className="grandeur">
                  <span className="grandeur-label">Tizh</span>
                  <span className="grandeur-valeur pastille-tizh">{etape.parametres.rythme}</span>
                </div>
                <div className="grandeur">
                  <span className="grandeur-label">Adnerzhañ</span>
                  <span className="grandeur-valeur pastille-adnerzhan">
                    {etape.parametres.recuperation}
                  </span>
                </div>
                <div className="grandeur">
                  <span className="grandeur-label">Padelezh</span>
                  <span className="grandeur-valeur pastille-padelezh">
                    {etape.parametres.dureeTotaleMinutes}
                  </span>
                  <span className="grandeur-unite">min</span>
                </div>
              </div>

              <div className="carte-etape-arabat">
                <div className="carte-etape-arabat-label">Arabat Disoñjal</div>
                <div className="carte-etape-arabat-texte">{etape.remarques || '—'}</div>
              </div>

              {realisee && (
                <p className="carte-etape-resultat">
                  Résultats {new Date(etape.dateRealisee!).toLocaleDateString('fr-FR')}
                  {etape.kmRealises !== undefined && <> · {etape.kmRealises} km</>}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
