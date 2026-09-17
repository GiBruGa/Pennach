import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { Profil } from '../lib/profil'

type Mode = 'connexion' | 'inscription' | 'mot_de_passe_oublie' | 'nouveau_mot_de_passe'

// Protège l'accès à la Fiche par mot de passe (Supabase Auth), propre à chaque profil. La
// session Auth est globale au navigateur (indépendante du "profil" applicatif) : on ne
// considère l'accès autorisé QUE si l'email de la session active correspond exactement à
// profil.email — sinon (aucune session, ou session d'un AUTRE profil resté connecté sur
// l'appareil partagé), on redemande le mot de passe. changerProfil() (App.tsx) fait par
// ailleurs un signOut() systématique pour ne jamais laisser une session fuiter d'un profil à
// l'autre.
export default function ProtectionFiche({ profil, children }: { profil: Profil; children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined) // undefined = chargement
  const [mode, setMode] = useState<Mode>('connexion')
  const [motDePasse, setMotDePasse] = useState('')
  const [motDePasseConfirmation, setMotDePasseConfirmation] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [messageInfo, setMessageInfo] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: abonnement } = supabase.auth.onAuthStateChange((evenement, nouvelleSession) => {
      if (evenement === 'PASSWORD_RECOVERY') {
        setMode('nouveau_mot_de_passe')
      }
      setSession(nouvelleSession)
    })
    return () => abonnement.subscription.unsubscribe()
  }, [])

  const autorise = session?.user?.email?.toLowerCase() === profil.email?.toLowerCase()

  if (session === undefined) return <p>Chargement…</p>

  if (autorise) return <>{children}</>

  if (!profil.email) {
    return <p className="erreur">Aucun email configuré pour ce profil — la Fiche ne peut pas être protégée. Contacte GBG.</p>
  }

  async function connecter() {
    setEnCours(true)
    setErreur(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: profil.email!, password: motDePasse })
      if (error) throw error
    } catch (e) {
      setErreur(String((e as Error).message ?? e))
    } finally {
      setEnCours(false)
    }
  }

  async function inscrire() {
    setEnCours(true)
    setErreur(null)
    try {
      if (motDePasse.length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.')
      if (motDePasse !== motDePasseConfirmation) throw new Error('Les mots de passe ne correspondent pas.')
      const { error } = await supabase.auth.signUp({ email: profil.email!, password: motDePasse })
      if (error) throw error
      setMessageInfo('Compte créé — tu es maintenant connecté(e).')
    } catch (e) {
      setErreur(String((e as Error).message ?? e))
    } finally {
      setEnCours(false)
    }
  }

  async function demanderReinitialisation() {
    setEnCours(true)
    setErreur(null)
    setMessageInfo(null)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(profil.email!, {
        redirectTo: window.location.href,
      })
      if (error) throw error
      setMessageInfo('Email de réinitialisation envoyé — suis le lien reçu pour choisir un nouveau mot de passe.')
    } catch (e) {
      setErreur(String((e as Error).message ?? e))
    } finally {
      setEnCours(false)
    }
  }

  async function definirNouveauMotDePasse() {
    setEnCours(true)
    setErreur(null)
    try {
      if (motDePasse.length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.')
      if (motDePasse !== motDePasseConfirmation) throw new Error('Les mots de passe ne correspondent pas.')
      const { error } = await supabase.auth.updateUser({ password: motDePasse })
      if (error) throw error
      setMessageInfo('Mot de passe mis à jour.')
      setMode('connexion')
    } catch (e) {
      setErreur(String((e as Error).message ?? e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="ecran-protection-fiche">
      <h1>Fiche protégée — {profil.nom}</h1>
      {erreur && <p className="erreur">{erreur}</p>}
      {messageInfo && <p className="info-protection-fiche">{messageInfo}</p>}

      {mode === 'nouveau_mot_de_passe' ? (
        <div className="formulaire-protection-fiche">
          <p>Choisis ton nouveau mot de passe.</p>
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
          <input
            type="password"
            placeholder="Confirmer"
            value={motDePasseConfirmation}
            onChange={(e) => setMotDePasseConfirmation(e.target.value)}
          />
          <button type="button" onClick={definirNouveauMotDePasse} disabled={enCours}>
            Valider
          </button>
        </div>
      ) : (
        <div className="formulaire-protection-fiche">
          <input type="email" value={profil.email} disabled readOnly />
          {mode !== 'mot_de_passe_oublie' && (
            <input
              type="password"
              placeholder="Mot de passe"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
          )}
          {mode === 'inscription' && (
            <input
              type="password"
              placeholder="Confirmer le mot de passe"
              value={motDePasseConfirmation}
              onChange={(e) => setMotDePasseConfirmation(e.target.value)}
            />
          )}

          {mode === 'connexion' && (
            <>
              <button type="button" onClick={connecter} disabled={enCours || !motDePasse}>
                Se connecter
              </button>
              <div className="liens-protection-fiche">
                <button type="button" onClick={() => { setMode('inscription'); setErreur(null) }}>
                  Pas encore de mot de passe ?
                </button>
                <button type="button" onClick={() => { setMode('mot_de_passe_oublie'); setErreur(null) }}>
                  Mot de passe oublié ?
                </button>
              </div>
            </>
          )}

          {mode === 'inscription' && (
            <>
              <button type="button" onClick={inscrire} disabled={enCours || !motDePasse}>
                Créer le mot de passe
              </button>
              <button type="button" onClick={() => { setMode('connexion'); setErreur(null) }}>
                ◀ Retour à la connexion
              </button>
            </>
          )}

          {mode === 'mot_de_passe_oublie' && (
            <>
              <p className="aide-champ-fiche">Un email avec un lien de réinitialisation sera envoyé à {profil.email}.</p>
              <button type="button" onClick={demanderReinitialisation} disabled={enCours}>
                Envoyer le lien
              </button>
              <button type="button" onClick={() => { setMode('connexion'); setErreur(null) }}>
                ◀ Retour à la connexion
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
