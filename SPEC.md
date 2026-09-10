# Pennac'h — Cahier des charges

Application mobile (React Native) de suivi d'entraînement pour rameur électromagnétique **Merach R15 Pro**, connecté en Bluetooth Low Energy via le protocole standard **FTMS** (Fitness Machine Service).

Nom technique du projet : `Pennach`. Nom affiché dans l'app : `Pennac'h`.

## 1. Confirmations techniques (Bluetooth)

Vérifié empiriquement le 2026-09-07 avec nRF Connect sur le rameur `MRK-R15-0639` :

- Service **Fitness Machine (0x1826)** présent, standard FTMS complet.
- **Rower Data (0x2AD1)** [Notify] : diffuse en direct stroke rate, stroke count, énergie totale/heure/minute, fréquence cardiaque (si capteur externe couplé au rameur), temps écoulé. Testé et confirmé fonctionnel.
- **Fitness Machine Control Point (0x2AD9)** [Indicate, Write] : permet d'envoyer la commande *Set Target Resistance Level*.
- **Supported Resistance Level Range (0x2AD6)** : min **1**, max **16**, incrément **1** → confirme les 16 niveaux de résistance pilotables depuis l'app.
- **Supported Speed Range (0x2AD4)** : 0/0/0 → non applicable (normal pour un rameur).
- **Supported Power Range (0x2AD8)** : 0-1000 W, incrément 1 W (disponible mais non prioritaire).
- **Fitness Machine Status (0x2ADA)** [Notify] : statuts machine (ex: "Stopped or Paused by User").
- Services propriétaires Merach/ThinkFIT (`0xF8C0`, `0xFFF0`, UUID custom encodant "MERACH"/"YULU") : identifiés mais non utilisés, pas nécessaires puisque FTMS suffit.

Conclusion : lecture des données ET pilotage de la résistance sont réalisables via le seul standard FTMS, sans reverse-engineering du protocole propriétaire.

## 2. Programmes d'entraînement

- L'application permet de définir **5 programmes d'entraînement** (slots fixes).
- Un programme définit :
  - une **durée totale**
  - un **nombre de sections**
  - un **seuil d'écart de tempo X %** (paramètre général du programme — sert à déclencher le rouge/vert pendant la séance, voir §4)
  - pour chaque section :
    - une **durée**
    - une **intensité** (résistance, 1 à 16)
    - un **tempo** prévu (cadence, coups/min)
    - une **phrase d'explication de l'exercice** (200 caractères max)
  - la **dernière section dure le temps restant** du programme (pas de durée fixe à saisir pour elle, ou recalculée automatiquement)
  - un réglage **signal sonore du Tizh** (activable/désactivable, voir §4)

## 3. Déroulement d'une séance

- **Lancement** : la séance démarre après un **décompte de 10 secondes**.
- **Pause** : possible à tout moment ; le temps de pause est décompté à l'écran et **ajouté à l'historique de la séance** (comme un événement/temps mort identifié).
- **Arrêt anticipé** : possible avant la fin du programme ; déclenche **l'enregistrement des données de la séance dans l'historique des entraînements** (même partielle).
- **Fin normale** : enregistrement automatique dans l'historique également (à confirmer explicitement mais logique).
- **Décompte sonore des 15 dernières secondes de la séance** (pas de chaque section — uniquement en toute fin de programme, juste avant l'arrêt).

## 4. Écran pendant la séance (orientation paysage)

- **Cercle bleu**, occupant ~80 % de l'écran :
  - clignote au rythme du **tempo prévu** de la section en cours
  - passe au **rouge** ou **vert** quand l'écart entre le tempo réel (mesuré via Rower Data / stroke rate) et le tempo prévu dépasse le seuil **X %** défini au niveau du programme (§2)
- **Décompte du temps de la section en cours**
- **Décompte du temps de la séance** (temps total restant)
- **Valeur de résistance affichée en gros**, reflétant la résistance réelle du rameur (lue via FTMS) :
  - modifiable manuellement par les boutons physiques du rameur
  - si la résistance change et **reste stable au moins 5 secondes**, ce changement est enregistré comme une **section personnalisée ajoutée à l'historique** de la séance
  - règle anti-rebond : un changement qui ne tient pas 5 secondes (ex: clics successifs +/- ) ne doit **pas** créer de section — seule la valeur stabilisée compte
  - une section personnalisée **ne modifie que la résistance** : le temps et le tempo restent ceux prévus par le programme pour la section en cours (ce n'est pas une nouvelle section de programme, juste une résistance différente du plan sur la même fenêtre de temps)
  - elle **se termine dès qu'une nouvelle section commence** — la section suivante planifiée (qui impose alors sa propre résistance/temps/tempo, remplaçant la résistance manuelle) ou une autre section personnalisée (nouveau changement manuel stabilisé ≥5s avant la fin de la fenêtre planifiée)
- **Phrase d'explication de l'exercice** de la section en cours (issue de la config du programme, ≤200 caractères), affichée sous le cercle
- **Aperçu de la section suivante**, affiché en dessous, à titre informatif : temps, tempo, résistance, explication
- **Signal sonore du Tizh** : si activé dans le programme (§2), un bip accompagne chaque coup prévu, au même rythme que le clignotement du cercle bleu. Que ce réglage soit activé ou non, le bip sonne systématiquement pendant les **15 dernières secondes de la séance** (en plus du décompte, voir §3).

## 5. Historique des entraînements

Doit conserver, pour chaque séance effectuée :
- les sections planifiées réellement traversées (avec durée réelle si différente du plan)
- les sections ajoutées automatiquement suite à un changement manuel de résistance stabilisé ≥5s
- les temps de pause (comme événements distincts)
- la fréquence cardiaque si disponible (voir §6)
- statut de fin : terminée normalement / arrêtée manuellement

## 6. Fonctionnalité différée (à voir après le reste)

- Connexion simultanée à la **montre Huawei** de l'utilisateur pour récupérer la **fréquence cardiaque** en direct pendant la séance, et l'enregistrer dans l'historique.
- Priorité basse — à traiter une fois le reste (programme, séance, résistance, historique) fonctionnel.

## 7. Décisions tranchées

- **Fin de séance normale** : enregistrement automatique dans l'historique dès que le temps total du programme est écoulé, sans confirmation demandée à l'utilisateur (même mécanisme qu'un arrêt anticipé, mais statut "terminée").
- **Seuil X % (écart de Tizh)** : valeur par défaut **15 %**, modifiable individuellement pour chaque programme d'entraînement.

## 8. Vocabulaire brittophone (termes de l'interface)

Les grandeurs de l'app portent des noms en breton :

- **Tizh** : cadence de rame (Stroke Rate, champ Rower Data 0x2AD1), unité *Riw/min* (ou *Taol Riw/min* — coup de glisse par minute)
- **Nerzh** : résistance (Resistance Level, 1 à 16)
- **Amzer** : temps

## 9. Stack technique retenue

**Pivot 2026-09-07** : abandon de React Native au profit d'une **PWA web** (Progressive Web App), comme les autres outils UrBizia (FBS, SpotSan) :

- **Web Bluetooth API** (Chrome/Edge Android) pour la connexion FTMS — pas de compilation native, pas d'APK à distribuer
- Hébergement **GitHub Pages**, dépôt GitHub dédié (indépendant des dépôts UrBizia)
- Partage familial = un simple lien à ouvrir dans Chrome Android (+ "Ajouter à l'écran d'accueil")
- **Limite connue et acceptée** : Web Bluetooth ne fonctionne pas sur Safari iOS. Confirmé le 2026-09-07 que tous les téléphones concernés (utilisateur, épouse, filles) sont sous Android — non bloquant.
- Stack front : **React + Vite + TypeScript**
- **Stockage : Supabase** (Postgres), comme les autres outils UrBizia — décidé le 2026-09-07 pour permettre à toute la famille de retrouver son historique sur n'importe quel appareil. Projet Supabase dédié `Pennach` (org UrBizia, indépendant des autres projets).
- **Profils multiples sans authentification** : sélecteur de profil simple (prénom) au premier lancement sur un appareil, stocké en `localStorage` sur l'appareil ; les données (programmes, historique) sont scopées par `profil_id` dans Supabase. Pas de mot de passe — usage familial privé, confidentialité basée sur le secret du lien de l'appli + policies RLS.
- Tables : `profils`, `programmes` (5 slots par profil, `sections` en JSONB), `seances` (historique, `evenements` en JSONB), `plans_progression` (`etapes` en JSONB)

## 10. Génération automatique de sections (2026-09-10)

Reprise du classeur Excel de référence de l'utilisateur (`Rameur - Programme PP MIIT.xlsm`,
feuille "Programmation Séance") : un mode de génération automatique dans l'éditeur de
programme, à partir de 4 critères, au lieu de saisir chaque section à la main.

- **4 critères** : Puissance (1-10), Rythme (1-10), Récupération (1-10, plus haut = plus de
  repos), Durée totale (minutes)
- **Échauffement** fixe (5 min), **retour au calme** final qui absorbe le temps restant (règle
  standard §2), et entre les deux une alternance **Effort / Récupération** :
  - la durée de chaque section d'**Effort** suit la courbe `EvolTemps` (la fonction
    `courbe(t,D)` dérivée avec l'utilisateur : montée sinusoïdale 1→2 sur les 2/3 du temps,
    descente sinusoïdale 2→1 sur le tiers restant) — les efforts s'allongent puis se
    raccourcissent au fil de la séance
  - la durée de chaque **Récupération** est fixe : `0.3 + Récupération × 0.2` minutes
- **Nerzh et Tizh** de chaque section dérivés des critères Puissance/Rythme par les mêmes
  formules que le classeur (barèmes différents selon Échauffement / Effort / Récupération /
  Retour)
- **Kalon (fréquence cardiaque) par type de section**, informatif ("constat", non asservi —
  pas de connexion capteur FC pour l'instant, cf. §6) : Échauffement 119-128 bpm, Effort
  138-147 bpm (Zone 3), Récupération 120-130 bpm (Zone 1/2), Retour < 119 bpm — modifiables
  par section après génération
- Implémenté dans `src/lib/generateur.ts` ; la génération **remplace** les sections existantes
  du programme (confirmation demandée), le résultat reste ensuite éditable section par section
  comme avant

## 11. Karned Heuliañ (carnet de suivi) — refonte du 2026-09-10/11

**Karned Heuliañ devient le cœur unique de l'appli**, à la place des anciens écrans
"Programmes" (5 slots) et "Historique", supprimés. Chaque profil a **un seul carnet**
(auto-créé au premier accès, table `plans_progression`, `getOuCreerCarnet()` dans
`storage.ts`) — pas de notion de plans multiples ni de sélection de plan.

**Structure d'une étape** (`EtapeProgression`) — reprise de la feuille "Carnet de Suivi" du
classeur Excel de référence, sans la colonne "Phase" (supprimée le 2026-09-11 ; son contenu,
pour les étapes déjà présentes, a été basculé dans Arabat Disoñjal) :
- **Type de séance** : un seul type existe pour l'instant, **Reiñ Bec'h** (HIIT — "mouiller le
  maillot"). D'autres types pourront s'ajouter à `TYPES_SESSION` dans `CarnetDeSuivi.tsx`.
- **Nerzh / Tizh / Adnerzhañ / Padelezh** : les mêmes 4 critères qu'en §10 (Puissance/Rythme/
  Récupération/Durée cible), continuent à piloter `genererSections()` (courbe EvolTemps) — le
  renommage en vocabulaire breton est un habillage d'affichage, pas un changement du moteur de
  génération. **Attention à la terminologie (fixée le 2026-09-11, a changé une première fois)** :
  - **Padelezh** = la durée *cible/planifiée* (persiste, comme un jour — ex: 45 min prévues)
  - **Amzervezh** = la durée *réelle* remontée automatiquement du rameur à la fin d'une séance
    (la durée de l'événement lui-même) — **ne pas confondre avec Padelezh**
  - **Adnerzhañ** = le critère Récupération (1-10)
- **Résultat**, renseigné **automatiquement** à la fin de la séance liée (voir §13) : Deiziad
  (date), Amzervezh (durée réelle), Pellder (distance), Energiezh (énergie) — affichés avec un
  retour à la ligne entre chaque valeur, y compris dans la colonne compacte du tableau.
- **Arabat Disoñjal** (« à retenir ») : remarque libre, **par étape** (pas un commentaire
  global) — visible comme colonne à part entière du tableau, modifiable à tout moment (avant ou
  après la séance).

**Vocabulaire dans les champs éditables (2026-09-11)** : comme il y a désormais beaucoup de
termes bretons, les *champs de saisie* du panneau d'édition (pas les en-têtes de colonnes du
tableau) portent leur unité ou leur échelle entre parenthèses — jamais une traduction du mot
lui-même : `Nerzh (1-10)`, `Tizh (Riw/min)`, `Adnerzhañ (1-10)`, `Padelezh (min)`.

**Interaction** : la liste est un tableau compact façon Excel (`table-carnet`, une ligne =
une étape). Cliquer une ligne l'ouvre en édition (une seule à la fois) :
- étape **à venir** : Type + les 4 critères + Arabat Disoñjal sont modifiables ; actions
  *Sortir* (annule), *Supprimer*, *Sauvegarder*, *Lancer* (sauvegarde puis bascule sur l'écran
  de séance).
- étape **réalisée** : seul Arabat Disoñjal est modifiable ; actions *Supprimer*, *Fermer
  (sauvegarde)*.

**Ajouter une séance** : bouton en haut du tableau (`barre-outils-carnet`). Si une étape est
ouverte, le bouton devient *Ajouter après* et insère juste après elle ; sinon la nouvelle étape
est ajoutée en fin de liste.

**Positionnement automatique** : à l'ouverture, la liste défile jusqu'à la première étape non
réalisée (`indexProchaine`, badge "prochaine"), dans un conteneur à défilement vertical borné
(`table-carnet-conteneur`, `max-height`) pour naviguer entre séances passées et futures.

**Vocabulaire** : les termes bretons (Karned Heuliañ, Reiñ Bec'h, Tizh, Nerzh, Amzer, Kalon,
Deiziad, Padelezh, Pellder, Energiezh, Arabat Disoñjal) **ne sont jamais glosés en français**
dans l'interface — décision explicite du 2026-09-11, les utilisateurs doivent deviner/apprendre
le sens par l'usage plutôt que par une traduction entre parenthèses. Les noms de colonnes du
tableau restent affichés (ce n'est pas la même règle que les glosses).

**Import** : les 20 séances du classeur Excel de référence (`Rameur - Programme PP MIIT.xlsm`,
feuille "Carnet de Suivi") ont été importées dans le carnet du profil GBG via SQL direct
(phases d'origine repliées dans Arabat Disoñjal lors du retrait de la colonne Phase).

## 12. Convention de mise en page (2026-09-10, largeur revue le 2026-09-11)

Le personnage du fond illustré (le rameur, `public/fond.jpg`) est centré dans l'image.
**Tout panneau de contenu (menu, carte, formulaire...) doit être aligné à gauche de l'écran**
(pas de `margin: 0 auto`), pour ne jamais recouvrir le personnage.

`main` a été élargi (`max-width: min(1100px, 85vw)`, était 420px) pour que le tableau du carnet
tienne sans ascenseur horizontal sur un écran large — le fond (`main.tsx`) est positionné
`left center` (au lieu de `center`) plutôt que centré, ce qui laisse le personnage visible sur
la partie droite de l'écran même avec un panneau élargi. Sur mobile étroit, le tableau garde de
toute façon son propre défilement horizontal borné (`table-carnet-conteneur`) si besoin.

## 13. PWA installable

Manifest complet (`public/manifest.json`, lié depuis `index.html`) : icônes 192/512/512
maskable/apple-touch générées depuis `Pennac'h - Logo Simple Blanc.svg` composé sur fond bleu
marine (`#0a1930`) — un logo blanc seul sur fond transparent ne suffit pas comme icône d'accueil.
Une PWA déjà installée ne reprend pas une icône mise à jour automatiquement : il faut
désinstaller/réinstaller (ou "Ajouter à l'écran d'accueil" à nouveau) après tout changement de
logo ou de manifest.

## 14. Test Bluetooth

Écran dédié (`/test-bluetooth`, `TestBluetooth.tsx`) pour valider la liaison sans passer par une
séance complète : connexion au rameur, consigne "Ramez 30s pour que je puisse vérifier la
liaison avec votre rameur Merac'h", décompte, comptage des trames Rower Data reçues, verdict
succès/échec à la fin.

## 15. Distance (Pellder) — limite matérielle constatée

`parseRowerData()` extrait le champ Distance Totale (uint24, mètres) du flux FTMS quand le bit
correspondant du champ `flags` est positionné. **Sur le R15 Pro testé, ce bit n'était pas
positionné lors de la capture de référence du 2026-09-07** (seuls Stroke Rate/Count, Énergie,
Fréquence cardiaque et Temps écoulé étaient présents) — donc Pellder pourrait rester vide en
pratique sur ce rameur précis, malgré un parsing conforme à la spec FTMS. À vérifier lors d'une
vraie séance avec un rameur connecté.
