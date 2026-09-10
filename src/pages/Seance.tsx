import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useProfil } from '../context/ProfilContext'
import { getPlanProgression, saveSeance, savePlanProgression } from '../lib/storage'
import { genererSections } from '../lib/generateur'
import { RowerConnection } from '../lib/ble'
import type { EtapeProgression, EvenementHistorique, PlanProgression, Programme } from '../types'

const COMPTE_A_REBOURS_MS = 10_000
const STABILITE_NERZH_MS = 5_000
const DECOMPTE_FINAL_SEANCE_MS = 15_000
const DECOMPTE_FINAL_SECTION_MS = 3_000

function formatMMSS(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const min = Math.floor(total / 60)
  const sec = total % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function formatHHMMSS(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const min = Math.floor((total % 3600) / 60)
  const sec = total % 60
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
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

function programmeDepuisEtape(plan: PlanProgression, etape: EtapeProgression): Programme {
  return {
    slot: etape.numero,
    nom: `${plan.nom} — Séance ${etape.numero}`,
    dureeTotaleSecondes: etape.parametres.dureeTotaleMinutes * 60,
    seuilEcartTizhPourcent: 15,
    signalSonoreTizh: false,
    sections: genererSections(etape.parametres),
  }
}

type Phase = 'avant' | 'compte_a_rebours' | 'en_cours' | 'pause' | 'fini'

interface StatsSection {
  nerzh: number
  tizhMoyen: number
  pellderKm: number
  energiezhKcal: number
}

export default function Seance() {
  const { profil } = useProfil()
  const { planId, etapeId } = useParams()
  const navigate = useNavigate()

  const [plan, setPlan] = useState<PlanProgression | null>(null)
  const [etape, setEtape] = useState<EtapeProgression | null>(null)
  const [programme, setProgramme] = useState<Programme | null>(null)
  const [erreurChargement, setErreurChargement] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('avant')
  const [connecte, setConnecte] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [tizhReel, setTizhReel] = useState(0)
  const [nerzhReel, setNerzhReel] = useState<number | null>(null)
  const [sectionIndex, setSectionIndex] = useState(0)
  const [clignote, setClignote] = useState(false)
  const [maintenant, setMaintenant] = useState(() => Date.now())
  const [distanceKm, setDistanceKm] = useState(0)
  const [energieKcal, setEnergieKcal] = useState(0)
  const [sectionPrecedente, setSectionPrecedente] = useState<StatsSection | null>(null)

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
  const dernierBipSectionSecondeRef = useRef<number | null>(null)
  const distanceMetresRef = useRef(0)
  const energieKcalRef = useRef(0)
  const segmentDebutDistanceRef = useRef(0)
  const segmentDebutEnergieRef = useRef(0)
  const tizhSommeRef = useRef(0)
  const tizhCompteRef = useRef(0)

  function demarrerNouveauSegment(nerzh: number, debut: number) {
    segmentRef.current = { debut, nerzh }
    tizhSommeRef.current = 0
    tizhCompteRef.current = 0
    segmentDebutDistanceRef.current = distanceMetresRef.current
    segmentDebutEnergieRef.current = energieKcalRef.current
  }

  useEffect(() => {
    if (!planId || !etapeId) return
    getPlanProgression(planId).then((p) => {
      if (!p) {
        setErreurChargement('Plan introuvable.')
        return
      }
      const e = p.etapes.find((x) => x.id === etapeId)
      if (!e) {
        setErreurChargement('Séance introuvable dans ce plan.')
        return
      }
      setPlan(p)
      setEtape(e)
      setProgramme(programmeDepuisEtape(p, e))
    })
  }, [planId, etapeId])

  const sectionActuelle = programme?.sections[sectionIndex]
  const sectionSuivante = programme?.sections[sectionIndex + 1]
  sectionRef.current = sectionActuelle

  const clorreSegment = useCallback((fin: number, planNerzh: number, planTizh: number) => {
    const segment = segmentRef.current
    if (!segment || fin <= segment.debut) return
    const tizhMoyen =
      tizhCompteRef.current > 0 ? Math.round(tizhSommeRef.current / tizhCompteRef.current) : 0
    const pellderKm = Math.max(0, distanceMetresRef.current - segmentDebutDistanceRef.current) / 1000
    const energiezhKcal = Math.max(0, energieKcalRef.current - segmentDebutEnergieRef.current)
    evenementsRef.current.push({
      type: segment.nerzh === planNerzh ? 'section_planifiee' : 'section_personnalisee',
      debut: segment.debut,
      fin,
      nerzh: segment.nerzh,
      tizhPrevu: planTizh,
      tizhReelMoyen: tizhMoyen,
    })
    setSectionPrecedente({ nerzh: segment.nerzh, tizhMoyen, pellderKm, energiezhKcal })
  }, [])

  const passerSectionSuivante = useCallback(
    (maintenant: number) => {
      const section = sectionRef.current
      if (!programme || !section) return
      clorreSegment(maintenant, section.nerzh, section.tizh)
      candidatRef.current = null
      if (sectionIndex + 1 < programme.sections.length) {
        setSectionIndex((i) => i + 1)
        debutSectionRef.current = maintenant
        const suivante = programme.sections[sectionIndex + 1]
        demarrerNouveauSegment(suivante.nerzh, maintenant)
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
        const seanceId = crypto.randomUUID()
        await saveSeance(profil.id, {
          id: seanceId,
          programmeSlot: programme.slot,
          programmeNom: programme.nom,
          debut: debutSeanceRef.current,
          fin: maintenant,
          statut,
          evenements: evenementsRef.current,
        })
        if (plan && etape) {
          const etapeMaj: EtapeProgression = {
            ...etape,
            seanceId,
            dateRealisee: maintenant,
            dureeReelleSecondes: Math.round((maintenant - debutSeanceRef.current) / 1000),
            kmRealises:
              distanceMetresRef.current > 0
                ? Math.round(distanceMetresRef.current) / 1000
                : etape.kmRealises,
            energieDepenseeKcal:
              energieKcalRef.current > 0 ? energieKcalRef.current : etape.energieDepenseeKcal,
          }
          await savePlanProgression({
            ...plan,
            etapes: plan.etapes.map((e) => (e.id === etape.id ? etapeMaj : e)),
          })
        }
      }
      navigate('/')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [programme, profil.id, plan, etape, nerzhReel, clorreSegment, navigate],
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
      if (premiere) {
        demarrerNouveauSegment(premiere.nerzh, debut)
        ble.current.definirNerzh(premiere.nerzh).catch(() => {})
      }
    }
  }, [phase, maintenant, programme])

  useEffect(() => {
    if (phase !== 'en_cours' || !programme || !sectionActuelle) return
    // La dernière section n'a pas de fin automatique : elle continue d'enregistrer
    // jusqu'à l'arrêt manuel de la séance.
    const estDerniereSection = sectionIndex + 1 >= programme.sections.length
    if (
      !estDerniereSection &&
      maintenant - debutSectionRef.current >= sectionActuelle.dureeSecondes * 1000
    ) {
      passerSectionSuivante(maintenant)
    }
    const candidat = candidatRef.current
    if (candidat && maintenant - candidat.depuis >= STABILITE_NERZH_MS) {
      clorreSegment(maintenant, sectionActuelle.nerzh, sectionActuelle.tizh)
      demarrerNouveauSegment(candidat.valeur, maintenant)
      candidatRef.current = null
    }
  }, [phase, maintenant, programme, sectionActuelle, passerSectionSuivante, clorreSegment])

  const tempsEcouleSeance = phase === 'en_cours' ? maintenant - debutSeanceRef.current : 0
  const tempsRestantSeance = programme ? programme.dureeTotaleSecondes * 1000 - tempsEcouleSeance : 0
  const tempsRestantSection = sectionActuelle
    ? sectionActuelle.dureeSecondes * 1000 - (maintenant - debutSectionRef.current)
    : 0

  useEffect(() => {
    if (phase !== 'en_cours' || tempsRestantSeance > DECOMPTE_FINAL_SEANCE_MS) return
    const seconde = Math.ceil(tempsRestantSeance / 1000)
    if (seconde > 0 && seconde !== dernierBipSecondeRef.current) {
      dernierBipSecondeRef.current = seconde
      biper(660, 90)
    }
  }, [phase, tempsRestantSeance])

  useEffect(() => {
    // Bip sur les 3 dernières secondes de chaque section (sauf la dernière, qui n'a pas de fin
    // programmée — cf. plus haut). Réinitialisé à chaque changement de section.
    if (
      phase !== 'en_cours' ||
      !programme ||
      sectionIndex + 1 >= programme.sections.length ||
      tempsRestantSection > DECOMPTE_FINAL_SECTION_MS
    ) {
      return
    }
    const seconde = Math.ceil(tempsRestantSection / 1000)
    if (seconde > 0 && seconde !== dernierBipSectionSecondeRef.current) {
      dernierBipSectionSecondeRef.current = seconde
      biper(550, 90)
    }
  }, [phase, programme, sectionIndex, tempsRestantSection])

  useEffect(() => {
    dernierBipSectionSecondeRef.current = null
  }, [sectionIndex])

  useEffect(() => {
    if (phase !== 'en_cours' || !sectionActuelle || sectionActuelle.tizh <= 0) return
    const intervalleMs = 60_000 / sectionActuelle.tizh
    const doitBiper = programme?.signalSonoreTizh || tempsRestantSeance <= DECOMPTE_FINAL_SEANCE_MS
    const id = setInterval(() => {
      setClignote((c) => !c)
      if (doitBiper) biper(440, 60)
    }, intervalleMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    phase,
    sectionActuelle,
    programme?.signalSonoreTizh,
    tempsRestantSeance <= DECOMPTE_FINAL_SEANCE_MS,
  ])

  function connecterSimule() {
    setConnecte(true)
    setInterval(() => {
      const cible = sectionRef.current?.tizh ?? 20
      const tizh = Math.max(0, cible + Math.round((Math.random() - 0.5) * 10))
      setTizhReel(tizh)
      tizhSommeRef.current += tizh
      tizhCompteRef.current += 1
      distanceMetresRef.current += 3
      setDistanceKm(distanceMetresRef.current / 1000)
      energieKcalRef.current += 1
      setEnergieKcal(energieKcalRef.current)
    }, 1000)
  }

  async function connecter() {
    setErreur(null)
    try {
      const conn = ble.current
      await conn.connect()
      await conn.prendreLeControle()
      await conn.subscribeRowerData((data) => {
        setTizhReel(data.tizh)
        tizhSommeRef.current += data.tizh
        tizhCompteRef.current += 1
        if (data.distanceMetres !== undefined) {
          distanceMetresRef.current = data.distanceMetres
          setDistanceKm(data.distanceMetres / 1000)
        }
        if (data.totalEnergyKcal !== undefined) {
          energieKcalRef.current = data.totalEnergyKcal
          setEnergieKcal(data.totalEnergyKcal)
        }
      })
      await conn.subscribeStatus((event) => {
        if (event.nerzh === undefined) return
        setNerzhReel(event.nerzh)
        const now = Date.now()
        if (!segmentRef.current) {
          demarrerNouveauSegment(event.nerzh, now)
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

  if (erreurChargement) return <p className="erreur">{erreurChargement}</p>
  if (!programme) return <p>Chargement…</p>

  if (phase === 'avant') {
    return (
      <div className="ecran-seance ecran-seance-avant">
        <Link to="/" className="lien-retour-carnet">
          ◀ Retour
        </Link>
        <h1>{programme.nom}</h1>
        {erreur && <p className="erreur">{erreur}</p>}
        {!connecte ? (
          <>
            <button onClick={connecter}>Connecter le rameur</button>
            <button onClick={connecterSimule}>Simuler (démo)</button>
          </>
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
      <div className="bandeau-section-precedente">
        {sectionPrecedente ? (
          <>
            Nerzh Keitad <strong>{sectionPrecedente.nerzh}</strong> · Tizh Keitad{' '}
            <strong>{sectionPrecedente.tizhMoyen}</strong> Riw/min · Pellder{' '}
            <strong>{sectionPrecedente.pellderKm.toFixed(2)}</strong> km · Energiezh{' '}
            <strong>{sectionPrecedente.energiezhKcal}</strong> kcal
          </>
        ) : (
          '—'
        )}
      </div>

      <div className="corps-seance-live">
        <div className="carte-section-courante">
          <div className="entete-carte-courante">
            {sectionActuelle?.zoneKalon && (
              <span>
                Kalon {sectionActuelle.zoneKalon.min}-{sectionActuelle.zoneKalon.max} bpm
                {sectionActuelle.zoneKalon.libelle && ` (${sectionActuelle.zoneKalon.libelle})`}
              </span>
            )}
            {sectionActuelle && <span>Kemenn : {sectionActuelle.explication}</span>}
          </div>

          <div className="grille-valeurs-courantes">
            <div className="valeur-courante">
              <span className="valeur-courante-label">Nerzh</span>
              <span className="valeur-courante-chiffre">{nerzhReel ?? sectionActuelle?.nerzh}</span>
            </div>
            <div className="valeur-courante">
              <span className="valeur-courante-label">Tizh</span>
              <span className="valeur-courante-chiffre">{tizhReel}</span>
            </div>
            <div className="valeur-courante">
              <span className="valeur-courante-label">Amzervezh</span>
              <span className="valeur-courante-chiffre">
                {formatMMSS(Math.max(0, tempsRestantSection))}
              </span>
            </div>
            <div className="valeur-courante">
              <span className="valeur-courante-label">Pellder</span>
              <span className="valeur-courante-chiffre">{distanceKm.toFixed(2)}</span>
            </div>
            <div className="valeur-courante">
              <span className="valeur-courante-label">Energiezh</span>
              <span className="valeur-courante-chiffre">{energieKcal}</span>
            </div>
          </div>
        </div>

        <div className="zone-circulaire">
          <div
            className={`cercle-tizh cercle-${phase === 'pause' ? 'bleu' : couleurCercle} ${clignote ? 'clignote' : ''}`}
          >
            <span className="tizh-valeur">{sectionActuelle?.tizh}</span>
          </div>
          <div className="horloge-seance">{formatHHMMSS(tempsEcouleSeance)}</div>
        </div>
      </div>

      <div className="bandeau-section-suivante">
        {sectionSuivante ? (
          <>
            Nerzh <strong>{sectionSuivante.nerzh}</strong> · Tizh{' '}
            <strong>{sectionSuivante.tizh}</strong> Riw/min · Padelezh{' '}
            <strong>{formatMMSS(sectionSuivante.dureeSecondes * 1000)}</strong>
          </>
        ) : (
          'Dernière section'
        )}
      </div>

      <div className="actions-seance">
        {phase === 'en_cours' ? (
          <button onClick={mettreEnPause}>Pause</button>
        ) : (
          <button onClick={reprendre}>Reprendre</button>
        )}
        <button onClick={() => terminer('arretee', Date.now())}>Arrêter la séance</button>
      </div>
    </div>
  )
}
