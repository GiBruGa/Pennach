import type { ParametresGeneration, RoleSection, Section, ZoneKalon } from '../types'
import { enveloppeTrapeze, seuils } from './generateur'
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

// --- Koraiz Bihan : porté depuis le tableur paramétré de l'utilisateur (koraiz_bihan_gbg_v2.xlsx,
// 2026-09-17), qui fait référence — ce fichier reproduit exactement ses calculs. Quatre paramètres
// pilotent tout : Padelezh (durée totale, bornée 25-75 min), Nerzh, Tizh, Adnerzhañ. Schéma fixe :
// montée (10 min, toujours identique), plateau (temps restant), retour (6 min fixes + une dernière
// récup dont la durée absorbe l'écart, pour que la séance dure TOUJOURS exactement Padelezh min).
// Particularité du plateau : Nerzh/Tizh restent constants au seuil BAS (pas haut) toute la durée —
// c'est la durée des efforts qui varie (courbe polynomiale, creuse en bordure, haute au milieu),
// pas leur intensité affichée. Tous les réglages ajustables sont regroupés ici. ---
const KORAIZ_BIHAN = {
  nerzhPlancherAbsolu: 2, // niveau imposé à l'échauffement et à la dernière récup du retour
  tizhPlancherAbsolu: 22,
  dureeMonteeMin: 10, // durée réelle de la montée, toujours exactement celle-ci
  dureeRetourBudgetMin: 8, // budget nominal utilisé seulement pour dimensionner le plateau —
  // le retour réel (6 min fixes + récup finale variable) absorbe l'écart, cf. plus bas
  dureeEchauffementSec: 120,
  dureePaireMonteeRetourSec: 60, // chaque palier (effort ou récup) de la montée/du retour dure 60s, fixe
  // Courbe de durée de l'Effort Intense sur le plateau : quartique ajustée par l'utilisateur
  // (creuse en bordure de plateau, haute au milieu) — correction = (a·t⁴+b·t³+c·t²+d)/r, t =
  // progression dans le plateau (0 à 1).
  polynomeDureeEffortPlateau: { a: 425, b: -1010, c: 603, d: 18, r: 36 },
  // Rapport entre durée d'Effort Intense et durée de récup à Adnerzhañ=1 (à Adnerzhañ=10 ce
  // rapport vaut toujours 1, l'effort et la récup s'égalisent) — ajustable à l'expérience.
  coefK: 2,
}

// Seuils Nerzh/Tizh : min et max calculés indépendamment (pas "haut moins amplitude" comme
// avant), chacun avec sa propre pente selon le niveau 1-10.
function seuilsKoraizBihan(niveau: number, minBase: number, minPente: number, maxBase: number, maxPente: number) {
  return {
    min: Math.round(minBase + ((niveau - 1) * minPente) / 9),
    max: Math.round(maxBase + ((niveau - 1) * maxPente) / 9),
  }
}

// Koraiz Bihan ("le petit carême") — ex-"Reiñ Bec'h". HIIT à schéma fixe : montée (10 min,
// échauffement au plancher puis 4 paliers alternant Tizh/Nerzh), plateau (Nerzh/Tizh constants
// au seuil bas, durée des efforts modulée par une courbe en cloche), retour (6 min de paliers
// dégressifs puis une récup finale dont la durée est ajustée pour boucler exactement sur la
// durée totale demandée).
function genererKoraizBihan(params: ParametresGeneration, karvonen: DonneesKarvonen): Section[] {
  const dureeTotaleMin = Math.min(75, Math.max(25, params.dureeTotaleMinutes))
  const dureeTotaleSec = dureeTotaleMin * 60

  const { min: nerzhMin, max: nerzhMax } = seuilsKoraizBihan(params.puissance, 2, 6, 6, 10)
  const { min: tizhMin, max: tizhMax } = seuilsKoraizBihan(params.rythme, 22, 6, 30, 6)

  // Adnerzhañ pilote conjointement la durée de récup ET la durée moyenne d'Effort Intense sur
  // le plateau (avant application de la courbe ci-dessus) — le rapport entre les deux est
  // coefK à Adnerzhañ=1, et se resserre à 1 (effort = récup) à Adnerzhañ=10.
  const dureeRecupPlateauMin = Math.round((0.5 + ((params.recuperation - 1) * 2) / 9) * 10) / 10
  const facteurEffortRecup =
    ((1 - KORAIZ_BIHAN.coefK) * params.recuperation + 10 * KORAIZ_BIHAN.coefK - 1) / 9
  const dureeEffortMoyenPlateauMin = Math.round(facteurEffortRecup * dureeRecupPlateauMin * 10) / 10
  const dureeRecupPlateauSec = dureeRecupPlateauMin * 60
  const dureeEffortMoyenPlateauSec = dureeEffortMoyenPlateauMin * 60

  const zoneEchauffement = zoneDepuisPourcentage(karvonen, 0.5, 0.6)
  const zoneEffort = zoneDepuisPourcentage(karvonen, 0.8, 0.95, 'Zone 3')
  const zoneRecuperation = zoneDepuisPourcentage(karvonen, 0.55, 0.65, 'Zone 1/2')
  const zoneRetour = zoneDepuisPourcentage(karvonen, 0.4, 0.5)

  const sections: Section[] = []
  function ajouter(role: RoleSection, nerzh: number, tizh: number, dureeSec: number) {
    const explication =
      role === 'echauffement'
        ? 'Mise en route fluide et progressive'
        : role === 'retour'
          ? 'Tirage très doux, faire baisser le pouls'
          : role === 'recuperation'
            ? 'Relâcher la pression, respiration ample'
            : "Poussée explosive des jambes (HIIT)"
    const zone =
      role === 'echauffement'
        ? zoneEchauffement
        : role === 'retour'
          ? zoneRetour
          : role === 'recuperation'
            ? zoneRecuperation
            : zoneEffort
    sections.push(creerSection(role, dureeSec, nerzh, tizh, explication, zone))
  }

  const F = KORAIZ_BIHAN.nerzhPlancherAbsolu
  const G = KORAIZ_BIHAN.tizhPlancherAbsolu
  const P = KORAIZ_BIHAN.dureePaireMonteeRetourSec
  const nerzh1_3 = Math.round(nerzhMin + (nerzhMax - nerzhMin) / 3)
  const nerzh2_3 = Math.round(nerzhMin + ((nerzhMax - nerzhMin) * 2) / 3)
  const tizh1_3 = Math.round(tizhMin + (tizhMax - tizhMin) / 3)
  const tizh2_3 = Math.round(tizhMin + ((tizhMax - tizhMin) * 2) / 3)

  // --- Montée : toujours exactement 10 min (échauffement 2 min + 4 paliers de 1 min), quel
  // que soit le niveau — seules les valeurs Nerzh/Tizh des paliers changent avec le niveau ---
  ajouter('echauffement', F, G, KORAIZ_BIHAN.dureeEchauffementSec)
  ajouter('effort', nerzhMin, tizh1_3, P)
  ajouter('recuperation', F, G, P)
  ajouter('effort', nerzh1_3, tizh1_3, P)
  ajouter('recuperation', nerzhMin, tizhMin, P)
  ajouter('effort', nerzh1_3, tizh2_3, P)
  ajouter('recuperation', nerzhMin, tizhMin, P)
  ajouter('effort', nerzh2_3, tizh2_3, P)
  ajouter('recuperation', nerzhMin, tizhMin, P)

  // --- Plateau : l'Effort Intense tient le seuil HAUT (récup au seuil bas) ; c'est la durée de
  // l'effort qui varie (courte en bordure de plateau, longue au milieu, cf.
  // polynomeDureeEffortPlateau) ---
  const dureePlateauBudgetSec = Math.max(
    0,
    dureeTotaleSec - KORAIZ_BIHAN.dureeMonteeMin * 60 - KORAIZ_BIHAN.dureeRetourBudgetMin * 60,
  )
  let tPlateau = 0
  while (tPlateau < dureePlateauBudgetSec) {
    const tRef = tPlateau / dureePlateauBudgetSec
    const { a, b, c, d, r } = KORAIZ_BIHAN.polynomeDureeEffortPlateau
    const correction = Math.round(((a * tRef ** 4 + b * tRef ** 3 + c * tRef ** 2 + d) / r) * 10) / 10
    const dureeEffortSec = Math.max(1, Math.round(dureeEffortMoyenPlateauSec * correction))
    ajouter('effort', nerzhMax, tizhMax, dureeEffortSec)
    tPlateau += dureeEffortSec
    if (tPlateau >= dureePlateauBudgetSec) break
    ajouter('recuperation', nerzhMin, tizhMin, dureeRecupPlateauSec)
    tPlateau += dureeRecupPlateauSec
  }

  // --- Retour : 6 min fixes (récup + 3 paliers dégressifs), puis une dernière récup dont la
  // durée absorbe l'écart accumulé par le plateau (qui ne tombe jamais pile sur son budget),
  // pour que la séance dure TOUJOURS exactement dureeTotaleMin ---
  ajouter('recuperation', nerzhMin, tizhMin, P)
  ajouter('effort', nerzh2_3, tizh2_3, P)
  ajouter('recuperation', nerzhMin, tizhMin, P)
  ajouter('effort', nerzh1_3, tizh2_3, P)
  ajouter('recuperation', nerzhMin, tizhMin, P)
  ajouter('effort', nerzhMin, tizh1_3, P)

  const elapsedSec = sections.reduce((acc, s) => acc + s.dureeSecondes, 0)
  ajouter('retour', F, G, Math.max(1, dureeTotaleSec - elapsedSec))

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
