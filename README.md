# SmartGrid Semantic

Application web sémantique pour la gestion d'un réseau électrique intelligent (énergies renouvelables).
L'ontologie OWL `SmartGrid (3).owl` est chargée par un backend **FastAPI + RDFLib** et explorée par un frontend **React + TypeScript + Vite**.

```
web semantique/
├── SmartGrid (3).owl        # ontologie d'origine (jamais modifiée par l'API)
├── SmartGrid_new.owl        # nouvelle ontologie avec vos ajouts/suppressions (créée à la 1re modification)
├── backend/                 # FastAPI + RDFLib
│   ├── app/
│   │   ├── main.py          # routes /api/...
│   │   ├── store.py         # graphe RDF en mémoire + sauvegarde dans SmartGrid_new.owl
│   │   ├── entities.py      # CRUD piloté par l'ontologie (sources, stockage, bâtiments, lignes)
│   │   ├── ontology.py      # classes, propriétés, individus, graphe réseau
│   │   ├── sparql_service.py
│   │   ├── nlp/             # 3 assistants NLP spaCy (sources, bâtiments, lignes), aucune API de LLM
│   │   │   ├── core.py               # moteur spaCy commun : analyse, entités, classifieur, génération SPARQL
│   │   │   ├── common.py             # unités, comparateurs, agrégations, intentions (partagés)
│   │   │   ├── domaine_sources.py    # assistant 1 : vocabulaire + questions d'entraînement des sources
│   │   │   ├── domaine_batiments.py  # assistant 2 : bâtiments
│   │   │   ├── domaine_lignes.py     # assistant 3 : lignes de transport
│   │   │   └── domaine_mobilite.py   # assistant 4 : mobilité électrique
│   │   └── dashboard.py
│   ├── requirements.txt
└── frontend/                # React + TypeScript + Vite
    └── src/{components,pages,services,types,hooks,utils,context}
```

## Installation

Prérequis : Python 3.10+ et Node.js 18+.

### Backend

```bash
cd backend
python -m venv .venv
# Windows : .venv\Scripts\activate    |    macOS/Linux : source .venv/bin/activate
pip install -r requirements.txt   # installe aussi le modèle spaCy fr_core_news_sm
uvicorn app.main:app --reload --port 8000
```

Documentation interactive de l'API : http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
npm run build               # build de production dans dist/
```

L'URL de l'API se règle dans `frontend/.env` : `VITE_API_BASE_URL=http://localhost:8000/api`.

## Points importants

- **Comptes (connexion / inscription)** : toutes les pages et toutes les routes de l'API (sauf `/api/health` et `/api/auth/*`) demandent d'être connecté. Les comptes sont enregistrés dans `backend/data/users.json`. Les mots de passe ne sont jamais stockés en clair : seul un hachage PBKDF2-SHA256 salé (200 000 itérations) est conservé. Après connexion, le backend renvoie un jeton signé (HMAC-SHA256, valable 7 jours, clé dans `backend/data/secret.key`) que le frontend envoie dans l'en-tête `Authorization: Bearer …`. En mode démo (backend injoignable), l'application reste consultable sans compte.
- **Persistance** : le fichier OWL n'est jamais modifié. Toute création, modification, suppression ou requête SPARQL UPDATE est enregistrée immédiatement dans **`SmartGrid_new.owl`** (RDF/XML, à côté du fichier d'origine, ouvrable dans Protégé). Au démarrage, le backend charge `SmartGrid_new.owl` s'il existe, sinon le fichier d'origine. *Paramètres → Réinitialiser* supprime `SmartGrid_new.owl` et recharge l'ontologie d'origine.
- **Huit tables CRUD**, une par famille de l'ontologie : Sources de production, Stockage, Bâtiments, Lignes de transport, Mobilité électrique, Systèmes intelligents, Conditions météo et Réglementation. Les relations proposées dans le formulaire dépendent de la classe choisie et sont vérifiées par le backend avec le `rdfs:domain` de la propriété (ex. `sg:surveille` seulement pour un capteur).
- **Quatre assistants NLP, uniquement avec spaCy (sans API de LLM)** : un assistant par domaine, utilisable dans la page *Assistant NLP* (un onglet par domaine) et dans la boîte « Demander en français » sous le tableau des pages Sources, Bâtiments, Lignes et Mobilité électrique.

  | Assistant | Fichier | Domaine de l'ontologie |
  |---|---|---|
  | Sources de production | `backend/app/nlp/domaine_sources.py` | `sg:SourceProduction` (+ relations `alimente`, `injecteDans`, `stocke`) |
  | Bâtiments | `backend/app/nlp/domaine_batiments.py` | `sg:Batiment` (+ relation `alimente`, classe énergétique) |
  | Lignes de transport | `backend/app/nlp/domaine_lignes.py` | `sg:LigneTransport` (+ relations `estConnecteA`, `injecteDans`, état de la ligne) |
  | Mobilité électrique | `backend/app/nlp/domaine_mobilite.py` | `sg:MobiliteElectrique` (+ relations `recharge`, `estRaccordeeA`, `restitueA`, disponibilité, connecteurs) |

  Chaque fichier de domaine contient son vocabulaire (synonymes français des classes, propriétés et relations), ses mots de statut, ses unités et ses 93 questions d'entraînement. Le moteur commun (`core.py`) fait :
  1. **spaCy** (`fr_core_news_sm`) : tokenisation, lemmatisation, étiquetage morpho-syntaxique, analyse en dépendances ;
  2. **normalisation** : lemme spaCy sans accents + règles de suffixes (pluriel, féminin, terminaisons verbales), donc « centrales », « alimentées », « consomment » sont reconnus ;
  3. **PhraseMatcher spaCy** : reconnaissance des classes, individus, propriétés et relations du domaine (vocabulaire généré depuis le fichier OWL + synonymes) ; extraction des nombres, unités (MW → kW…), comparateurs, années, statuts et agrégations ;
  4. **spaCy TextCategorizer** (un par domaine) : classifieur d'intention entraîné sur les questions du domaine (9 intentions, dont « valeur d'une propriété » : « Quelle est la surface de l'école ? ») ; la question est « délexicalisée » (CLASSE, PROPRIETE, NOMBRE, COMPARATEUR, SUPERLATIF…) avant classification. Précision en validation croisée 5 plis : ≈ 95 % (sources), 92 % (bâtiments), 87 % (lignes) ;
  5. **règles** : une question sans terme de l'ontologie est « hors sujet » ; une question sur un autre domaine est redirigée vers le bon assistant ;
  6. **génération SPARQL** par modèles (SELECT, COUNT, SUM/AVG/MAX/MIN, ORDER BY … LIMIT 1, ASK), vérification lecture seule, exécution par RDFLib.
  L'interface affiche toutes ces étapes (« Analyse linguistique »).
- **SPARQL** : les requêtes de modification sont refusées par l'API (HTTP 409) tant qu'elles ne sont pas confirmées dans l'interface.
- **Mode démo** : si le backend est injoignable, le frontend affiche un bandeau « Mode démo : données fictives », désactive les modifications et n'affiche ni ontologie, ni SPARQL, ni NLP (pas de données inventées).

## API

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/auth/signup` `{nom, email, password}` | créer un compte (public) |
| POST | `/api/auth/login` `{email, password}` | se connecter, renvoie le jeton (public) |
| GET | `/api/auth/me` | utilisateur connecté |
| GET | `/api/health` | état du serveur (public) |
| GET | `/api/info` | configuration |
| POST | `/api/system/reset` | recharger le fichier OWL d'origine |
| GET | `/api/dashboard/stats`, `/api/activity` | indicateurs, activité récente |
| GET/POST | `/api/{sources,storage,buildings,lines}` | liste (search, type, status, sort, order, page, page_size) / création |
| GET/PUT/DELETE | `/api/{entité}/{id}` | lecture / modification / suppression |
| GET | `/api/{entité}/types` | sous-classes OWL autorisées |
| GET | `/api/grid` | nœuds (individus) et arêtes (ObjectProperties) |
| GET | `/api/ontology/summary`, `/classes`, `/object-properties`, `/data-properties` | schéma OWL |
| GET | `/api/ontology/individuals[?class=]`, `/individuals/{id}` | individus |
| GET | `/api/ontology/export?format=turtle\|xml\|json-ld\|nt` | export du graphe |
| POST | `/api/sparql` `{query, allow_update}` | exécution SPARQL |
| POST | `/api/sparql/analyze` | type de requête (lecture / modification) |
| POST | `/api/nlp/ask` `{question, domain}` | assistant en langage naturel (`domain` = `sources`, `batiments` ou `lignes`) |
| GET | `/api/nlp/info` | moteur NLP, précision et exemples de chaque assistant |

## Limites connues (liées au contenu de l'ontologie)

- L'ontologie n'a pas de propriété de **localisation** pour les sources : seule l'adresse des bâtiments (`sg:adresse`) est affichée.
- Il n'y a pas de **séries temporelles** : les graphiques utilisent les valeurs de l'ontologie (`sg:puissance`, `sg:productionAnnuelle`, `sg:consommation`), pas un historique.
- Les unités ne sont pas déclarées dans l'OWL ; l'interface suppose kW (puissance, capacité de transport), kWh (capacité, consommation), km, kV et %.
- Aucun individu `Universite` n'existe dans l'OWL : la question « Quelles sources alimentent l'université ? » renvoie donc un résultat vide tant qu'une université n'est pas ajoutée.
