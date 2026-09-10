import { createContext, useContext, type ReactNode } from 'react'
import type { Profil } from '../lib/profil'

interface ProfilContextValue {
  profil: Profil
  changerProfil: () => void
  majProfil: (profil: Profil) => void
}

const ProfilContext = createContext<ProfilContextValue | null>(null)

export function ProfilProvider({
  profil,
  changerProfil,
  majProfil,
  children,
}: {
  profil: Profil
  changerProfil: () => void
  majProfil: (profil: Profil) => void
  children: ReactNode
}) {
  return (
    <ProfilContext.Provider value={{ profil, changerProfil, majProfil }}>
      {children}
    </ProfilContext.Provider>
  )
}

export function useProfil(): ProfilContextValue {
  const ctx = useContext(ProfilContext)
  if (!ctx) throw new Error('useProfil doit être utilisé dans un ProfilProvider')
  return ctx
}
