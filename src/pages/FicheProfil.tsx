import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfil } from '../context/ProfilContext'
import {
  calculerAge,
  calculerImc,
  enregistrerMesurePouez,
  listerMesuresPouez,
  mettreAJourProfil,
  type MesurePouez,
  type Profil,
} from '../lib/profil'
import { calculerWhr, estimerMasseGrassePourcent, genererConseilSante } from '../lib/conseilSante'
import { TRADUCTIONS_PROFIL } from '../lib/lexique'
import ProtectionFiche from './ProtectionFiche'

function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR')
}

// Seuils IMC par tranche d'âge (bandes de risque, approximation à partir des repères OMS
// usuels — élargissement avec l'âge — sans reproduire une source précise inconnue, à ajuster
// à l'usage). 5 seuils par tranche : rouge-bas | jaune-bas | vert | jaune-haut | orange | rouge-haut.
function seuilsImcAge(age: number): [number, number, number, number, number] {
  if (age < 50) return [17, 18.5, 25, 30, 35]
  if (age < 70) return [17, 18.5, 27, 32, 37]
  return [19, 21, 27, 32, 37]
}

function calculerPoidsDeFormeKg(imc: number, age: number, uhelderCm: number): number | null {
  const [, bVertBas, bVertHaut] = seuilsImcAge(age)
  let imcCible: number
  if (imc < bVertBas) imcCible = bVertBas
  else if (imc > bVertHaut) imcCible = bVertHaut
  else return null // déjà dans la zone verte
  const tailleM = uhelderCm / 100
  return imcCible * tailleM * tailleM
}

const LARGEUR_GRAPHIQUE_IMC = 300
const HAUTEUR_GRAPHIQUE_IMC = 160
const AGE_MAX_GRAPHIQUE = 90
const IMC_MIN_GRAPHIQUE = 15
const IMC_MAX_GRAPHIQUE = 45

function xPourAge(age: number) {
  return (Math.min(AGE_MAX_GRAPHIQUE, age) / AGE_MAX_GRAPHIQUE) * LARGEUR_GRAPHIQUE_IMC
}
function yPourImc(imc: number) {
  const clamp = Math.min(IMC_MAX_GRAPHIQUE, Math.max(IMC_MIN_GRAPHIQUE, imc))
  return HAUTEUR_GRAPHIQUE_IMC - ((clamp - IMC_MIN_GRAPHIQUE) / (IMC_MAX_GRAPHIQUE - IMC_MIN_GRAPHIQUE)) * HAUTEUR_GRAPHIQUE_IMC
}

// Graphique IMC-vs-âge : bandes de risque colorées (verte/jaune/orange/rouge, cf.
// seuilsImcAge), un repère + à la position actuelle (âge, IMC). SVG inline, même approche
// que GraphiqueSections dans Seance.tsx — pas de librairie de graphiques.
function GraphiqueImc({ age, imc }: { age: number; imc: number }) {
  const tranches: [number, number][] = [
    [0, 50],
    [50, 70],
    [70, AGE_MAX_GRAPHIQUE],
  ]
  return (
    <svg
      viewBox={`0 0 ${LARGEUR_GRAPHIQUE_IMC} ${HAUTEUR_GRAPHIQUE_IMC}`}
      className="graphique-imc"
      preserveAspectRatio="none"
    >
      {tranches.map(([ageDebut, ageFin]) => {
        const [b1, b2, b3, b4, b5] = seuilsImcAge(ageDebut + 1)
        const x0 = xPourAge(ageDebut)
        const largeur = xPourAge(ageFin) - x0
        const bandes: [number, number, string][] = [
          [IMC_MIN_GRAPHIQUE, b1, '#c0392b'],
          [b1, b2, '#d9a441'],
          [b2, b3, '#2e8b57'],
          [b3, b4, '#d9a441'],
          [b4, b5, '#d9762b'],
          [b5, IMC_MAX_GRAPHIQUE, '#c0392b'],
        ]
        return (
          <g key={ageDebut}>
            {bandes.map(([bas, haut, couleur]) => (
              <rect
                key={couleur + bas}
                x={x0}
                y={yPourImc(haut)}
                width={largeur}
                height={Math.max(0, yPourImc(bas) - yPourImc(haut))}
                fill={couleur}
                opacity={0.55}
              />
            ))}
          </g>
        )
      })}
      <line x1={xPourAge(age) - 6} y1={yPourImc(imc)} x2={xPourAge(age) + 6} y2={yPourImc(imc)} stroke="#111" strokeWidth={2.5} />
      <line x1={xPourAge(age)} y1={yPourImc(imc) - 6} x2={xPourAge(age)} y2={yPourImc(imc) + 6} stroke="#111" strokeWidth={2.5} />
    </svg>
  )
}

function FicheProfilContenu() {
  const { profil, majProfil } = useProfil()
  const [brouillon, setBrouillon] = useState<Profil>(profil)
  const [mesures, setMesures] = useState<MesurePouez[]>([])
  const [nouvelleDate, setNouvelleDate] = useState(aujourdhui())
  const [nouveauPouez, setNouveauPouez] = useState('')
  const [nouveauTourTaille, setNouveauTourTaille] = useState('')
  const [nouveauTourHanche, setNouveauTourHanche] = useState('')
  const [nouvelleMasseGrasse, setNouvelleMasseGrasse] = useState('')
  const [nouvelleMasseMusculaire, setNouvelleMasseMusculaire] = useState('')
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    setBrouillon(profil)
  }, [profil])

  useEffect(() => {
    listerMesuresPouez(profil.id).then(setMesures)
  }, [profil.id])

  const derniereMesure = mesures[mesures.length - 1]
  const imc =
    derniereMesure && brouillon.uhelderCm ? calculerImc(derniereMesure.pouezKg, brouillon.uhelderCm) : null
  const age = brouillon.dateNaissance ? calculerAge(brouillon.dateNaissance) : null

  const masseGrasseEstimee =
    derniereMesure?.pourcentageMasseGrasse === undefined &&
    derniereMesure?.tourTailleCm &&
    brouillon.uhelderCm
      ? estimerMasseGrassePourcent(brouillon.sexe, brouillon.uhelderCm, derniereMesure.tourTailleCm)
      : undefined
  const masseGrasseAffichee = derniereMesure?.pourcentageMasseGrasse ?? masseGrasseEstimee

  const whr =
    derniereMesure?.tourTailleCm && derniereMesure?.tourHancheCm
      ? calculerWhr(derniereMesure.tourTailleCm, derniereMesure.tourHancheCm)
      : null

  const conseil = genererConseilSante({
    sexe: brouillon.sexe,
    imc,
    tourTailleCm: derniereMesure?.tourTailleCm,
    tourHancheCm: derniereMesure?.tourHancheCm,
    uhelderCm: brouillon.uhelderCm,
    masseGrassePourcent: masseGrasseAffichee,
  })

  const poidsDeFormeKg =
    imc !== null && age !== null && brouillon.uhelderCm
      ? calculerPoidsDeFormeKg(imc, age, brouillon.uhelderCm)
      : null

  async function sauvegarderFiche() {
    setEnregistrement(true)
    setErreur(null)
    try {
      await mettreAJourProfil(profil.id, {
        dateNaissance: brouillon.dateNaissance,
        sexe: brouillon.sexe,
        uhelderCm: brouillon.uhelderCm,
        frequenceCardiaqueReposBpm: brouillon.frequenceCardiaqueReposBpm,
      })
      majProfil(brouillon)
    } catch (e) {
      setErreur(String((e as Error).message ?? e))
    } finally {
      setEnregistrement(false)
    }
  }

  async function ajouterMesure() {
    const valeur = Number(nouveauPouez)
    if (!nouvelleDate || !valeur) return
    setErreur(null)
    try {
      await enregistrerMesurePouez(profil.id, nouvelleDate, {
        pouezKg: valeur,
        tourTailleCm: nouveauTourTaille ? Number(nouveauTourTaille) : undefined,
        tourHancheCm: nouveauTourHanche ? Number(nouveauTourHanche) : undefined,
        pourcentageMasseGrasse: nouvelleMasseGrasse ? Number(nouvelleMasseGrasse) : undefined,
        pourcentageMasseMusculaire: nouvelleMasseMusculaire ? Number(nouvelleMasseMusculaire) : undefined,
      })
      setMesures(await listerMesuresPouez(profil.id))
      setNouveauPouez('')
      setNouveauTourTaille('')
      setNouveauTourHanche('')
      setNouvelleMasseGrasse('')
      setNouvelleMasseMusculaire('')
    } catch (e) {
      setErreur(String((e as Error).message ?? e))
    }
  }

  return (
    <div className="ecran-fiche-profil">
      <Link to="/" className="lien-retour-carnet">
        ◀ Retour
      </Link>
      <h1>Fiche — {profil.nom}</h1>
      {erreur && <p className="erreur">{erreur}</p>}

      <div className="ligne-fiche-profil">
        <label>
          Deiziad-ganedigezh
          <span className="traduction-fr">{TRADUCTIONS_PROFIL['Deiziad-ganedigezh']}</span>
          <input
            type="date"
            value={brouillon.dateNaissance ?? ''}
            onChange={(e) => setBrouillon({ ...brouillon, dateNaissance: e.target.value || undefined })}
          />
        </label>
        <label>
          Reizh
          <span className="traduction-fr">{TRADUCTIONS_PROFIL.Reizh}</span>
          <select
            value={brouillon.sexe ?? ''}
            onChange={(e) =>
              setBrouillon({ ...brouillon, sexe: (e.target.value || undefined) as Profil['sexe'] })
            }
          >
            <option value="">—</option>
            <option value="Maouez">Maouez (Femme)</option>
            <option value="Gwaz">Gwaz (Homme)</option>
          </select>
        </label>
        <label>
          Uhelder
          <span className="traduction-fr">{TRADUCTIONS_PROFIL.Uhelder}</span>
          <input
            type="number"
            min={1}
            value={brouillon.uhelderCm ?? ''}
            onChange={(e) =>
              setBrouillon({
                ...brouillon,
                uhelderCm: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </label>
        <label>
          Frekañs ar galon en diskuizh
          <span className="traduction-fr">{TRADUCTIONS_PROFIL['Frekañs ar galon en diskuizh']}</span>
          <input
            type="number"
            min={1}
            value={brouillon.frequenceCardiaqueReposBpm ?? ''}
            onChange={(e) =>
              setBrouillon({
                ...brouillon,
                frequenceCardiaqueReposBpm: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
          <span className="aide-champ-fiche">Mesurée au réveil, avant de se lever</span>
        </label>
      </div>
      <button type="button" onClick={sauvegarderFiche} disabled={enregistrement}>
        Sauvegarder
      </button>

      <h2>
        Pouez
        <span className="traduction-fr">{TRADUCTIONS_PROFIL.Pouez}</span>
      </h2>
      {imc !== null && (
        <p className="imc-affichage">
          IMC <strong>{imc.toFixed(1)}</strong>
          {poidsDeFormeKg !== null && (
            <span className="aide-champ-fiche"> — poids de forme repère : ~{poidsDeFormeKg.toFixed(0)} kg</span>
          )}
        </p>
      )}
      {imc !== null && age !== null && <GraphiqueImc age={age} imc={imc} />}

      {conseil && (
        <div className="conseil-sante">
          <p>{conseil.texte}</p>
          {conseil.consulteMedecin && (
            <p className="conseil-medecin">Ces repères suggèrent d'en parler à un médecin.</p>
          )}
          <p className="disclaimer-sante">Ceci n'est pas un avis médical — repère indicatif seulement.</p>
        </div>
      )}

      {(whr !== null || masseGrasseAffichee !== undefined) && (
        <p className="indicateurs-sante-complementaires">
          {whr !== null && <>Tour taille/hanche : {whr.toFixed(2)}</>}
          {whr !== null && masseGrasseAffichee !== undefined && ' — '}
          {masseGrasseAffichee !== undefined && (
            <>
              Masse grasse {derniereMesure?.pourcentageMasseGrasse === undefined ? 'estimée' : 'mesurée'} :{' '}
              {masseGrasseAffichee.toFixed(0)}%
              {derniereMesure?.pourcentageMasseGrasse === undefined && (
                <span className="badge-estime">estimé</span>
              )}
            </>
          )}
        </p>
      )}

      <div className="ligne-nouvelle-mesure">
        <input type="date" value={nouvelleDate} onChange={(e) => setNouvelleDate(e.target.value)} />
        <input
          type="number"
          step="0.1"
          min={1}
          placeholder="kg"
          value={nouveauPouez}
          onChange={(e) => setNouveauPouez(e.target.value)}
        />
        <input
          type="number"
          min={1}
          placeholder="taille (cm)"
          value={nouveauTourTaille}
          onChange={(e) => setNouveauTourTaille(e.target.value)}
        />
        <input
          type="number"
          min={1}
          placeholder="hanche (cm)"
          value={nouveauTourHanche}
          onChange={(e) => setNouveauTourHanche(e.target.value)}
        />
        <input
          type="number"
          step="0.1"
          min={0}
          placeholder="% graisse"
          value={nouvelleMasseGrasse}
          onChange={(e) => setNouvelleMasseGrasse(e.target.value)}
        />
        <input
          type="number"
          step="0.1"
          min={0}
          placeholder="% muscle"
          value={nouvelleMasseMusculaire}
          onChange={(e) => setNouvelleMasseMusculaire(e.target.value)}
        />
        <button type="button" onClick={ajouterMesure}>
          Ajouter
        </button>
      </div>
      <p className="aide-champ-fiche">
        Tour de taille/hanche et % masse grasse/musculaire sont optionnels — à renseigner quand
        disponibles (mètre ruban, impédancemètre).
      </p>

      {mesures.length === 0 ? (
        <p className="aide-champ-fiche">Aucune mesure enregistrée pour l'instant.</p>
      ) : (
        <ul className="liste-mesures-pouez">
          {[...mesures]
            .reverse()
            .map((m) => (
              <li key={m.id}>
                {formatDate(m.date)} — {m.pouezKg} kg
                {m.tourTailleCm !== undefined && ` — taille ${m.tourTailleCm}cm`}
                {m.tourHancheCm !== undefined && ` — hanche ${m.tourHancheCm}cm`}
                {m.pourcentageMasseGrasse !== undefined && ` — graisse ${m.pourcentageMasseGrasse}%`}
                {m.pourcentageMasseMusculaire !== undefined && ` — muscle ${m.pourcentageMasseMusculaire}%`}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

export default function FicheProfil() {
  const { profil } = useProfil()
  return (
    <ProtectionFiche profil={profil}>
      <FicheProfilContenu />
    </ProtectionFiche>
  )
}
