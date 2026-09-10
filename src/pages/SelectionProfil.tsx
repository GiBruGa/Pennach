import { useEffect, useState } from 'react'
import { creerProfil, listerProfils, setProfilActifId, type Profil } from '../lib/profil'

export default function SelectionProfil({ onSelected }: { onSelected: (profil: Profil) => void }) {
  const [profils, setProfils] = useState<Profil[]>([])
  const [chargement, setChargement] = useState(true)
  const [nouveauNom, setNouveauNom] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    listerProfils()
      .then(setProfils)
      .catch((e) => setErreur(String(e.message ?? e)))
      .finally(() => setChargement(false))
  }, [])

  function choisir(profil: Profil) {
    setProfilActifId(profil.id)
    onSelected(profil)
  }

  async function creer() {
    const nom = nouveauNom.trim()
    if (!nom) return
    try {
      const profil = await creerProfil(nom)
      choisir(profil)
    } catch (e) {
      setErreur(String((e as Error).message ?? e))
    }
  }

  return (
    <div className="ecran-selection-profil">
      <img
        src={`${import.meta.env.BASE_URL}logo-noir.svg`}
        alt="Pennac'h"
        className="logo-selection-profil"
      />
      <p>Qui rame ?</p>
      {erreur && <p className="erreur">{erreur}</p>}
      {chargement ? (
        <p>Chargement…</p>
      ) : (
        <ul className="liste-profils">
          {profils.map((p) => (
            <li key={p.id}>
              <button onClick={() => choisir(p)}>{p.nom}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="creation-profil">
        <input
          value={nouveauNom}
          onChange={(e) => setNouveauNom(e.target.value)}
          placeholder="Nouveau prénom"
          onKeyDown={(e) => e.key === 'Enter' && creer()}
        />
        <button onClick={creer}>Créer</button>
      </div>
    </div>
  )
}
