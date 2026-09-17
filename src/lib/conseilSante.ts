import type { Profil } from './profil'

export interface ConseilSante {
  texte: string
  consulteMedecin: boolean
}

// Relative Fat Mass (RFM) — Woolcott & Bergman, 2018. Estimation du %masse grasse à partir
// de la taille et du tour de taille seuls, utilisée en substitut de l'impédancemètre quand il
// n'est pas disponible (cf. plan santé étendu). Ne remplace pas une vraie mesure : n'appeler
// que si le profil n'a pas de %masse grasse mesuré pour cette pesée.
export function estimerMasseGrassePourcent(sexe: Profil['sexe'], taillecCm: number, tourTailleCm: number): number {
  const ratio = taillecCm / tourTailleCm
  const rfm = sexe === 'Gwaz' ? 64 - 20 * ratio : 76 - 20 * ratio
  return Math.max(0, Math.min(70, rfm))
}

// Ratio tour de taille / tour de hanche (WHR) — repère OMS de risque cardiovasculaire
// indépendant de l'IMC (graisse viscérale). Seuils : élevé si ≥0.90 (homme) / ≥0.85 (femme).
export function calculerWhr(tourTailleCm: number, tourHancheCm: number): number {
  return tourTailleCm / tourHancheCm
}

function categorieImc(imc: number): 'insuffisant' | 'normal' | 'surpoids' | 'obese' {
  if (imc < 18.5) return 'insuffisant'
  if (imc < 25) return 'normal'
  if (imc < 30) return 'surpoids'
  return 'obese'
}

// Conseil minimal auto-généré : PAS un avis médical, un repère indicatif. Le bandeau de
// disclaimer est affiché séparément et systématiquement par l'UI (cf. FicheProfil.tsx),
// jamais conditionnel à ce que cette fonction retourne.
export function genererConseilSante(params: {
  sexe: Profil['sexe']
  imc: number | null
  tourTailleCm?: number
  tourHancheCm?: number
  uhelderCm?: number
  masseGrassePourcent?: number // mesurée ou estimée, peu importe la source ici
}): ConseilSante | null {
  const { sexe, imc, tourTailleCm, tourHancheCm, uhelderCm, masseGrassePourcent } = params
  if (imc === null) return null

  const cat = categorieImc(imc)
  const whtr = tourTailleCm && uhelderCm ? tourTailleCm / uhelderCm : null
  const whr = tourTailleCm && tourHancheCm ? calculerWhr(tourTailleCm, tourHancheCm) : null
  const whrEleve = whr !== null && (sexe === 'Gwaz' ? whr >= 0.9 : whr >= 0.85)
  const whtrEleve = whtr !== null && whtr >= 0.5

  const risqueEleve = cat === 'obese' || whtrEleve || whrEleve
  const consulteMedecin =
    imc >= 35 || (whtr !== null && whtr >= 0.6) || (masseGrassePourcent !== undefined && masseGrassePourcent >= 40)

  let texte: string
  if (cat === 'insuffisant') {
    texte = "IMC bas : privilégier le renforcement musculaire plutôt que le cardio intensif."
  } else if (risqueEleve) {
    texte = 'Cardio modéré et régulier à privilégier plutôt que du HIIT intense d\'emblée, en montant progressivement.'
  } else if (cat === 'surpoids') {
    texte = 'HIIT modéré adapté (Koraiz Bihan à niveau progressif) en complément d\'une activité régulière.'
  } else {
    texte = 'IMC et tour de taille dans les repères usuels : entretien via une pratique régulière.'
  }

  return { texte, consulteMedecin }
}
