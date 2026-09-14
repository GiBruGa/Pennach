import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfil } from '../context/ProfilContext'
import { getOuCreerCarnet, savePlanProgression } from '../lib/storage'
import { TYPES_SEANCE } from '../lib/typesEntrainement'
import { listerMesuresPouez } from '../lib/profil'
import { dureeObjectifParDefaut, genererProgression20Seances } from '../lib/progression'
import type { EtapeProgression, PlanProgression } from '../types'

function nouvelleEtape(numero: number): EtapeProgression {
  return {
    id: crypto.randomUUID(),
    numero,
    typeSession: Object.keys(TYPES_SEANCE)[0],
    parametres: { puissance: 5, rythme: 5, recuperation: 5, dureeTotaleMinutes: 45 },
  }
}

export default function CarnetDeSuivi() {
  const { profil } = useProfil()
  const navigate = useNavigate()
  const [carnet, setCarnet] = useState<PlanProgression | null>(null)
  const [panneauRegenOuvert, setPanneauRegenOuvert] = useState(false)
  const [typeRegen, setTypeRegen] = useState(Object.keys(TYPES_SEANCE)[0])
  const [dureeMiniRegen, setDureeMiniRegen] = useState(45)
  const [dureeObjectifRegen, setDureeObjectifRegen] = useState(() => dureeObjectifParDefaut(45))
  const [frequenceRegen, setFrequenceRegen] = useState(3)
  const [regenerationEnCours, setRegenerationEnCours] = useState(false)
  const [erreurRegen, setErreurRegen] = useState<string | null>(null)

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

  // Régénère un programme de 20 séances calibré sur le profil (IMC + Karvonen, cf.
  // lib/progression.ts) : les étapes déjà réalisées sont conservées (historique), les
  // non réalisées sont remplacées par les 20 nouvelles.
  async function regenererProgramme() {
    if (!carnet) return
    setRegenerationEnCours(true)
    setErreurRegen(null)
    try {
      const mesures = await listerMesuresPouez(profil.id)
      const dernierePouezKg = mesures.at(-1)?.pouezKg
      const realisees = carnet.etapes.filter((e) => e.dateRealisee)
      const nouvelles = genererProgression20Seances({
        type: typeRegen,
        profil,
        dernierePouezKg,
        dureeMiniMinutes: dureeMiniRegen,
        dureeObjectifMinutes: dureeObjectifRegen,
      })
      const etapes = [...realisees, ...nouvelles].map((e, i) => ({ ...e, numero: i + 1 }))
      const carnetMaj = { ...carnet, etapes }
      await savePlanProgression(carnetMaj)
      setCarnet(carnetMaj)
      setPanneauRegenOuvert(false)
    } catch (e) {
      setErreurRegen(String((e as Error).message ?? e))
    } finally {
      setRegenerationEnCours(false)
    }
  }

  return (
    <div className="ecran-carnet-de-suivi">
      <div className="barre-titre-carnet">
        <span className="titre-karned">Karned Heuliañ</span>
        <div className="actions-barre-titre-carnet">
          <button type="button" onClick={() => setPanneauRegenOuvert((v) => !v)}>
            Régénérer
          </button>
          <button type="button" onClick={ajouterEtape}>
            + Ajouter
          </button>
        </div>
      </div>

      {panneauRegenOuvert && (
        <div className="panneau-regeneration">
          <label>
            Type
            <select value={typeRegen} onChange={(e) => setTypeRegen(e.target.value)}>
              {Object.keys(TYPES_SEANCE).map((cle) => (
                <option key={cle} value={cle}>
                  {cle}
                </option>
              ))}
            </select>
          </label>
          <label>
            Durée mini
            <input
              type="number"
              min={1}
              value={dureeMiniRegen}
              onChange={(e) => setDureeMiniRegen(Number(e.target.value))}
            />
            <span className="aide-champ-fiche">min — toujours atteignable, même les jours chargés</span>
          </label>
          <label>
            Durée objectif
            <input
              type="number"
              min={dureeMiniRegen}
              value={dureeObjectifRegen}
              onChange={(e) => setDureeObjectifRegen(Number(e.target.value))}
            />
            <span className="aide-champ-fiche">min — visée en fin de programme (suggestion : mini + 15, jusqu'à 75)</span>
          </label>
          <label>
            Fréquence visée
            <select value={frequenceRegen} onChange={(e) => setFrequenceRegen(Number(e.target.value))}>
              <option value={1}>1x/semaine</option>
              <option value={2}>2x/semaine</option>
              <option value={3}>3x/semaine</option>
              <option value={4}>4x/semaine</option>
            </select>
          </label>
          <p className="estimation-regeneration">
            20 séances ≈ {Math.ceil(20 / frequenceRegen)} semaines
          </p>
          {erreurRegen && <p className="erreur">{erreurRegen}</p>}
          <div className="actions-regeneration">
            <button type="button" onClick={regenererProgramme} disabled={regenerationEnCours}>
              Confirmer
            </button>
            <button type="button" onClick={() => setPanneauRegenOuvert(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}

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
