import { Link } from 'react-router-dom'
import { TYPES_SEANCE } from '../lib/typesEntrainement'

export default function Metoadou() {
  return (
    <div className="ecran-metoadou">
      <Link to="/" className="lien-retour-carnet">
        ◀ Retour
      </Link>
      <h1>Metoadoù</h1>

      {Object.values(TYPES_SEANCE).map((type) => (
        <div key={type.nom} className="carte-metoadou">
          <h2>{type.nom}</h2>
          <p className="metoadou-objectif">{type.objectif}</p>
          <ul className="metoadou-methode">
            {type.methode.map((etape, i) => (
              <li key={i}>{etape}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
