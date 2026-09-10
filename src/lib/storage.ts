import { supabase } from './supabaseClient'
import type { PlanProgression, Seance } from '../types'

export async function saveSeance(profilId: string, seance: Seance): Promise<void> {
  const { error } = await supabase.from('seances').upsert({
    id: seance.id,
    profil_id: profilId,
    programme_slot: seance.programmeSlot,
    programme_nom: seance.programmeNom,
    debut: new Date(seance.debut).toISOString(),
    fin: seance.fin ? new Date(seance.fin).toISOString() : null,
    statut: seance.statut,
    evenements: seance.evenements,
  })
  if (error) throw error
}

// Un seul carnet de suivi par profil : on prend le premier trouvé, ou on en crée un vide.
export async function getOuCreerCarnet(profilId: string): Promise<PlanProgression> {
  const { data, error } = await supabase
    .from('plans_progression')
    .select('id, nom, etapes')
    .eq('profil_id', profilId)
    .order('updated_at', { ascending: true })
    .limit(1)
  if (error) throw error
  if (data.length > 0) {
    const l = data[0]
    return { id: l.id, profilId, nom: l.nom, etapes: l.etapes }
  }
  const nouveau: PlanProgression = { id: crypto.randomUUID(), profilId, nom: 'Karned Heuliañ', etapes: [] }
  await savePlanProgression(nouveau)
  return nouveau
}

export async function getPlanProgression(id: string): Promise<PlanProgression | null> {
  const { data, error } = await supabase
    .from('plans_progression')
    .select('id, profil_id, nom, etapes')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? { id: data.id, profilId: data.profil_id, nom: data.nom, etapes: data.etapes } : null
}

export async function savePlanProgression(plan: PlanProgression): Promise<void> {
  const { error } = await supabase.from('plans_progression').upsert({
    id: plan.id,
    profil_id: plan.profilId,
    nom: plan.nom,
    etapes: plan.etapes,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

