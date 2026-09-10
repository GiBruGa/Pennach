import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useProfil } from '../context/ProfilContext'
import { getProgramme, saveSeance } from '../lib/storage'
import { RowerConnection } from '../lib/ble'
import type { EvenementHistorique, Programme } from '../types'

const COMPTE_A_REBOURS_MS = 10_000
const STABILITE_NERZH_MS = 5_000
const DECOMPTE_FINAL_MS = 15_000

function formatMMSS(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const min = Math.floor(total / 60)
  const sec = total % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function biper(frequence: number, dureeMs: number) {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  osc.frequency.value = frequence
  osc.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + dureeMs / 1000)
  osc.onended = () => ctx.close()
}

type Phase = 'avant' | 'compte_a_rebours' | 'en_cours' | 'pause' | 'fini'

export default function Seance() {
  const { profil } = useProfil()
  const { slot } = useParams()
  const navigate = useNavigate()

  const [programme, setProgramme] = useState<Programme | null>(null)
  const [phase, setPhase] = useState<Phase>('avant')
  const [connecte, setConnecte] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [tizhReel, setTizhReel] = useState(0)
  const [nerzhReel, setNerzhReel] = useState<number | null>(null)
  const [sectionIndex, setSectionIndex] = useState(0)
  const [clignote, setClignote] = useState(false)
  const [maintenant, setMaintenant] = useState(() => Date.now())

  const ble = useRef(new RowerConnection())
  const debutCompteARebours = useRef(0)
  const debutSeanceRef = useRef(0)
  const debutSectionRef = useRef(0)
  const evenementsRef = useRef<EvenementHistorique[]>([])
  const segmentRef = useRef<{ debut: number; nerzh: number } | null>(null)
  const candidatRef = useRef<{ valeur: number; depuis: number } | null>(null)
  const pauseDebutRef = useRef<number | null>(null)
  const sectionRef = useRef<Programme['sections'][number] | undefined>(undefined)
  const dernierBipSecondeRef = useRef<number | null>(null)

  useEffect(() => {
    getProgramme(profil.id, Number(slot)).then(setProgramme)
  }, [profil.id, slot])

  const sectionActuelle = programme?.sections[sectionIndex]
  const sectionSuivante = programme?.sections[sectionIndex + 1]
  sectionRef.current = sectionActuelle

  const clorreSegment = useCallback((fin: number, planNerzh: number, planTizh: number) => {
    const segment = segmentRef.current
    if (!segment || fin <= segment.debut) return
    evenementsRef.current.push({
      type: segment.nerzh === planNerzh ? 'section_planifiee' : 'section_personnalisee',
      debut: segment.debut,
      fin,
      nerzh: segment.nerzh,
      tizhPrevu: planTizh,
    })
  }, [])

  const passerSectionSuivante = useCallback(
    (maintenant: number) => {
      const section = sectionRef.current
      if (!programme || !section) return
      clorreSegment(maintenant, section.nerzh, section.tizh)
      segmentRef.current = null
      candidatRef.current = null
      if (sectionIndex + 1 < programme.sections.length) {
        setSectionIndex((i) => i + 1)
        debutSectionRef.current = maintenant
        const suivante = programme.sections[sectionIndex + 1]
        ble.current.definirNerzh(suivante.nerzh).catch(() => {})
      } else {
        terminer('terminee', maintenant)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [programme, sectionIndex, clorreSegment],
  )

  const terminer = useCallback(
    async (statut: 'terminee' | 'arretee', maintenant: number) => {
      const section = sectionRef.current
      if (section) clorreSegment(maintenant, section.nerzh, section.tizh)
      if (pauseDebutRef.current !== null) {
        evenementsRef.current.push({
          type: 'pause',
          debut: pauseDebutRef.current,
          fin: maintenant,
          nerzh: nerzhReel ?? 0,
        })
      }
      setPhase('fini')
      if (programme) {
        await saveSeance(profil.id, {
          id: crypto.randomUUID(),
          programmeSlot: programme.slot,
          programmeNom: programme.nom,
          debut: debutSeanceRef.current,
          fin: maintenant,
          statut,
          evenements: evenementsRef.current,
        })
      }
      navigate('/historique')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [programme, profil.id, nerzhReel, clorreSegment, navigate],
  )

  useEffect(() => {
    if (phase === 'avant' || phase === 'fini') return
    const id = setInterval(() => setMaintenant(Date.now()), 200)
    return () => clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (phase === 'compte_a_rebours' && maintenant - debutCompteARebours.current >= COMPTE_A_REBOURS_MS) {
      const debut = Date.now()
      debutSeanceRef.current = debut
      debutSectionRef.current = debut
      setSectionIndex(0)
      setPhase('en_cours')
      const premiere = programme?.sections[0]
      if (premiere) ble.current.definirNerzh(premiere.nerzh).catch(() => {})
    }
  }, [phase, maintenant, programme])

  useEffect(() => {
    if (phase !== 'en_cours' || !programme || !sectionActuelle) return
    if (maintenant - debutSectionRef.current >= sectionActuelle.dureeSecondes * 1000) {
      passerSectionSuivante(maintenant)
    }
    const candidat = candidatRef.current
    if (candidat && maintenant - candidat.depuis >= STABILITE_NERZH_MS) {
      clorreSegment(maintenant, sectionActuelle.nerzh, sectionActuelle.tizh)
      segmentRef.current = { debut: maintenant, nerzh: candidat.valeur }
      candidatRef.current = null
    }
  }, [phase, maintenant, programme, sectionActuelle, passerSectionSuivante, clorreSegment])

  const tempsEcouleSeance = phase === 'en_cours' ? maintenant - debutSeanceRef.current : 0
  const tempsRestantSeance = programme ? programme.dureeTotaleSecondes * 1000 - tempsEcouleSeance : 0
  const tempsRestantSection = sectionActuelle
    ? sectionActuelle.dureeSecondes * 1000 - (maintenant - debutSectionRef.current)
    : 0

  useEffect(() => {
    if (phase !== 'en_cours' || tempsRestantSeance > DECOMPTE_FINAL_MS) return
    const seconde = Math.ceil(tempsRestantSeance / 1000)
    if (seconde > 0 && seconde !== dernierBipSecondeRef.current) {
      dernierBipSecondeRef.current = seconde
      biper(660, 90)
    }
  }, [phase, tempsRestantSeance])

  useEffect(() => {
    if (phase !== 'en_cours' || !sectionActuelle || sectionActuelle.tizh <= 0) return
    const intervalleMs = 60_000 / sectionActuelle.tizh
    const doitBiper = programme?.signalSonoreTizh || tempsRestantSeance <= DECOMPTE_FINAL_MS
    const id = setInterval(() => {
      setClignote((c) => !c)
      if (doitBiper) biper(440, 60)
    }, intervalleMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sectionActuelle, programme?.signalSonoreTizh, tempsRestantSeance <= DECOMPTE_FINAL_MS])

  async function connecter() {
    setErreur(null)
    try {
      const conn = ble.current
      await conn.connect()
      await conn.prendreLeControle()
      await conn.subscribeRowerData((data) => {
        setTizhReel(data.tizh)
      })
      await conn.subscribeStatus((event) => {
        if (event.nerzh === undefined) return
        setNerzhReel(event.nerzh)
        const now = Date.now()
        if (!segmentRef.current) {
          segmentRef.current = { debut: now, nerzh: event.nerzh }
          return
        }
        if (event.nerzh === segmentRef.current.nerzh) {
          candidatRef.current = null
        } else if (candidatRef.current?.valeur === event.nerzh) {
          // laisse le tick vérifier la stabilité de 5s
        } else {
          candidatRef.current = { valeur: event.nerzh, depuis: now }
        }
      })
      setConnecte(true)
    } catch (e) {
      setErreur(String((e as Error).message ?? e))
    }
  }

  function demarrer() {
    debutCompteARebours.current = Date.now()
    setPhase('compte_a_rebours')
  }

  function mettreEnPause() {
    pauseDebutRef.current = Date.now()
    setPhase('pause')
  }

  function reprendre() {
    const now = Date.now()
    const dureePause = now - (pauseDebutRef.current ?? now)
    debutSeanceRef.current += dureePause
    debutSectionRef.current += dureePause
    if (pauseDebutRef.current !== null) {
      evenementsRef.current.push({
        type: 'pause',
        debut: pauseDebutRef.current,
        fin: now,
        nerzh: nerzhReel ?? 0,
      })
    }
    pauseDebutRef.current = null
    setPhase('en_cours')
  }

  const ecartTizhPourcent =
    sectionActuelle && sectionActuelle.tizh > 0
      ? ((tizhReel - sectionActuelle.tizh) / sectionActuelle.tizh) * 100
      : 0
  const horsSeuil =
    programme !== null && Math.abs(ecartTizhPourcent) > (programme?.seuilEcartTizhPourcent ?? 15)
  // Convention (à ajuster si besoin) : rouge = trop rapide, vert = trop lent.
  const couleurCercle = !horsSeuil ? 'bleu' : ecartTizhPourcent > 0 ? 'rouge' : 'vert'

  if (!programme) return <p>Chargement…</p>

  if (phase === 'avant') {
    return (
      <div className="ecran-seance ecran-seance-avant">
        <h1>{programme.nom}</h1>
        {erreur && <p className="erreur">{erreur}</p>}
        {!connecte ? (
          <button onClick={connecter}>Connecter le rameur</button>
        ) : (
          <button onClick={demarrer}>Démarrer</button>
        )}
      </div>
    )
  }

  if (phase === 'compte_a_rebours') {
    const restant = Math.ceil((COMPTE_A_REBOURS_MS - (maintenant - debutCompteARebours.current)) / 1000)
    return (
      <div className="ecran-seance ecran-compte-a-rebours">
        <span className="chiffre-decompte">{Math.max(1, restant)}</span>
      </div>
    )
  }

  if (phase === 'fini') return <p>Séance enregistrée.</p>

  return (
    <div className="ecran-seance ecran-seance-en-cours">
      <div className={`cercle-tizh cercle-${phase === 'pause' ? 'bleu' : couleurCercle} ${clignote ? 'clignote' : ''}`}>
        <span className="nerzh-valeur">{nerzhReel ?? sectionActuelle?.nerzh}</span>
      </div>
      <div className="chronos">
        <div>Section : {formatMMSS(Math.max(0, tempsRestantSection))}</div>
        <div>Séance : {formatMMSS(Math.max(0, tempsRestantSeance))}</div>
      </div>
      {sectionActuelle?.zoneKalon && (
        <p className="zone-kalon">
          Kalon visé : {sectionActuelle.zoneKalon.min}-{sectionActuelle.zoneKalon.max} bpm
          {sectionActuelle.zoneKalon.libelle && ` (${sectionActuelle.zoneKalon.libelle})`}
        </p>
      )}
      {sectionActuelle && <p className="explication">{sectionActuelle.explication}</p>}
      {sectionSuivante && (
        <div className="apercu-section-suivante">
          <strong>Suivant :</strong> {sectionSuivante.dureeSecondes}s · Nerzh {sectionSuivante.nerzh} ·
          Tizh {sectionSuivante.tizh} · {sectionSuivante.explication}
        </div>
      )}
      <div className="actions-seance">
        {phase === 'en_cours' ? (
          <button onClick={mettreEnPause}>Pause</button>
        ) : (
          <button onClick={reprendre}>Reprendre</button>
        )}
        <button onClick={() => terminer('arretee', Date.now())}>Arrêter</button>
      </div>
    </div>
  )
}
