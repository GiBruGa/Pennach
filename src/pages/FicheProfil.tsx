import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfil } from '../context/ProfilContext'
import {
  calculerImc,
  enregistrerMesurePouez,
  listerMesuresPouez,
  mettreAJourProfil,
  type MesurePouez,
  type Profil,
} from '../lib/profil'
import { TRADUCTIONS_PROFIL } from '../lib/lexique'

function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR')
}

export default function FicheProfil() {
  const { profil, majProfil } = useProfil()
  const [brouillon, setBrouillon] = useState<Profil>(profil)
  const [mesures, setMesures] = useState<MesurePouez[]>([])
  const [nouvelleDate, setNouvelleDate] = useState(aujourdhui())
  const [nouveauPouez, setNouveauPouez] = useState('')
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
      await enregistrerMesurePouez(profil.id, nouvelleDate, valeur)
      setMesures(await listerMesuresPouez(profil.id))
      setNouveauPouez('')
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
        </p>
      )}

      <div className="ligne-nouvelle-mesure">
        <input
          type="date"
          value={nouvelleDate}
          onChange={(e) => setNouvelleDate(e.target.value)}
        />
        <input
          type="number"
          step="0.1"
          min={1}
          placeholder="kg"
          value={nouveauPouez}
          onChange={(e) => setNouveauPouez(e.target.value)}
        />
        <button type="button" onClick={ajouterMesure}>
          Ajouter
        </button>
      </div>

      {mesures.length === 0 ? (
        <p className="aide-champ-fiche">Aucune mesure enregistrée pour l'instant.</p>
      ) : (
        <ul className="liste-mesures-pouez">
          {[...mesures]
            .reverse()
            .map((m) => (
              <li key={m.id}>
                {formatDate(m.date)} — {m.pouezKg} kg
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
