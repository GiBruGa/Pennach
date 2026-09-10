export interface ZoneKalon {
  min: number
  max: number
  libelle?: string // ex: "Zone 3"
}

export interface Section {
  id: string
  dureeSecondes: number
  nerzh: number // résistance, 1-16
  tizh: number // cadence prévue, coups/min
  explication: string // max 200 caractères
  zoneKalon?: ZoneKalon // plage de fréquence cardiaque visée (constat, non asservie)
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

export interface ParametresGeneration {
  puissance: number // 1 à 10
  rythme: number // 1 à 10
  recuperation: number // 1 à 10 (plus haut = plus de repos)
  dureeTotaleMinutes: number
}

export interface EtapeProgression {
  id: string
  numero: number
  phase: string
  parametres: ParametresGeneration
  // Renseigné après coup, une fois la séance réellement faite :
  seanceId?: string
  dateRealisee?: number // timestamp ms
  frequenceCardiaqueMoyenne?: number
  frequenceCardiaqueMax?: number
  kmRealises?: number
  energieDepensee?: number
  remarques?: string
}

export interface PlanProgression {
  id: string
  profilId: string
  nom: string
  etapes: EtapeProgression[]
}
