export interface Section {
  id: string
  dureeSecondes: number
  nerzh: number // résistance, 1-16
  tizh: number // cadence prévue, coups/min
  explication: string // max 200 caractères
}

export interface Programme {
  slot: number // 1 à 5
  nom: string
  dureeTotaleSecondes: number
  seuilEcartTizhPourcent: number // défaut 15
  signalSonoreTizh: boolean
  // La dernière section dure le temps restant du programme : son dureeSecondes
  // est recalculé (dureeTotaleSecondes - somme des sections précédentes), pas saisi.
  sections: Section[]
}

export type TypeEvenement = 'section_planifiee' | 'section_personnalisee' | 'pause'

export interface EvenementHistorique {
  type: TypeEvenement
  debut: number // timestamp ms
  finPrevue?: number
  fin?: number // timestamp ms, absent si en cours
  nerzh: number
  tizhPrevu?: number
  tizhReelMoyen?: number
  frequenceCardiaqueMoyenne?: number
}

export interface Seance {
  id: string
  programmeSlot: number
  programmeNom: string
  debut: number // timestamp ms
  fin?: number
  statut: 'terminee' | 'arretee'
  evenements: EvenementHistorique[]
}
