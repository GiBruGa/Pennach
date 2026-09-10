import { supabase } from './supabaseClient'

export interface Profil {
  id: string
  nom: string
  dateNaissance?: string // ISO (YYYY-MM-DD) — Deiziad-ganedigezh
  sexe?: 'Gwaz' | 'Maouez' // Reizh
  uhelderCm?: number // Uhelder
}

export interface MesurePouez {
  id: string
  profilId: string
  date: string // ISO (YYYY-MM-DD)
  pouezKg: number
}

const CLE_PROFIL_ACTIF = 'pennach_profil_actif_id'

const COLONNES_PROFIL = 'id, nom, date_naissance, sexe, uhelder_cm'

function versProfil(ligne: {
  id: string
  nom: string
  date_naissance: string | null
  sexe: 'Gwaz' | 'Maouez' | null
  uhelder_cm: number | null
}): Profil {
  return {
    id: ligne.id,
    nom: ligne.nom,
    dateNaissance: ligne.date_naissance ?? undefined,
    sexe: ligne.sexe ?? undefined,
    uhelderCm: ligne.uhelder_cm ?? undefined,
  }
}

export async function listerProfils(): Promise<Profil[]> {
  const { data, error } = await supabase
    .from('profils')
    .select(COLONNES_PROFIL)
    .order('ordre', { ascending: true, nullsFirst: false })
    .order('nom')
  if (error) throw error
  return data.map(versProfil)
}

export async function getProfil(id: string): Promise<Profil | null> {
  const { data, error } = await supabase
    .from('profils')
    .select(COLONNES_PROFIL)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? versProfil(data) : null
}

export async function mettreAJourProfil(
  id: string,
  maj: Pick<Profil, 'dateNaissance' | 'sexe' | 'uhelderCm'>,
): Promise<void> {
  const { error } = await supabase
    .from('profils')
    .update({
      date_naissance: maj.dateNaissance ?? null,
      sexe: maj.sexe ?? null,
      uhelder_cm: maj.uhelderCm ?? null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function listerMesuresPouez(profilId: string): Promise<MesurePouez[]> {
  const { data, error } = await supabase
    .from('mesures_poids')
    .select('id, profil_id, date, pouez_kg')
    .eq('profil_id', profilId)
    .order('date', { ascending: true })
  if (error) throw error
  return data.map((l) => ({
    id: l.id,
    profilId: l.profil_id,
    date: l.date,
    pouezKg: l.pouez_kg,
  }))
}

export async function enregistrerMesurePouez(
  profilId: string,
  date: string,
  pouezKg: number,
): Promise<void> {
  const { error } = await supabase
    .from('mesures_poids')
    .upsert({ profil_id: profilId, date, pouez_kg: pouezKg }, { onConflict: 'profil_id,date' })
  if (error) throw error
}

export async function creerProfil(nom: string): Promise<Profil> {
  const { data: max } = await supabase
    .from('profils')
    .select('ordre')
    .order('ordre', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  const ordre = (max?.ordre ?? 0) + 1
  const { data, error } = await supabase
    .from('profils')
    .insert({ nom, ordre })
    .select(COLONNES_PROFIL)
    .single()
  if (error) throw error
  return versProfil(data)
}

export function getProfilActifId(): string | null {
  return localStorage.getItem(CLE_PROFIL_ACTIF)
}

export function setProfilActifId(id: string): void {
  localStorage.setItem(CLE_PROFIL_ACTIF, id)
}

export function oublierProfilActif(): void {
  localStorage.removeItem(CLE_PROFIL_ACTIF)
}
