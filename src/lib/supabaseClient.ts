import { createClient } from '@supabase/supabase-js'

// Clé publique (anon), conçue pour être exposée côté client : la confidentialité
// des données repose sur les policies RLS et le secret du lien de l'appli,
// pas sur le secret de cette clé.
const SUPABASE_URL = 'https://dfqwkbrsmhckjtoyijqf.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_XWw9NhLYeA2B5HEIlxqGrA_doJO-2uQ'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
