import type { Profil } from './profil'
import type { ZoneKalon } from '../types'

export interface DonneesKarvonen {
  fcMaxBpm: number
  fcReposBpm: number
}

const AGE_PAR_DEFAUT = 35 // si dateNaissance non renseignée
const FC_REPOS_PAR_DEFAUT = 65 // si non mesurée (cf. profil.frequenceCardiaqueReposBpm)

function calculerAge(dateNaissanceIso: string): number {
  const naissance = new Date(dateNaissanceIso)
  const auj = new Date()
  let age = auj.getFullYear() - naissance.getFullYear()
  const avantAnniversaire =
    auj.getMonth() < naissance.getMonth() ||
    (auj.getMonth() === naissance.getMonth() && auj.getDate() < naissance.getDate())
  if (avantAnniversaire) age--
  return age
}

// Formule de Tanaka (208 − 0.7×âge) : plus fiable que le classique 220−âge,
// notamment aux âges élevés et sans biais de sexe marqué.
export function calculerKarvonen(profil: Profil): DonneesKarvonen {
  const age = profil.dateNaissance ? calculerAge(profil.dateNaissance) : AGE_PAR_DEFAUT
  return {
    fcMaxBpm: 208 - 0.7 * age,
    fcReposBpm: profil.frequenceCardiaqueReposBpm ?? FC_REPOS_PAR_DEFAUT,
  }
}

// Zone Kalon = FCrepos + %intensité × réserve cardiaque (FCmax − FCrepos), méthode de
// Karvonen — plus précise qu'un simple %FCmax car elle tient compte de la condition
// physique de base (FC de repos) de la personne.
export function zoneDepuisPourcentage(
  k: DonneesKarvonen,
  pctBas: number,
  pctHaut: number,
  libelle?: string,
): ZoneKalon {
  const reserve = k.fcMaxBpm - k.fcReposBpm
  return {
    min: Math.round(k.fcReposBpm + pctBas * reserve),
    max: Math.round(k.fcReposBpm + pctHaut * reserve),
    libelle,
  }
}
