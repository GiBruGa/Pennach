import type { ParametresGeneration, Section, ZoneKalon } from '../types'

type TypeSection = 'echauffement' | 'effort' | 'recuperation' | 'retour'

// Reprise exacte de la fonction VBA EvolTemps() du classeur "Rameur - Programme PP MIIT.xlsm" :
// montée sinusoïdale (1 → 2) sur les 2/3 du temps, descente sinusoïdale (2 → 1) sur le tiers restant.
function evolTemps(t: number): number {
  const x = -Math.PI / 2 + ((3 * Math.PI) / 2) * t
  return x <= Math.PI / 2 ? 1.5 + 0.5 * Math.sin(x) : 1 + Math.sin(x)
}

const DUREE_EFFORT_MOYENNE_MIN = 4 / 3 + 2 / (3 * Math.PI) // ≈ 1.5455, cf. B13 du classeur

function nerzhPour(type: TypeSection, puissance: number): number {
  switch (type) {
    case 'echauffement':
      return Math.round(2 + (puissance - 1) * (2 / 10))
    case 'effort':
      return Math.round(6 + (puissance - 1) * (9 / 10))
    case 'recuperation':
      return Math.round(3 + (puissance - 1) * (3 / 10))
    case 'retour':
      return Math.round(1 + (puissance - 1) * (2 / 10))
  }
}

function tizhPour(type: TypeSection, rythme: number): number {
  switch (type) {
    case 'echauffement':
    case 'recuperation':
      return Math.round(16 + (rythme - 1) * 0.9)
    case 'effort':
      return Math.round(22 + (rythme - 1) * 1.6)
    case 'retour':
      return Math.round(14 + (rythme - 1) * 0.4)
  }
}

const ZONES_KALON: Record<TypeSection, ZoneKalon> = {
  echauffement: { min: 119, max: 128 },
  effort: { min: 138, max: 147, libelle: 'Zone 3' },
  recuperation: { min: 120, max: 130, libelle: 'Zone 1/2' },
  retour: { min: 0, max: 119 },
}

const EXPLICATIONS: Record<TypeSection, string> = {
  echauffement: 'Mise en route fluide et progressive',
  effort: 'Poussée explosive des jambes (HIIT)',
  recuperation: 'Relâcher la pression, respiration ample',
  retour: 'Tirage très doux, faire baisser le pouls',
}

function creerSection(type: TypeSection, dureeSecondes: number, params: ParametresGeneration): Section {
  return {
    id: crypto.randomUUID(),
    dureeSecondes: Math.max(1, Math.round(dureeSecondes)),
    nerzh: nerzhPour(type, params.puissance),
    tizh: tizhPour(type, params.rythme),
    explication: EXPLICATIONS[type],
    zoneKalon: ZONES_KALON[type],
  }
}

const DUREE_ECHAUFFEMENT_MIN = 5

// Génère la liste des sections à partir des 4 critères, sur le même principe que le classeur
// Excel de référence : échauffement fixe, alternance effort/récupération dont la durée de
// l'effort suit la courbe EvolTemps (périodisation en cloche sur la séance), et une dernière
// section "retour au calme" qui absorbe le temps restant.
export function genererSections(params: ParametresGeneration): Section[] {
  const dureeRecupMin = 0.3 + params.recuperation * 0.2
  const dureeHiitTheoriqueMin = Math.max(
    0,
    params.dureeTotaleMinutes - DUREE_ECHAUFFEMENT_MIN - 2 - dureeRecupMin,
  )
  const nbPaires = Math.max(
    1,
    Math.round(dureeHiitTheoriqueMin / (DUREE_EFFORT_MOYENNE_MIN + dureeRecupMin)),
  )
  const dureeHiitReelleMin = nbPaires * (DUREE_EFFORT_MOYENNE_MIN + dureeRecupMin)

  const sections: Section[] = [
    creerSection('echauffement', DUREE_ECHAUFFEMENT_MIN * 60, params),
  ]

  let tCumuleMin = 0
  for (let i = 0; i < nbPaires; i++) {
    // evolTemps() renvoie directement une durée en minutes (1 à 2, cf. dérivation partagée avec l'utilisateur)
    const dureeEffortMin = evolTemps(tCumuleMin / dureeHiitReelleMin)
    sections.push(creerSection('effort', dureeEffortMin * 60, params))
    tCumuleMin += dureeEffortMin
    sections.push(creerSection('recuperation', dureeRecupMin * 60, params))
    tCumuleMin += dureeRecupMin
  }

  // La dernière section (retour au calme) absorbe le temps restant : sa durée réelle est
  // recalculée par l'éditeur de programme (règle standard de Pennac'h), on met un temps
  // indicatif de 5 min ici en attendant.
  sections.push(creerSection('retour', 5 * 60, params))

  return sections
}
