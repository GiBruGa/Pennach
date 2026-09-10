export default function Accueil({ onCommencer }: { onCommencer: () => void }) {
  return (
    <div className="ecran-accueil">
      <img
        src={`${import.meta.env.BASE_URL}logo-blanc.svg`}
        alt="Pennac'h"
        className="logo-accueil"
      />
      <button type="button" className="bouton-commencer" onClick={onCommencer}>
        Commencer
      </button>
      <p className="mentions-legales">
        Ceci est une application offerte par Gilles Brun Gautier'h, tous droits réservés
      </p>
    </div>
  )
}
