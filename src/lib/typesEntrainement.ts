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

// --- Koraiz Bihan : schéma fixe à paliers discrets (cf. plan du 2026-09-16, en remplacement
// du modèle sinusoïdal continu — retour terrain du 15-16/09 : montée trop longue et peu
// perceptible, sections consécutives parfois identiques, récup sous 30s). Tous les réglages
// ajustables du schéma sont regroupés ici — un seul endroit à modifier au fil des tests
// réels, plutôt que des constantes éparpillées dans la fonction de génération plus bas. ---
const KORAIZ_BIHAN = {
  pasMinNerzh: 2, // écart mini entre 2 sections Effort Intense consécutives
  pasMinTizh: 3,
  nerzhPlancherAbsolu: 2, // niveau imposé à l'échauffement et au tout dernier palier du retour
  tizhPlancherAbsolu: 22,
  ecartMinRecupNerzh: 1, // la récup active reste toujours au moins cet écart AU-DESSUS du plancher
  ecartMinRecupTizh: 2, // (sinon l'échauffement/retour, au plancher, paraît aussi/plus intense que la récup)
  ecartRecupSousBasNerzh: 2, // décalage de la récup sous nerzhBas/tizhBas (montée/plateau) ou sous
  ecartRecupSousBasTizh: 4, // l'effort courant (retour), avant d'être plafonné par l'écart mini ci-dessus
  dureeEffortSec: 90,
  dureeMonteeMin: 10,
  dureePalierBasMonteeMin: 3,
  dureeRetourMin: 8,
  dureePalierBasRetourMin: 1.5,
  recupBaseMinSec: 20,
  recupBaseMaxSec: 30,
  recupPlancherSec: 30,
  recupPlafondSec: 60,
}

// Nombre de paliers d'une rampe (montée ou retour) : borné par le pas minimum de CHAQUE
// paramètre (jamais un palier plus petit que pasMinNerzh/pasMinTizh) ET par le temps réel
// disponible pour des efforts de dureeEffortSec. Les 2 rampes (8-10 min, efforts de 90s) ne
// peuvent physiquement contenir que ~3-4 paliers — largement moins que ce qu'il faudrait pour
// faire alterner Nerzh et Tizh séparément (cf. règle "si possible un seul paramètre évolue")
// sans qu'un des deux épuise ses paliers en avance et reste figé sur le reste de la rampe.
// Constaté sur le terrain : Tizh figé ~6 min en bas de la descente après un unique saut
// couvrant tout son écart. Nerzh et Tizh évoluent donc ENSEMBLE à chaque palier d'une rampe
// (toujours "au maximum 2 paramètres", jamais le "si possible 1" — non tenable ici vu le
// temps disponible), ce qui garantit que les deux progressent jusqu'au dernier palier plutôt
// que l'un des deux stagnant tôt.
function nbPaliersRampe(
  ecartNerzh: number,
  ecartTizh: number,
  tempsDisponibleSec: number,
  recupTypiqueSec: number,
): number {
  const parTemps = Math.max(1, Math.floor(tempsDisponibleSec / (KORAIZ_BIHAN.dureeEffortSec + recupTypiqueSec)))
  const parPasNerzh = Math.max(1, Math.floor(ecartNerzh / KORAIZ_BIHAN.pasMinNerzh))
  const parPasTizh = Math.max(1, Math.floor(ecartTizh / KORAIZ_BIHAN.pasMinTizh))
  return Math.max(1, Math.min(parTemps, parPasNerzh, parPasTizh))
}

// Koraiz Bihan ("le petit carême") — ex-"Reiñ Bec'h". HIIT en 3 phases à schéma fixe : montée
// (10 min : 2 min plates au seuil bas puis paliers vers le seuil haut), plateau (au seuil
// haut, récupération la plus courte), retour (8 min : paliers vers le plancher absolu
// Nerzh=2/Tizh=20, 1.5 min plates à l'arrivée). Un seul paramètre (Nerzh ou Tizh) change à la
// fois entre 2 sections Effort Intense ; la récupération garde un Nerzh/Tizh fixe toute la
// séance, seule sa durée varie (2x le temps de base en périphérie, 1x au plateau).
function genererKoraizBihan(params: ParametresGeneration, karvonen: DonneesKarvonen): Section[] {
  const { bas: nerzhBas, haut: nerzhHaut } = seuils(params.puissance, 6, 14, 6, 2)
  const { bas: tizhBas, haut: tizhHaut } = seuils(params.rythme, 26, 36, 8, 20)

  // Décalée sous le seuil bas de l'effort (montée/plateau, où l'effort reste ≥ nerzhBas/
  // tizhBas) ou sous l'effort courant (retour, cf. plus bas), mais jamais en dessous du
  // plancher absolu + un écart mini — sinon l'échauffement/retour (imposés au plancher)
  // paraîtraient aussi voire plus intenses que la récup, ce qui n'a pas de sens.
  const nerzhRecupBase = Math.max(
    KORAIZ_BIHAN.nerzhPlancherAbsolu + KORAIZ_BIHAN.ecartMinRecupNerzh,
    nerzhBas - KORAIZ_BIHAN.ecartRecupSousBasNerzh,
  )
  const tizhRecupBase = Math.max(
    KORAIZ_BIHAN.tizhPlancherAbsolu + KORAIZ_BIHAN.ecartMinRecupTizh,
    tizhBas - KORAIZ_BIHAN.ecartRecupSousBasTizh,
  )
  const recupBaseSec =
    KORAIZ_BIHAN.recupBaseMinSec +
    ((params.recuperation - 1) * (KORAIZ_BIHAN.recupBaseMaxSec - KORAIZ_BIHAN.recupBaseMinSec)) / 9
  const dureeRecup = (multiplicateur: number) =>
    Math.min(
      KORAIZ_BIHAN.recupPlafondSec,
      Math.max(KORAIZ_BIHAN.recupPlancherSec, recupBaseSec * multiplicateur),
      KORAIZ_BIHAN.dureeEffortSec / 2,
    )

  const zoneEchauffement = zoneDepuisPourcentage(karvonen, 0.5, 0.6)
  const zoneEffort = zoneDepuisPourcentage(karvonen, 0.8, 0.95, 'Zone 3')
  const zoneRecuperation = zoneDepuisPourcentage(karvonen, 0.55, 0.65, 'Zone 1/2')
  const zoneRetour = zoneDepuisPourcentage(karvonen, 0.4, 0.5)

  const sections: Section[] = []

  function ajouterPaire(
    roleEffort: RoleSection,
    nerzh: number,
    tizh: number,
    multiplicateurRecup: number,
    nerzhRecup = nerzhRecupBase,
    tizhRecup = tizhRecupBase,
  ) {
    const explication =
      roleEffort === 'echauffement'
        ? 'Mise en route fluide et progressive'
        : roleEffort === 'retour'
          ? 'Tirage très doux, faire baisser le pouls'
          : "Poussée explosive des jambes (HIIT)"
    const zoneEffortSection =
      roleEffort === 'echauffement' ? zoneEchauffement : roleEffort === 'retour' ? zoneRetour : zoneEffort
    sections.push(creerSection(roleEffort, KORAIZ_BIHAN.dureeEffortSec, nerzh, tizh, explication, zoneEffortSection))
    sections.push(
      creerSection(
        'recuperation',
        dureeRecup(multiplicateurRecup),
        nerzhRecup,
        tizhRecup,
        'Relâcher la pression, respiration ample',
        zoneRecuperation,
      ),
    )
  }

  // --- Montée : palier bas au plancher absolu (~3 min, comme le retour — l'échauffement ne
  // doit jamais paraître plus intense qu'une récup, cf. retour utilisateur) puis paliers vers
  // le seuil haut (Nerzh et Tizh progressent ensemble à chaque palier, cf. nbPaliersRampe) ---
  ajouterPaire('echauffement', KORAIZ_BIHAN.nerzhPlancherAbsolu, KORAIZ_BIHAN.tizhPlancherAbsolu, 2)

  const ecartNerzhMontee = nerzhHaut - nerzhBas
  const ecartTizhMontee = tizhHaut - tizhBas
  const tempsMonteeRestantSec = Math.max(0, KORAIZ_BIHAN.dureeMonteeMin - KORAIZ_BIHAN.dureePalierBasMonteeMin) * 60
  const nbMontee = nbPaliersRampe(ecartNerzhMontee, ecartTizhMontee, tempsMonteeRestantSec, dureeRecup(1.5))
  for (let i = 1; i <= nbMontee; i++) {
    const nerzh = nerzhBas + (ecartNerzhMontee * i) / nbMontee
    const tizh = tizhBas + (ecartTizhMontee * i) / nbMontee
    // Récup 2x en début de montée → 1x en approchant du plateau.
    const multiplicateur = 2 - i / nbMontee
    ajouterPaire('effort', nerzh, tizh, multiplicateur)
  }

  // --- Plateau : paires au seuil haut, récup la plus courte (1x) ---
  const dureePlateauMin = params.dureeTotaleMinutes - KORAIZ_BIHAN.dureeMonteeMin - KORAIZ_BIHAN.dureeRetourMin
  if (dureePlateauMin > 0) {
    const recupPlateauSec = dureeRecup(1)
    const nbPairesPlateau = Math.max(
      1,
      Math.round((dureePlateauMin * 60) / (KORAIZ_BIHAN.dureeEffortSec + recupPlateauSec)),
    )
    for (let i = 0; i < nbPairesPlateau; i++) {
      ajouterPaire('effort', nerzhHaut, tizhHaut, 1)
    }
  }

  // --- Retour : paliers en sens inverse vers le plancher absolu (Nerzh et Tizh ensemble,
  // comme la montée), puis palier bas ---
  const ecartNerzhRetour = nerzhHaut - KORAIZ_BIHAN.nerzhPlancherAbsolu
  const ecartTizhRetour = tizhHaut - KORAIZ_BIHAN.tizhPlancherAbsolu
  const tempsRetourRestantSec = Math.max(0, KORAIZ_BIHAN.dureeRetourMin - KORAIZ_BIHAN.dureePalierBasRetourMin) * 60
  const nbRetour = nbPaliersRampe(ecartNerzhRetour, ecartTizhRetour, tempsRetourRestantSec, dureeRecup(1.5))

  // Valeurs de chaque palier retour, calculées d'abord (avant de créer les sections) : la
  // récup de la paire i doit rester sous la paire SUIVANTE (i+1), pas la précédente — en
  // descente, la précédente est toujours la plus haute des deux, donc s'y ancrer laisserait
  // l'écart se réduire, voire s'inverser, une fois la paire suivante encore plus basse.
  const valeursRetour: { nerzh: number; tizh: number }[] = []
  for (let i = 1; i <= nbRetour; i++) {
    valeursRetour.push({
      nerzh: nerzhHaut - (ecartNerzhRetour * i) / nbRetour,
      tizh: tizhHaut - (ecartTizhRetour * i) / nbRetour,
    })
  }
  // Le dernier palier atteint exactement le plancher absolu par construction (l'écart total
  // est divisé bout à bout par nbRetour) : il joue lui-même le rôle du palier bas final,
  // inutile d'en ajouter un second identique juste après (ça doublait le temps passé au
  // plancher — cf. retour utilisateur : palier bas final trop long, 3 min maximum).
  valeursRetour.forEach((valeur, i) => {
    const dernier = i === valeursRetour.length - 1
    const suivant = valeursRetour[i + 1] ?? {
      nerzh: KORAIZ_BIHAN.nerzhPlancherAbsolu,
      tizh: KORAIZ_BIHAN.tizhPlancherAbsolu,
    }
    // Récup 1x en sortie de plateau → 2x en approchant du retour au calme.
    const multiplicateur = 1 + (i + 1) / valeursRetour.length
    ajouterPaire(
      dernier ? 'retour' : 'effort',
      valeur.nerzh,
      valeur.tizh,
      multiplicateur,
      Math.max(
        KORAIZ_BIHAN.nerzhPlancherAbsolu + KORAIZ_BIHAN.ecartMinRecupNerzh,
        suivant.nerzh - KORAIZ_BIHAN.ecartRecupSousBasNerzh,
      ),
      Math.max(
        KORAIZ_BIHAN.tizhPlancherAbsolu + KORAIZ_BIHAN.ecartMinRecupTizh,
        suivant.tizh - KORAIZ_BIHAN.ecartRecupSousBasTizh,
      ),
    )
  })

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
