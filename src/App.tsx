import { useEffect, useState } from 'react'
import { HashRouter, Link, Route, Routes } from 'react-router-dom'
import { ProfilProvider } from './context/ProfilContext'
import { getProfil, getProfilActifId, oublierProfilActif, type Profil } from './lib/profil'
import SelectionProfil from './pages/SelectionProfil'
import ProgrammesList from './pages/ProgrammesList'
import ProgrammeEditor from './pages/ProgrammeEditor'
import Seance from './pages/Seance'
import Historique from './pages/Historique'
import './App.css'

function AppConnecte({ profil, changerProfil }: { profil: Profil; changerProfil: () => void }) {
  return (
    <ProfilProvider profil={profil} changerProfil={changerProfil}>
      <HashRouter>
        <header className="entete">
          <Link to="/" className="titre">
            Pennac'h
          </Link>
          <nav>
            <Link to="/historique">Historique</Link>
            <button onClick={changerProfil}>{profil.nom} ▾</button>
          </nav>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<ProgrammesList />} />
            <Route path="/programme/:slot" element={<ProgrammeEditor />} />
            <Route path="/seance/:slot" element={<Seance />} />
            <Route path="/historique" element={<Historique />} />
          </Routes>
        </main>
      </HashRouter>
    </ProfilProvider>
  )
}

export default function App() {
  const [profil, setProfil] = useState<Profil | null>(null)
  const [chargementInitial, setChargementInitial] = useState(true)

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

  if (chargementInitial) return <p>Chargement…</p>

  if (!profil) return <SelectionProfil onSelected={setProfil} />

  return (
    <AppConnecte
      profil={profil}
      changerProfil={() => {
        oublierProfilActif()
        setProfil(null)
      }}
    />
  )
}
