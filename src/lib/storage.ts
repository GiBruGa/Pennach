import { supabase } from './supabaseClient'
import type { PlanProgression, Programme, Seance } from '../types'

export function programmeParDefaut(slot: number): Programme {
  return {
    slot,
    nom: `Programme ${slot}`,
    dureeTotaleSecondes: 0,
    seuilEcartTizhPourcent: 15,
    signalSonoreTizh: false,
    sections: [],
  }
}

interface LigneProgramme {
  slot: number
  nom: string
  duree_totale_secondes: number
  seuil_ecart_tizh_pourcent: number
  signal_sonore_tizh: boolean
  sections: Programme['sections']
}

const COLONNES_PROGRAMME =
  'slot, nom, duree_totale_secondes, seuil_ecart_tizh_pourcent, signal_sonore_tizh, sections'

function versProgramme(ligne: LigneProgramme): Programme {
  return {
    slot: ligne.slot,
    nom: ligne.nom,
    dureeTotaleSecondes: ligne.duree_totale_secondes,
    seuilEcartTizhPourcent: ligne.seuil_ecart_tizh_pourcent,
    signalSonoreTizh: ligne.signal_sonore_tizh,
    sections: ligne.sections,
  }
}

export async function getProgrammes(profilId: string): Promise<Programme[]> {
  const { data, error } = await supabase
    .from('programmes')
    .select(COLONNES_PROGRAMME)
    .eq('profil_id', profilId)
  if (error) throw error
  const parSlot = new Map(data.map((l) => [l.slot, versProgramme(l)]))
  return [1, 2, 3, 4, 5].map((slot) => parSlot.get(slot) ?? programmeParDefaut(slot))
}

export async function getProgramme(profilId: string, slot: number): Promise<Programme> {
  const { data, error } = await supabase
    .from('programmes')
    .select(COLONNES_PROGRAMME)
    .eq('profil_id', profilId)
    .eq('slot', slot)
    .maybeSingle()
  if (error) throw error
  return data ? versProgramme(data) : programmeParDefaut(slot)
}

export async function saveProgramme(profilId: string, programme: Programme): Promise<void> {
  const { error } = await supabase.from('programmes').upsert(
    {
      profil_id: profilId,
      slot: programme.slot,
      nom: programme.nom,
      duree_totale_secondes: programme.dureeTotaleSecondes,
      seuil_ecart_tizh_pourcent: programme.seuilEcartTizhPourcent,
      signal_sonore_tizh: programme.signalSonoreTizh,
      sections: programme.sections,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profil_id,slot' },
  )
  if (error) throw error
}

export async function getHistorique(profilId: string): Promise<Seance[]> {
  const { data, error } = await supabase
    .from('seances')
    .select('id, programme_slot, programme_nom, debut, fin, statut, evenements')
    .eq('profil_id', profilId)
    .order('debut', { ascending: false })
  if (error) throw error
  return data.map((l) => ({
    id: l.id,
    programmeSlot: l.programme_slot,
    programmeNom: l.programme_nom,
    debut: new Date(l.debut).getTime(),
    fin: l.fin ? new Date(l.fin).getTime() : undefined,
    statut: l.statut,
    evenements: l.evenements,
  }))
}

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

export async function getPlansProgression(profilId: string): Promise<PlanProgression[]> {
  const { data, error } = await supabase
    .from('plans_progression')
    .select('id, nom, etapes')
    .eq('profil_id', profilId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data.map((l) => ({ id: l.id, profilId, nom: l.nom, etapes: l.etapes }))
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

export async function supprimerPlanProgression(id: string): Promise<void> {
  const { error } = await supabase.from('plans_progression').delete().eq('id', id)
  if (error) throw error
}
