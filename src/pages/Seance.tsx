import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useProfil } from '../context/ProfilContext'
import { getPlanProgression, saveSeance, savePlanProgression } from '../lib/storage'
import { TYPES_SEANCE } from '../lib/typesEntrainement'
import { calculerKarvonen, type DonneesKarvonen } from '../lib/karvonen'
import { TRADUCTIONS_GRANDEUR } from '../lib/lexique'
import { HeartRateConnection, RowerConnection } from '../lib/ble'
import type { EtapeProgression, EvenementHistorique, PlanProgression, Programme, RoleSection } from '../types'

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

// Résumé chiffré "avant séance" : s'appuie sur le rôle explicite de chaque section
// (posé par le générateur, cf. typesEntrainement.ts) plutôt que de le redéviner depuis
// les valeurs — un simple comptage de pics arrondi à l'entier ne suffit pas à distinguer
// les paliers d'une montée continue (Reiñ Bec'h) de vraies alternances (Koraiz Bihan).
// Les sections consécutives de même rôle sont d'abord regroupées en séquences logiques :
// un Reiñ Bec'h découpé en tranches d'1 min doit compter comme 1 effort continu, pas N.
function resumeSeance(sections: Programme['sections']) {
  const sequences: { role: RoleSection; dureeSecondes: number }[] = []
  for (const s of sections) {
    const derniere = sequences[sequences.length - 1]
    if (derniere && derniere.role === s.role) {
      derniere.dureeSecondes += s.dureeSecondes
    } else {
      sequences.push({ role: s.role, dureeSecondes: s.dureeSecondes })
    }
  }
  const efforts = sequences.filter((s) => s.role === 'effort')
  const recups = sequences.filter((s) => s.role === 'recuperation')
  const dureesEffort = efforts.map((s) => s.dureeSecondes)
  const dureesRecup = recups.map((s) => s.dureeSecondes)
  return {
    nbEfforts: efforts.length,
    dureeEffortMinSec: dureesEffort.length ? Math.min(...dureesEffort) : 0,
    dureeEffortMaxSec: dureesEffort.length ? Math.max(...dureesEffort) : 0,
    nbRecups: recups.length,
    dureeRecupMinSec: dureesRecup.length ? Math.min(...dureesRecup) : 0,
    dureeRecupMaxSec: dureesRecup.length ? Math.max(...dureesRecup) : 0,
    dureeTotaleMin: Math.round(sections.reduce((a, s) => a + s.dureeSecondes, 0) / 60),
  }
}

// Aperçu "avant séance" : courbe en escalier de la valeur (Nerzh ou Tizh) de chaque
// section, largeur proportionnelle à sa durée — donne une vue d'ensemble du parcours
// de la séance à venir sans faire tourner le décompte. La plage de valeurs (min–max)
// est affichée à côté du libellé, et l'axe des temps est partagé entre les 2 courbes
// (cf. AxeTemps) pour qu'on puisse lire directement à quel moment chaque phase tombe.
function GraphiqueSections({
  sections,
  valeur,
  couleur,
}: {
  sections: Programme['sections']
  valeur: (s: Programme['sections'][number]) => number
  couleur: string
}) {
  const largeur = 280
  const hauteur = 44
  const dureeTotale = sections.reduce((acc, s) => acc + s.dureeSecondes, 0) || 1
  const valeurs = sections.map(valeur)
  const min = Math.min(...valeurs)
  const max = Math.max(...valeurs)
  const marge = Math.max(1, (max - min) * 0.2)
  const yMin = min - marge
  const yMax = max + marge
  const echelleY = (v: number) => hauteur - ((v - yMin) / (yMax - yMin)) * hauteur

  let x = 0
  const points: string[] = []
  sections.forEach((s, i) => {
    const y = echelleY(valeurs[i])
    points.push(`${x},${y}`)
    x += (s.dureeSecondes / dureeTotale) * largeur
    points.push(`${x},${y}`)
  })

  return (
    <svg viewBox={`0 0 ${largeur} ${hauteur}`} className="graphique-parcours" preserveAspectRatio="none">
      <polyline points={points.join(' ')} fill="none" stroke={couleur} strokeWidth={2.5} strokeLinejoin="round" />
    </svg>
  )
}

// Axe des temps partagé (mêmes repères pour les 2 courbes, puisqu'elles portent sur
// les mêmes sections) : un repère toutes les 5 ou 10 min selon la durée totale.
function AxeTemps({ sections }: { sections: Programme['sections'] }) {
  const dureeTotaleMin = sections.reduce((acc, s) => acc + s.dureeSecondes, 0) / 60
  const pas = dureeTotaleMin > 30 ? 10 : dureeTotaleMin > 15 ? 5 : 2
  // Repères réguliers (0, pas, 2×pas…), sans en poser un trop près de la vraie fin —
  // qui reçoit toujours son propre repère avec la durée réelle (souvent pas un multiple
  // rond de `pas`, la dernière section absorbant le temps restant de la séance).
  const reperes: number[] = [0]
  for (let m = pas; m < dureeTotaleMin - pas * 0.4; m += pas) reperes.push(m)
  reperes.push(dureeTotaleMin)

  return (
    <div className="axe-temps-parcours">
      {reperes.map((m, i) => {
        const pourcent = (m / dureeTotaleMin) * 100
        const ancrage = i === 0 ? 'debut' : i === reperes.length - 1 ? 'fin' : 'milieu'
        const valeur = Math.round(m)
        return (
          <span
            key={i}
            className={`axe-temps-repere axe-temps-repere-${ancrage}`}
            style={{ left: `${pourcent}%` }}
          >
            {ancrage === 'fin' ? `${valeur} min` : valeur}
          </span>
        )
      })}
    </div>
  )
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

function programmeDepuisEtape(plan: PlanProgression, etape: EtapeProgression, karvonen: DonneesKarvonen): Programme {
  return {
    slot: etape.numero,
    nom: `${plan.nom} — Séance ${etape.numero}`,
    dureeTotaleSecondes: etape.parametres.dureeTotaleMinutes * 60,
    seuilEcartTizhPourcent: 15,
    signalSonoreTizh: false,
    sections: TYPES_SEANCE[etape.typeSession].genererSections(etape.parametres, karvonen),
  }
}

type Phase = 'avant' | 'compte_a_rebours' | 'en_cours' | 'pause' | 'fini'

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
  const [connecteKalon, setConnecteKalon] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [tizhReel, setTizhReel] = useState(0)
  const [nerzhReel, setNerzhReel] = useState<number | null>(null)
  const [kalonReel, setKalonReel] = useState<number | null>(null)
  const [sectionIndex, setSectionIndex] = useState(0)
  const [clignote, setClignote] = useState(false)
  const [maintenant, setMaintenant] = useState(() => Date.now())
  const [etapeFinale, setEtapeFinale] = useState<EtapeProgression | null>(null)
  const [remarquesBilan, setRemarquesBilan] = useState('')

  const ble = useRef(new RowerConnection())
  const kalonBle = useRef(new HeartRateConnection())
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
  const kalonSommeRef = useRef(0)
  const kalonCompteRef = useRef(0)
  // Respect de la plage Kalon sur l'ensemble de la séance (pas seulement le segment en
  // cours) : un échantillon FC de plus, un échantillon "dans la plage" de plus si la FC
  // reçue est dans la zone de la section active à cet instant. Sert au bilan de fin de séance.
  const kalonEchantillonsTotalRef = useRef(0)
  const kalonEchantillonsDansZoneRef = useRef(0)

  // Empêche l'écran de s'éteindre pendant la séance (décompte, en cours, pause) — sans
  // ça le téléphone se verrouille tout seul en pleine séance. Best-effort : silencieux
  // si l'API n'est pas supportée, et se ré-acquiert si l'onglet reprend la main après
  // avoir perdu le focus (le verrou est relâché automatiquement dans ce cas).
  useEffect(() => {
    if (phase !== 'compte_a_rebours' && phase !== 'en_cours' && phase !== 'pause') return
    let verrou: WakeLockSentinel | null = null
    async function demanderVeille() {
      try {
        if ('wakeLock' in navigator) {
          verrou = await navigator.wakeLock.request('screen')
        }
      } catch {
        // Refus du navigateur (économie d'énergie, permissions…) : pas bloquant.
      }
    }
    demanderVeille()
    function surChangementVisibilite() {
      if (document.visibilityState === 'visible' && !verrou) demanderVeille()
    }
    document.addEventListener('visibilitychange', surChangementVisibilite)
    return () => {
      document.removeEventListener('visibilitychange', surChangementVisibilite)
      verrou?.release().catch(() => {})
    }
  }, [phase])

  function demarrerNouveauSegment(nerzh: number, debut: number) {
    segmentRef.current = { debut, nerzh }
    tizhSommeRef.current = 0
    tizhCompteRef.current = 0
    kalonSommeRef.current = 0
    kalonCompteRef.current = 0
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
      setProgramme(programmeDepuisEtape(p, e, calculerKarvonen(profil)))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, etapeId])

  const sectionActuelle = programme?.sections[sectionIndex]
  const sectionSuivante = programme?.sections[sectionIndex + 1]
  sectionRef.current = sectionActuelle

  const clorreSegment = useCallback((fin: number, planNerzh: number, planTizh: number) => {
    const segment = segmentRef.current
    if (!segment || fin <= segment.debut) return
    const tizhMoyen =
      tizhCompteRef.current > 0 ? Math.round(tizhSommeRef.current / tizhCompteRef.current) : 0
    const kalonMoyen =
      kalonCompteRef.current > 0 ? Math.round(kalonSommeRef.current / kalonCompteRef.current) : undefined
    evenementsRef.current.push({
      type: segment.nerzh === planNerzh ? 'section_planifiee' : 'section_personnalisee',
      debut: segment.debut,
      fin,
      nerzh: segment.nerzh,
      tizhPrevu: planTizh,
      tizhReelMoyen: tizhMoyen,
      frequenceCardiaqueMoyenne: kalonMoyen,
    })
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
          // Le bilan (écran ci-dessous) affiche ces résultats et permet de compléter
          // l'Arabat Disoñjal à chaud, avant de retourner au carnet.
          setRemarquesBilan(etapeMaj.remarques ?? '')
          setEtapeFinale(etapeMaj)
          return
        }
      }
      navigate('/')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [programme, profil.id, plan, etape, nerzhReel, clorreSegment, navigate],
  )

  async function validerBilan() {
    if (plan && etapeFinale) {
      const etapeAvecRemarques = { ...etapeFinale, remarques: remarquesBilan }
      await savePlanProgression({
        ...plan,
        etapes: plan.etapes.map((e) => (e.id === etapeAvecRemarques.id ? etapeAvecRemarques : e)),
      })
    }
    navigate('/')
  }

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

  // Le compteur général continue pendant la pause (la pause fait partie de la séance) ;
  // la section en cours, elle, se fige à l'instant de la mise en pause (voir mettreEnPause).
  const tempsEcouleSeance =
    phase === 'en_cours' || phase === 'pause' ? maintenant - debutSeanceRef.current : 0
  const tempsRestantSeance = programme ? programme.dureeTotaleSecondes * 1000 - tempsEcouleSeance : 0
  const referenceSection = phase === 'pause' ? (pauseDebutRef.current ?? maintenant) : maintenant
  const tempsRestantSection = sectionActuelle
    ? sectionActuelle.dureeSecondes * 1000 - (referenceSection - debutSectionRef.current)
    : 0
  // Pellder/Energiezh affichés dans la carte de la section en cours : depuis le début de CETTE
  // section, pas le cumul de la séance (celui-ci alimente uniquement le carnet en fin de séance).
  const pellderSectionKm = Math.max(0, distanceMetresRef.current - segmentDebutDistanceRef.current) / 1000
  const energiezhSectionKcal = Math.max(0, energieKcalRef.current - segmentDebutEnergieRef.current)

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
        }
        if (data.totalEnergyKcal !== undefined) {
          energieKcalRef.current = data.totalEnergyKcal
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

  // Ceinture cardio : appairage séparé et optionnel (cf. décision utilisateur) — la
  // séance peut démarrer sans, si elle est oubliée ou refuse de s'appairer.
  async function connecterKalon() {
    setErreur(null)
    try {
      const conn = kalonBle.current
      await conn.connect()
      await conn.subscribe((bpm) => {
        setKalonReel(bpm)
        kalonSommeRef.current += bpm
        kalonCompteRef.current += 1
        const zone = sectionRef.current?.zoneKalon
        if (zone) {
          kalonEchantillonsTotalRef.current += 1
          if (bpm >= zone.min && bpm <= zone.max) kalonEchantillonsDansZoneRef.current += 1
        }
      })
      setConnecteKalon(true)
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
    // Le compteur de temps général de la séance continue de tourner pendant la pause
    // (la pause fait partie de la séance) : pas de rattrapage sur debutSeanceRef.
    // La section en cours, elle, est entièrement suspendue pendant la pause.
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
  // Convention : rouge = hors seuil (trop rapide ou trop lent), bleu = dans le seuil.
  // Le vert n'est pas pertinent pour signaler un sous-régime (cf. retour utilisateur) —
  // même convention appliquée à la FC ci-dessous.
  const couleurCercle = horsSeuil ? 'rouge' : 'bleu'
  const horsZoneKalon =
    kalonReel !== null &&
    sectionActuelle?.zoneKalon !== undefined &&
    (kalonReel > sectionActuelle.zoneKalon.max || kalonReel < sectionActuelle.zoneKalon.min)

  if (erreurChargement) return <p className="erreur">{erreurChargement}</p>
  if (!programme) return <p>Chargement…</p>

  if (phase === 'avant') {
    const resume = resumeSeance(programme.sections)
    return (
      <div className="ecran-seance ecran-seance-avant">
        <Link to="/" className="lien-retour-carnet">
          ◀ Retour
        </Link>
        <div className="entete-avant-seance">
          <h1>{(etape && TYPES_SEANCE[etape.typeSession]?.nom) ?? programme.nom}</h1>
          {etape && TYPES_SEANCE[etape.typeSession] && (
            <>
              <p className="traduction-fr">{TYPES_SEANCE[etape.typeSession].traductionNom}</p>
              <p className="devise-avant-seance">{TYPES_SEANCE[etape.typeSession].sousTitre}</p>
              <p className="traduction-fr">{TYPES_SEANCE[etape.typeSession].traductionSousTitre}</p>
            </>
          )}
        </div>
        <div className="apercu-sections">
          <div className="apercu-resume">
            <p>
              {resume.nbEfforts} effort{resume.nbEfforts > 1 ? 's' : ''} de{' '}
              {resume.dureeEffortMinSec === resume.dureeEffortMaxSec ? (
                formatMMSS(resume.dureeEffortMinSec * 1000)
              ) : (
                <>
                  {formatMMSS(resume.dureeEffortMinSec * 1000)} à {formatMMSS(resume.dureeEffortMaxSec * 1000)}
                </>
              )}
              {resume.nbRecups > 0 && (
                <>
                  {' '}
                  · récup de{' '}
                  {resume.dureeRecupMinSec === resume.dureeRecupMaxSec ? (
                    formatMMSS(resume.dureeRecupMinSec * 1000)
                  ) : (
                    <>
                      {formatMMSS(resume.dureeRecupMinSec * 1000)} à {formatMMSS(resume.dureeRecupMaxSec * 1000)}
                    </>
                  )}
                </>
              )}
            </p>
            <p>{resume.dureeTotaleMin} min au total</p>
          </div>
          <div className="apercu-grandeur">
            <span className="apercu-grandeur-label pastille-nerzh">Nerzh</span>
            <span className="apercu-grandeur-plage">
              {Math.min(...programme.sections.map((s) => s.nerzh))}–
              {Math.max(...programme.sections.map((s) => s.nerzh))}
            </span>
            <span className="traduction-fr">{TRADUCTIONS_GRANDEUR.Nerzh}</span>
            <GraphiqueSections sections={programme.sections} valeur={(s) => s.nerzh} couleur="#5a1f27" />
          </div>
          <div className="apercu-grandeur">
            <span className="apercu-grandeur-label pastille-tizh">Tizh</span>
            <span className="apercu-grandeur-plage">
              {Math.min(...programme.sections.map((s) => s.tizh))}–
              {Math.max(...programme.sections.map((s) => s.tizh))} Riw/min
            </span>
            <span className="traduction-fr">{TRADUCTIONS_GRANDEUR.Tizh}</span>
            <GraphiqueSections sections={programme.sections} valeur={(s) => s.tizh} couleur="#26306b" />
          </div>
          <AxeTemps sections={programme.sections} />
        </div>
        {erreur && <p className="erreur">{erreur}</p>}
        <div className="actions-connexion-avant">
          {!connecte && <button onClick={connecter}>Connecter le rameur</button>}
          {!connecteKalon ? (
            <button onClick={connecterKalon}>Connecter la ceinture</button>
          ) : (
            <span className="statut-connexion-ok">Ceinture connectée ✓</span>
          )}
          {connecte && <button onClick={demarrer}>Démarrer</button>}
        </div>
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

  if (phase === 'fini') {
    if (!etapeFinale) return <p>Séance enregistrée.</p>
    const pourcentageZoneKalon =
      kalonEchantillonsTotalRef.current > 0
        ? Math.round((kalonEchantillonsDansZoneRef.current / kalonEchantillonsTotalRef.current) * 100)
        : null
    return (
      <div className="ecran-seance ecran-bilan-seance">
        <h1>Bilan</h1>
        <div className="carte-etape-detail">
          <div className="liste-params-detail">
            <div className="ligne-param-detail">
              <span className="param-detail-label">
                Deiziad
                <span className="traduction-fr">{TRADUCTIONS_GRANDEUR.Deiziad}</span>
              </span>
              <span className="param-detail-valeur-simple">
                {new Date(etapeFinale.dateRealisee!).toLocaleDateString('fr-FR')}
              </span>
            </div>
            <div className="ligne-param-detail">
              <span className="param-detail-label">
                Amzervezh
                <span className="traduction-fr">{TRADUCTIONS_GRANDEUR.Amzervezh}</span>
              </span>
              <span className="param-detail-boite pastille-amzervezh">
                {formatMMSS((etapeFinale.dureeReelleSecondes ?? 0) * 1000)}
              </span>
              <span className="param-detail-unite">min:ss</span>
            </div>
            <div className="ligne-param-detail">
              <span className="param-detail-label">
                Pellder
                <span className="traduction-fr">{TRADUCTIONS_GRANDEUR.Pellder}</span>
              </span>
              <span className="param-detail-boite pastille-pellder">
                {etapeFinale.kmRealises !== undefined ? etapeFinale.kmRealises : '—'}
              </span>
              <span className="param-detail-unite">km</span>
            </div>
            <div className="ligne-param-detail">
              <span className="param-detail-label">
                Energiezh
                <span className="traduction-fr">{TRADUCTIONS_GRANDEUR.Energiezh}</span>
              </span>
              <span className="param-detail-boite pastille-energiezh">
                {etapeFinale.energieDepenseeKcal !== undefined ? etapeFinale.energieDepenseeKcal : '—'}
              </span>
              <span className="param-detail-unite">kcal</span>
            </div>
            {pourcentageZoneKalon !== null && (
              <div className="ligne-param-detail">
                <span className="param-detail-label">
                  Kalon
                  <span className="traduction-fr">Respect de la plage</span>
                </span>
                <span className="param-detail-boite pastille-kalon">{pourcentageZoneKalon}%</span>
              </div>
            )}
          </div>

          <div className="arabat-detail">
            <div className="param-detail-label">
              Arabat Disoñjal
              <span className="traduction-fr">Ne pas oublier</span>
            </div>
            <textarea
              className="arabat-detail-texte arabat-detail-champ"
              value={remarquesBilan}
              onChange={(e) => setRemarquesBilan(e.target.value)}
            />
          </div>

          <div className="actions-detail">
            <button type="button" onClick={validerBilan}>
              Terminer
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ecran-seance ecran-seance-en-cours">
      <div className="corps-seance-live">
        <div className="carte-section-courante">
          <div className="entete-carte-courante">
            <span>
              No. <strong>{sectionIndex + 1}</strong>
              {sectionActuelle?.zoneKalon && (
                <>
                  {' '}
                  Kalon <strong>
                    {sectionActuelle.zoneKalon.min}-{sectionActuelle.zoneKalon.max} bpm
                  </strong>
                </>
              )}
            </span>
            {sectionActuelle && (
              <span className="texte-kemenn">
                Kemenn <strong>{sectionActuelle.explication}</strong>
              </span>
            )}
          </div>

          <div className="grille-valeurs-courantes">
            <span className="ligne-valeur-label">Nerzh</span>
            <span className="ligne-valeur-boite pastille-nerzh">
              {nerzhReel ?? sectionActuelle?.nerzh}
            </span>
            <span />

            <span className="ligne-valeur-label">Tizh</span>
            <span className="ligne-valeur-boite pastille-tizh">{sectionActuelle?.tizh}</span>
            <span className="ligne-valeur-unite">Riw/min</span>

            <span className="ligne-valeur-label">Amzervezh</span>
            <span className="ligne-valeur-boite pastille-amzervezh">
              {formatMMSS(Math.max(0, tempsRestantSection))}
            </span>
            <span className="ligne-valeur-unite">min:ss</span>

            <span className="ligne-valeur-label">Pellder</span>
            <span className="ligne-valeur-boite pastille-pellder">{pellderSectionKm.toFixed(2)}</span>
            <span className="ligne-valeur-unite">km</span>

            <span className="ligne-valeur-label">Energiezh</span>
            <span className="ligne-valeur-boite pastille-energiezh">{energiezhSectionKcal}</span>
            <span className="ligne-valeur-unite">kcal</span>

            <span className="ligne-valeur-label">Kalon</span>
            <span
              className={`ligne-valeur-boite pastille-kalon ${horsZoneKalon ? 'pastille-kalon-alerte' : ''}`}
            >
              {kalonReel ?? '—'}
            </span>
            <span className="ligne-valeur-unite">bpm</span>
          </div>
        </div>

        <div className="colonne-circulaire">
          <div className="bloc-cercle-horloge">
            <div
              className={`cercle-tizh cercle-${phase === 'pause' ? 'bleu' : couleurCercle} ${clignote ? 'clignote' : ''}`}
            >
              <span className="tizh-valeur">{tizhReel}</span>
              <span className="tizh-unite">Riw/min</span>
            </div>
            <div className="boite-horloge">
              <div className="horloge-seance">{formatHHMMSS(tempsEcouleSeance)}</div>
              <div className="horloge-legende">hh:min:ss</div>
            </div>
          </div>

          <div className="bandeau-section-suivante">
            {sectionSuivante ? (
              <>
                <strong>No. {sectionIndex + 2}</strong>
                <span className="ligne-valeur-label">Nerzh</span>
                <span className="ligne-valeur-boite boite-mini pastille-nerzh">
                  {sectionSuivante.nerzh}
                </span>
                <span className="ligne-valeur-label">Tizh</span>
                <span className="ligne-valeur-boite boite-mini pastille-tizh">
                  {sectionSuivante.tizh}
                </span>
                <span className="ligne-valeur-unite">Riw/min</span>
                <span className="ligne-valeur-label">Padelezh</span>
                <span className="ligne-valeur-boite boite-mini pastille-neutre">
                  {formatMMSS(sectionSuivante.dureeSecondes * 1000)}
                </span>
                <span className="ligne-valeur-unite">min:ss</span>
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
      </div>
    </div>
  )
}
