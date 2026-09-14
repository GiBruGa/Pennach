// Reprise exacte de la fonction VBA EvolTemps() du classeur "Rameur - Programme PP MIIT.xlsm" :
// montée sinusoïdale (1 → 2) sur les 2/3 du temps, descente sinusoïdale (2 → 1) sur le tiers restant.
// Utilisée pour faire varier la DURÉE des sections d'effort au cours d'une séance.
export function evolTemps(t: number): number {
  const x = -Math.PI / 2 + ((3 * Math.PI) / 2) * t
  return x <= Math.PI / 2 ? 1.5 + 0.5 * Math.sin(x) : 1 + Math.sin(x)
}

export const DUREE_EFFORT_MOYENNE_MIN = 4 / 3 + 2 / (3 * Math.PI) // ≈ 1.5455, cf. B13 du classeur

// Enveloppe en trapèze : montée sinusoïdale lissée sur le 1er tiers, plateau à 1
// sur le 2e tiers, descente symétrique sur le 3e. t ∈ [0, 1]. Sert à faire varier
// la VALEUR (Nerzh/Tizh) d'un type de séance entre son seuil bas et son seuil haut,
// selon la position dans la séance — cf. description "tiers-temps" de Koraiz Bihan.
export function enveloppeTrapeze(t: number): number {
  if (t <= 1 / 3) return 0.5 - 0.5 * Math.cos(Math.PI * (t / (1 / 3)))
  if (t <= 2 / 3) return 1
  return 0.5 + 0.5 * Math.cos(Math.PI * ((t - 2 / 3) / (1 / 3)))
}

// Seuils bas/haut d'une grandeur (Nerzh, Tizh, durée de récup...) pour un niveau de
// paramètre 1-10 : le seuil haut avance linéairement de hautMin à hautMax, le seuil
// bas en découle (haut - amplitudeMax, jamais sous plancher) — donc l'écart bas/haut
// grandit avec le niveau, plafonné à amplitudeMax. Cf. formule Tizh validée sur le
// rameur réel le 2026-09-14 (hautMin=26, hautMax=36, amplitudeMax=10, plancher=20).
export function seuils(
  niveau: number,
  hautMin: number,
  hautMax: number,
  amplitudeMax: number,
  plancher: number,
): { bas: number; haut: number } {
  const haut = hautMin + ((niveau - 1) * (hautMax - hautMin)) / 9
  const bas = Math.max(plancher, haut - amplitudeMax)
  return { bas, haut }
}
