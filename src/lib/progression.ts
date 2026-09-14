import type { EtapeProgression } from '../types'
import type { Profil } from './profil'
import { calculerImc } from './profil'

const IMC_PAR_DEFAUT = 24 // neutre, si poids/taille du profil sont inconnus

// Plus l'IMC est élevé, plus on démarre bas : produire le même travail mécanique demande
// davantage d'effort cardiaque. Formule linéaire simple, bornée 2-9 (jamais 1 — on laisse
// une marge de progression même pour un départ prudent ; jamais 10 — c'est un point de
// départ, pas un pic). À ajuster par retour terrain, comme les autres formules du projet.
export function niveauDepartDepuisImc(imc: number): number {
  return Math.min(9, Math.max(2, Math.round(10 - (imc - 18.5) * 0.35)))
}

const TAILLES_BLOCS = [7, 7, 6] // adaptation / développement / intensification, sur 20 séances
// Fraction de la marge restante jusqu'à 10 ajoutée au niveau de départ, par bloc — plutôt
// qu'un incrément fixe : un incrément fixe (ex. +2, +4) fait converger bloc 2 et bloc 3 au
// même plafond 10 dès que le niveau de départ dépasse ~6 (IMC ≤ 23 environ, un cas très
// courant), rendant les 2 derniers blocs indiscernables. La fraction s'adapte à la marge
// réellement disponible et garde 3 paliers distincts tant qu'il reste de la marge.
const FRACTIONS_BLOCS = [0, 0.5, 1]
const ADNERZHAN_PROGRESSION = 6 // stable sur les 20 séances : pas de signal clair pour le faire varier
const DUREE_MINI_PAR_DEFAUT_MIN = 45
const DUREE_OBJECTIF_ECART_MIN = 15 // objectif par défaut = mini + 15 min…
const DUREE_OBJECTIF_PLAFOND_MIN = 75 // …plafonné à 75 min (au-delà, peu de bénéfice
// supplémentaire pour un usage récréatif, et risque d'abandon/surmenage plus élevé — cf.
// discussion utilisateur sur l'équilibre entre progression efficace et temps disponible).

// Objectif de durée par défaut si non précisé : un peu plus long que la durée mini,
// sans dépasser un plafond raisonnable.
export function dureeObjectifParDefaut(dureeMiniMinutes: number): number {
  return Math.min(DUREE_OBJECTIF_PLAFOND_MIN, dureeMiniMinutes + DUREE_OBJECTIF_ECART_MIN)
}

export interface OptionsProgression {
  type: string // clé de TYPES_SEANCE
  profil: Profil
  dernierePouezKg?: number
  dureeMiniMinutes?: number
  dureeObjectifMinutes?: number
}

// Génère 20 séances calibrées sur l'indice corporel du profil, en 3 blocs progressifs.
// Nerzh, Tizh et la durée montent ensemble par palier de bloc — la durée progresse de
// dureeMiniMinutes (toujours atteignable) vers dureeObjectifMinutes (objectif), sur le
// même principe que la résistance/cadence, plutôt que de rester fixe sur les 20 séances.
// Adnerzhañ reste stable.
export function genererProgression20Seances(opts: OptionsProgression): Omit<EtapeProgression, 'numero'>[] {
  const imc =
    opts.dernierePouezKg && opts.profil.uhelderCm
      ? calculerImc(opts.dernierePouezKg, opts.profil.uhelderCm)
      : IMC_PAR_DEFAUT
  const niveauDepart = niveauDepartDepuisImc(imc)
  const dureeMini = opts.dureeMiniMinutes ?? DUREE_MINI_PAR_DEFAUT_MIN
  const dureeObjectif = opts.dureeObjectifMinutes ?? dureeObjectifParDefaut(dureeMini)

  const etapes: Omit<EtapeProgression, 'numero'>[] = []
  TAILLES_BLOCS.forEach((taille, bloc) => {
    const fraction = FRACTIONS_BLOCS[bloc]
    const niveau = Math.round(niveauDepart + fraction * (10 - niveauDepart))
    const dureeTotaleMinutes = Math.round(dureeMini + fraction * (dureeObjectif - dureeMini))
    for (let i = 0; i < taille; i++) {
      etapes.push({
        id: crypto.randomUUID(),
        typeSession: opts.type,
        parametres: {
          puissance: niveau,
          rythme: niveau,
          recuperation: ADNERZHAN_PROGRESSION,
          dureeTotaleMinutes,
        },
      })
    }
  })
  return etapes
}
