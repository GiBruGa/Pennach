import type { ParametresGeneration, RoleSection, Section, ZoneKalon } from '../types'
import { DUREE_EFFORT_MOYENNE_MIN, enveloppeTrapeze, evolTemps, seuils } from './generateur'
import { zoneDepuisPourcentage, type DonneesKarvonen } from './karvonen'

export interface DefinitionTypeSeance {
  nom: string
  traductionNom: string
  sousTitre: string
  traductionSousTitre: string
  objectif: string
  methode: string[]
  genererSections(params: ParametresGeneration, karvonen: DonneesKarvonen): Section[]
}

function creerSection(
  role: RoleSection,
  dureeSecondes: number,
  nerzh: number,
  tizh: number,
  explication: string,
  zoneKalon: ZoneKalon,
): Section {
  return {
    id: crypto.randomUUID(),
    dureeSecondes: Math.max(1, Math.round(dureeSecondes)),
    nerzh: Math.round(nerzh),
    tizh: Math.round(tizh),
    explication,
    zoneKalon,
    role,
  }
}

const DUREE_ECHAUFFEMENT_MIN = 3
const DUREE_RETOUR_MIN = 3

// Koraiz Bihan ("le petit carême") — ex-"Reiñ Bec'h". HIIT en 3 tiers-temps : montée,
// plateau (haute intensité / récupération courte), descente — cf. description utilisateur
// du 2026-09-14. Nerzh et Tizh suivent la même enveloppe trapézoïdale ; la durée de la
// récupération active (pilotée par Adnerzhañ) suit l'enveloppe inverse.
function genererKoraizBihan(params: ParametresGeneration, karvonen: DonneesKarvonen): Section[] {
  const { bas: nerzhBas, haut: nerzhHaut } = seuils(params.puissance, 6, 14, 6, 2)
  const { bas: tizhBas, haut: tizhHaut } = seuils(params.rythme, 26, 36, 10, 20)
  const { bas: recupBasMin, haut: recupHautMin } = seuils(params.recuperation, 0.5, 2.5, 1.5, 0.4)

  // Zones Kalon personnalisées (méthode de Karvonen, cf. lib/karvonen.ts) : bandes
  // %FC-réserve propres à Koraiz Bihan (HIIT, plus intense que Reiñ Bec'h).
  const zoneEchauffement = zoneDepuisPourcentage(karvonen, 0.5, 0.6)
  const zoneEffort = zoneDepuisPourcentage(karvonen, 0.8, 0.95, 'Zone 3')
  const zoneRecuperation = zoneDepuisPourcentage(karvonen, 0.55, 0.65, 'Zone 1/2')
  const zoneRetour = zoneDepuisPourcentage(karvonen, 0.4, 0.5)

  const dureeRecupMoyenneMin = (recupBasMin + recupHautMin) / 2
  const dureeHiitTheoriqueMin = Math.max(
    0,
    params.dureeTotaleMinutes - DUREE_ECHAUFFEMENT_MIN - DUREE_RETOUR_MIN,
  )
  const nbPaires = Math.max(
    1,
    Math.round(dureeHiitTheoriqueMin / (DUREE_EFFORT_MOYENNE_MIN + dureeRecupMoyenneMin)),
  )
  const dureeHiitReelleMin = nbPaires * (DUREE_EFFORT_MOYENNE_MIN + dureeRecupMoyenneMin)

  const sections: Section[] = [
    creerSection(
      'echauffement',
      DUREE_ECHAUFFEMENT_MIN * 60,
      nerzhBas,
      tizhBas,
      'Mise en route fluide et progressive',
      zoneEchauffement,
    ),
  ]

  let tCumuleMin = 0
  for (let i = 0; i < nbPaires; i++) {
    const t = dureeHiitReelleMin > 0 ? tCumuleMin / dureeHiitReelleMin : 0
    const enveloppe = enveloppeTrapeze(t)

    const dureeEffortMin = evolTemps(t)
    sections.push(
      creerSection(
        'effort',
        dureeEffortMin * 60,
        nerzhBas + enveloppe * (nerzhHaut - nerzhBas),
        tizhBas + enveloppe * (tizhHaut - tizhBas),
        "Poussée explosive des jambes (HIIT)",
        zoneEffort,
      ),
    )
    tCumuleMin += dureeEffortMin

    // Récupération courte au plateau (haute intensité), longue aux extrémités : enveloppe inverse.
    const dureeRecupMin = recupHautMin - enveloppe * (recupHautMin - recupBasMin)
    sections.push(
      creerSection(
        'recuperation',
        dureeRecupMin * 60,
        nerzhBas,
        tizhBas,
        'Relâcher la pression, respiration ample',
        zoneRecuperation,
      ),
    )
    tCumuleMin += dureeRecupMin
  }

  sections.push(
    creerSection(
      'retour',
      DUREE_RETOUR_MIN * 60,
      nerzhBas,
      tizhBas,
      'Tirage très doux, faire baisser le pouls',
      zoneRetour,
    ),
  )

  return sections
}

// Reiñ Bec'h ("mettre les gaz") — Cardio. Effort continu et soutenu en zone aérobie
// modérée, sans alternance effort/récupération : Nerzh et Tizh suivent tous les deux
// la même enveloppe trapézoïdale (montée, plateau, descente) sur toute la durée de
// l'effort, découpée en sections d'1 minute pour que la progression reste visible.
function genererReinBech(params: ParametresGeneration, karvonen: DonneesKarvonen): Section[] {
  const { bas: nerzhBas, haut: nerzhHaut } = seuils(params.puissance, 4, 9, 3, 2)
  const { bas: tizhBas, haut: tizhHaut } = seuils(params.rythme, 22, 28, 6, 18)

  // Zones Kalon personnalisées (Karvonen) : bandes %FC-réserve propres à Reiñ Bec'h
  // (cardio, aérobie modérée — moins intense que Koraiz Bihan).
  const zoneEchauffement = zoneDepuisPourcentage(karvonen, 0.45, 0.55)
  const zoneEffort = zoneDepuisPourcentage(karvonen, 0.65, 0.8, 'Zone 2')
  const zoneRetour = zoneDepuisPourcentage(karvonen, 0.35, 0.45)

  const dureeEffortTotaleMin = Math.max(1, params.dureeTotaleMinutes - DUREE_ECHAUFFEMENT_MIN - DUREE_RETOUR_MIN)
  const nbSections = Math.max(1, Math.round(dureeEffortTotaleMin))
  const dureeSectionMin = dureeEffortTotaleMin / nbSections

  const sections: Section[] = [
    creerSection(
      'echauffement',
      DUREE_ECHAUFFEMENT_MIN * 60,
      nerzhBas,
      tizhBas,
      'Mise en route en douceur, respiration régulière',
      zoneEchauffement,
    ),
  ]

  for (let i = 0; i < nbSections; i++) {
    const t = nbSections > 1 ? i / (nbSections - 1) : 0.5
    const enveloppe = enveloppeTrapeze(t)
    sections.push(
      creerSection(
        'effort',
        dureeSectionMin * 60,
        nerzhBas + enveloppe * (nerzhHaut - nerzhBas),
        tizhBas + enveloppe * (tizhHaut - tizhBas),
        'Effort continu et soutenu, allure régulière',
        zoneEffort,
      ),
    )
  }

  sections.push(
    creerSection(
      'retour',
      DUREE_RETOUR_MIN * 60,
      nerzhBas,
      tizhBas,
      'Ralentir progressivement, faire baisser le pouls',
      zoneRetour,
    ),
  )

  return sections
}

// Descriptif des types de séance disponibles — lecture seule dans l'application
// (écran "Metoadoù"), modifiable uniquement ici, sur demande explicite.
export const TYPES_SEANCE: Record<string, DefinitionTypeSeance> = {
  'Koraiz Bihan': {
    nom: 'Koraiz Bihan',
    traductionNom: 'Perte de Poids, un léger Carême',
    sousTitre: 'Kig ha Farz hep Kig',
    traductionSousTitre: 'Le pot-au-feu de lard… sans le lard !',
    objectif:
      "Perte de poids par des exercices à intervalles d'intensité et de vitesse variable, en activité anaérobique.",
    methode: [
      '3 min de mise en condition (échauffement).',
      "Cycle en 3 tiers-temps : montée progressive de la résistance (Nerzh), de la cadence (Tizh) et du temps de récupération active (Adnerzhañ), en alternance sinusoïdale.",
      "Plateau : Nerzh et Tizh se maintiennent hauts, la récupération active (Adnerzhañ) reste courte. Plus les paramètres Nerzh et Tizh sont élevés, plus l'écart entre seuils bas et haut est important.",
      'Redescente vers le seuil bas, en miroir de la montée.',
      '3 min de retour au calme.',
    ],
    genererSections: genererKoraizBihan,
  },
  "Reiñ Bec'h": {
    nom: "Reiñ Bec'h",
    traductionNom: 'Cardio, tu vas en baver !',
    sousTitre: "Ur c'higezh vat a zeu diwar ur bouilh hiroc'h e boazh",
    traductionSousTitre: 'Pour un bon « Kig ha Farz », il faut un bouillon mijoté longtemps',
    objectif:
      'Développement de l\'endurance cardio-vasculaire par un effort continu et soutenu en zone aérobie modérée.',
    methode: [
      '3 min de mise en condition (échauffement).',
      "Effort continu : la résistance (Nerzh) et la cadence (Tizh) suivent une même courbe de montée, plateau puis descente sur toute la durée de l'effort — pas d'alternance effort/récupération.",
      "Plus les paramètres Nerzh et Tizh sont élevés, plus l'écart entre seuils bas et haut est important.",
      '3 min de retour au calme.',
    ],
    genererSections: genererReinBech,
  },
}
