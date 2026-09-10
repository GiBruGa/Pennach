import { supabase } from './supabaseClient'

export interface Profil {
  id: string
  nom: string
}

const CLE_PROFIL_ACTIF = 'pennach_profil_actif_id'

export async function listerProfils(): Promise<Profil[]> {
  const { data, error } = await supabase
    .from('profils')
    .select('id, nom')
    .order('ordre', { ascending: true, nullsFirst: false })
    .order('nom')
  if (error) throw error
  return data
}

export async function getProfil(id: string): Promise<Profil | null> {
  const { data, error } = await supabase.from('profils').select('id, nom').eq('id', id).maybeSingle()
  if (error) throw error
  return data
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
    .select('id, nom')
    .single()
  if (error) throw error
  return data
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
