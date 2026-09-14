// Traductions françaises affichées en petit sous les termes bretons — demandées par les
// filles de l'utilisateur. Uniquement sur la fiche de séance (EtapeDetail), l'écran
// d'accueil de la séance (Seance "avant") et le bilan de fin de séance : pas sur le
// Karned Heuliañ.
export const TRADUCTIONS_GRANDEUR: Record<string, string> = {
  Nerzh: 'Résistance',
  Tizh: 'Cadence',
  Adnerzhañ: 'Récupération',
  Padelezh: 'Durée totale',
  'Arabat Disoñjal': 'Ne pas oublier',
  // Résultats d'une séance réalisée
  Deiziad: 'Date',
  Amzervezh: 'Temps réel',
  Pellder: 'Distance',
  Energiezh: 'Énergie dépensée',
}

// Traductions de la fiche profil (FicheProfil.tsx) — même principe, même emplacement
// visuel (.traduction-fr) que TRADUCTIONS_GRANDEUR.
export const TRADUCTIONS_PROFIL: Record<string, string> = {
  'Deiziad-ganedigezh': 'Date de naissance',
  Reizh: 'Sexe',
  Uhelder: 'Taille (cm)',
  'Frekañs ar galon en diskuizh': 'FC au repos (bpm)',
  Pouez: 'Poids',
}
