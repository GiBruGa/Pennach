import { useEffect, useState } from 'react'
import { HashRouter, Link, Route, Routes } from 'react-router-dom'
import { ProfilProvider } from './context/ProfilContext'
import { getProfil, getProfilActifId, oublierProfilActif, type Profil } from './lib/profil'
import Accueil from './pages/Accueil'
import SelectionProfil from './pages/SelectionProfil'
import Seance from './pages/Seance'
import CarnetDeSuivi from './pages/CarnetDeSuivi'
import FicheProfil from './pages/FicheProfil'
import TestBluetooth from './pages/TestBluetooth'
import './App.css'

function AppConnecte({
  profil,
  changerProfil,
  majProfil,
}: {
  profil: Profil
  changerProfil: () => void
  majProfil: (profil: Profil) => void
}) {
  const [menuOuvert, setMenuOuvert] = useState(false)

  return (
    <ProfilProvider profil={profil} changerProfil={changerProfil} majProfil={majProfil}>
      <HashRouter>
        <header className="entete">
          <Link to="/" className="titre" onClick={() => setMenuOuvert(false)}>
            Pennac'h
          </Link>
          <nav>
            <Link to="/test-bluetooth" onClick={() => setMenuOuvert(false)}>
              Test Bluetooth
            </Link>
            <button onClick={() => setMenuOuvert((v) => !v)}>{profil.nom} ▾</button>
          </nav>
        </header>
        {menuOuvert ? (
          <div className="menu-avatar">
            <Link to="/fiche" onClick={() => setMenuOuvert(false)}>
              Fiche
            </Link>
            <button
              type="button"
              onClick={() => {
                setMenuOuvert(false)
                changerProfil()
              }}
            >
              Changer de profil
            </button>
            <button type="button" onClick={() => setMenuOuvert(false)}>
              Fermer
            </button>
          </div>
        ) : (
          <main>
            <Routes>
              <Route path="/" element={<CarnetDeSuivi />} />
              <Route path="/fiche" element={<FicheProfil />} />
              <Route path="/seance/:planId/:etapeId" element={<Seance />} />
              <Route path="/test-bluetooth" element={<TestBluetooth />} />
            </Routes>
          </main>
        )}
      </HashRouter>
    </ProfilProvider>
  )
}

export default function App() {
  const [profil, setProfil] = useState<Profil | null>(null)
  const [chargementInitial, setChargementInitial] = useState(true)
  const [demarre, setDemarre] = useState(false)

  useEffect(() => {
    const id = getProfilActifId()
    if (!id) {
      setChargementInitial(false)
      return
    }
    getProfil(id)
      .then((p) => {
        if (p) setProfil(p)
        else oublierProfilActif()
      })
      .catch(() => oublierProfilActif())
      .finally(() => setChargementInitial(false))
  }, [])

  if (!demarre) return <Accueil onCommencer={() => setDemarre(true)} />

  if (chargementInitial) return <p>Chargement…</p>

  if (!profil) return <SelectionProfil onSelected={setProfil} />

  return (
    <AppConnecte
      profil={profil}
      majProfil={setProfil}
      changerProfil={() => {
        oublierProfilActif()
        setProfil(null)
      }}
    />
  )
}
