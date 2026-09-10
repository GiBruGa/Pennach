import { useRef, useState } from 'react'
import { RowerConnection } from '../lib/ble'

const DUREE_TEST_MS = 30_000

type Phase = 'avant' | 'connexion' | 'test' | 'succes' | 'echec'

export default function TestBluetooth() {
  const [phase, setPhase] = useState<Phase>('avant')
  const [erreur, setErreur] = useState<string | null>(null)
  const [nomAppareil, setNomAppareil] = useState<string>()
  const [tizhReel, setTizhReel] = useState(0)
  const [tempsRestant, setTempsRestant] = useState(DUREE_TEST_MS)
  const [nbNotifications, setNbNotifications] = useState(0)

  const ble = useRef(new RowerConnection())
  const notificationsRecues = useRef(0)

  async function connecterEtTester() {
    setErreur(null)
    setPhase('connexion')
    try {
      const conn = ble.current
      await conn.connect()
      setNomAppareil(conn.nomAppareil)
      notificationsRecues.current = 0
      setNbNotifications(0)
      await conn.subscribeRowerData((data) => {
        notificationsRecues.current += 1
        setNbNotifications(notificationsRecues.current)
        setTizhReel(data.tizh)
      })

      setPhase('test')
      const debut = Date.now()
      const id = setInterval(() => {
        const restant = DUREE_TEST_MS - (Date.now() - debut)
        if (restant <= 0) {
          clearInterval(id)
          setTempsRestant(0)
          setPhase(notificationsRecues.current > 0 ? 'succes' : 'echec')
        } else {
          setTempsRestant(restant)
        }
      }, 200)
    } catch (e) {
      setErreur(String((e as Error).message ?? e))
      setPhase('avant')
    }
  }

  function recommencer() {
    ble.current.disconnect()
    ble.current = new RowerConnection()
    setPhase('avant')
    setTizhReel(0)
    setTempsRestant(DUREE_TEST_MS)
    setNbNotifications(0)
  }

  return (
    <div className="ecran-test-bluetooth">
      <h1>Test de connexion Bluetooth</h1>
      {erreur && <p className="erreur">{erreur}</p>}

      {phase === 'avant' && (
        <button type="button" onClick={connecterEtTester}>
          Connecter le rameur
        </button>
      )}

      {phase === 'connexion' && <p>Connexion en cours…</p>}

      {phase === 'test' && (
        <>
          <p>{nomAppareil} connecté.</p>
          <p className="consigne-test">
            Ramez 30s pour que je puisse vérifier la liaison avec votre rameur Merac'h.
          </p>
          <p>Temps restant : {Math.ceil(tempsRestant / 1000)}s</p>
          <p>Tizh reçu : {tizhReel} Riw/min</p>
          <p className="note">{nbNotifications} trame(s) reçue(s)</p>
        </>
      )}

      {phase === 'succes' && (
        <>
          <p className="succes-message">
            Connexion vérifiée : {nbNotifications} trame(s) reçue(s) de {nomAppareil}.
          </p>
          <button type="button" onClick={recommencer}>
            Refaire un test
          </button>
        </>
      )}

      {phase === 'echec' && (
        <>
          <p className="erreur">
            Aucune donnée reçue pendant les 30 secondes. Vérifie que le rameur est allumé, que le
            Bluetooth et la localisation sont activés sur ton téléphone, et que tu as bien ramé.
          </p>
          <button type="button" onClick={recommencer}>
            Réessayer
          </button>
        </>
      )}
    </div>
  )
}
