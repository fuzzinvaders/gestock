# Gestock

*[English version](README.md)* · *[Journal des changements](CHANGELOG.md)*

Savoir ce qu'il reste dans le congélateur et les placards : à quel étage ou dans quel tiroir,
en quelle quantité, rangé quand et à consommer avant quand. Les codes-barres se scannent avec
l'appareil photo du téléphone et sont cherchés dans Open Food Facts : un produit se décrit une
fois, pas à chaque course. PWA installable, partagée par tout le foyer. **Auto-hébergée** : un
seul conteneur Docker, aucune base de données externe, aucun compte à créer chez un tiers — les
données restent sur ton propre serveur/NAS, dans un volume Docker.

## Lancer avec Docker (recommandé)

```bash
docker compose up -d
```

Ça télécharge l'image publiée `ghcr.io/fuzzinvaders/gestock:latest` — rien à construire. Pour
partir des sources à la place (ex. après avoir modifié le code), décommente `build` dans
[docker-compose.yml](docker-compose.yml) et lance `docker compose up -d --build`.

Ouvre `http://localhost:8080`. Au tout premier accès, l'app demande de créer le premier compte
(identifiant + mot de passe) : c'est l'administrateur, et c'est lui qui distribue des codes
d'invitation au reste du foyer. Tout le monde voit et modifie ensuite le même inventaire.

> **Caméra et HTTPS.** Les navigateurs n'ouvrent la caméra qu'en contexte sécurisé. En `http` sur
> une IP locale, le *scan* est donc indisponible — la saisie du code à la main, elle, fonctionne.
> Pour scanner depuis un téléphone, il faut servir l'app en HTTPS : voir ci-dessous.

Mettre à jour une instance existante :

```bash
docker compose pull && docker compose up -d
```

Les données (comptes, réserves, produits et lots) vivent dans le volume Docker `gestock-data`,
monté sur `/data` — elles survivent à `docker compose down` / `up`.

## Déployer derrière Traefik

```bash
docker network create proxy   # si le réseau n'existe pas encore
docker compose -f docker-compose.traefik.yml up -d
```

Copie [.env.example](.env.example) en `.env` à côté de ce fichier et renseigne au moins `DOMAIN`
(par exemple `gestock.exemple.fr`) — `ORIGIN` en est déduit automatiquement. Aucun port n'est
publié sur l'hôte : Traefik route le trafic par le réseau partagé `proxy`, en HTTPS — ce qui rend
du même coup la caméra disponible sur les téléphones.

## Développement (sans Docker)

Deux processus côte à côte :

```bash
npm install
npm run dev:server   # API + données, sur http://localhost:3000 (fichiers JSON dans ./.data)
npm run dev          # front Vite avec rechargement à chaud, sur http://localhost:5173
```

Ouvre `http://localhost:5173` — Vite relaie `/api` vers le serveur ci-dessus, et `localhost`
compte comme contexte sécurisé : la caméra fonctionne donc en développement. `npm test` (vitest)
couvre les dates de calendrier, les niveaux de péremption, la validation serveur et les
opérations d'inventaire.

## Comment ça marche

- **Ajouter** — scanner un code-barres, le taper, ou choisir un produit déjà connu. Un code
  inconnu est cherché dans Open Food Facts : nom, marque, rayon et photo reviennent pré-remplis,
  il ne reste qu'à corriger. Un code absent de la base publique se décrit à la main, une fois.
- **Produit et lot** — le *produit*, c'est le pot de miel en général ; le *lot*, c'est CE pot-là,
  au deuxième étage, ouvert en mars. Scanner un produit déjà connu saute directement au lot.
- **Réserves et sections** — une réserve est un congélateur, un placard, une cave ; les sections
  en sont les tiroirs et les étages. Retirer une section ne supprime rien : ses lots remontent
  dans la réserve.
- **Quantités** — chaque lot porte ce qu'il en reste, dans l'unité du produit. « J'en prends »
  décompte ce qu'on emporte ; quand il ne reste rien, le lot quitte l'inventaire.
- **Dates** — la date de stockage est celle du jour, et la péremption vient de la durée de
  conservation du produit ou des raccourcis +1 semaine / +6 mois.
- **Alertes** — périmés, à manger sous trois jours, et dans le mois, chaque lot avec la réserve
  et la section où aller le chercher. L'onglet porte le compte des deux premiers.
- **Le foyer** — le premier compte invite les autres avec un code, valable sept jours et bon une
  seule fois. Chaque lot garde le nom de qui l'a posé là.
- **Compte** — mot de passe, invitations, membres, et export JSON de tout l'inventaire. Sur
  téléphone il vit dans l'en-tête plutôt que dans la barre du bas, qui n'a de place que pour cinq
  onglets et les réserve aux gestes quotidiens.

## Recettes (Mealie, optionnel)

Renseigne `MEALIE_URL` et `MEALIE_TOKEN` (un jeton longue durée créé dans ton profil Mealie) et
un onglet **Recettes** apparaît. Sans ces variables, rien ne change : l'onglet n'existe pas.

Gestock ne lit Mealie que pour construire un *index* — pour chaque recette, la liste des
identifiants de ses ingrédients. L'index est refait une fois par jour en arrière-plan, ou à la
demande ; entre deux, répondre à « qu'est-ce qu'on mange » ne demande aucun réseau et survit à
une panne de Mealie. Gestock n'écrit jamais rien dans Mealie : un jeton en lecture suffit.

Reste à dire quel aliment Mealie correspond à quel produit du placard, dans l'écran
**Correspondances**. Les aliments arrivent du plus utilisé au moins utilisé, avec une proposition
quand les noms concordent (« filet de poulet » reconnaît « Blanc de poulet 4 filets 300 g »).
Trois réponses possibles :

- **relié à un produit** : disponible tant qu'il en reste un lot ;
- **toujours là** : le sel, l'huile, l'eau — ce qu'on ne compte pas mais qu'on a ;
- **rien** : l'aliment est compté comme manquant.

On part alors de la recette : on la cherche, on l'ouvre, et chaque ingrédient dit ce qu'on en a —
« carotte : Carottes fanes botte, réfrigérateur, 2 pièces, dans 3 semaines ». Le but est de ne
pas racheter ce qui dort au fond du congélateur. Le reste se copie en liste de courses d'un
bouton. Trois filtres : **toutes**, **rien à acheter**, et **à sauver** (les recettes qui
consomment un lot périmant dans la semaine).

Un ingrédient absent se dit de deux façons, et la nuance compte : **à acheter** quand il est
relié à un produit dont il ne reste plus rien, **non relié** quand on n'en sait simplement rien.
Le second se corrige dans Correspondances, pas au magasin.

Deux limites assumées :

- La question posée est « as-tu cet ingrédient », pas « en as-tu assez ». Convertir 200 g de
  tomates en « une boîte » n'est pas soluble dans le cas général, et une réponse fausse sur les
  quantités serait pire que pas de réponse du tout.
- Une recette dont **aucun** ingrédient n'est structuré dans Mealie (tout en texte libre) est
  écartée et comptée à part : elle ressortirait « il ne manque rien » alors qu'on ne sait rien
  d'elle. Les recettes partiellement structurées sont proposées, avec le nombre de lignes non
  vérifiées.

## Sauvegarder

Le volume Docker survit à `docker compose down`, mais **pas à la perte de la machine**. La
sauvegarde la plus simple en recopie le contenu :

```bash
docker run --rm -v gestock_gestock-data:/data -v "$PWD":/out alpine \
  tar czf /out/gestock-$(date +%F).tar.gz -C /data .
```

Pour restaurer, l'inverse, conteneur arrêté :

```bash
docker compose down
docker run --rm -v gestock_gestock-data:/data -v "$PWD":/in alpine \
  sh -c "rm -rf /data/* && tar xzf /in/gestock-2026-09-01.tar.gz -C /data"
docker compose up -d
```

Une ligne de `cron` sur l'hôte automatise tout ça. À défaut, la page **Compte** propose un export
JSON — plus léger, mais il faut y penser, et il ne contient pas les comptes.

## Mot de passe oublié

Gestock n'envoie aucun courrier : un écran de récupération ne pourrait vérifier l'identité de
personne. Le droit vient de l'accès à la machine :

```bash
docker exec gestock node tools/motdepasse.js <identifiant>
```

Sans mot de passe en argument, il en tire un au hasard et l'affiche — rien ne passe par
l'historique du shell. Toutes les sessions ouvertes sont fermées ; redémarre le conteneur pour
que ce soit pris en compte.

## Architecture

- Front : React + TypeScript + Vite + Tailwind, PWA installable ([vite.config.ts](vite.config.ts)).
- Back : [server/server.js](server/server.js), Node nu, **sans aucune dépendance npm**, qui sert
  à la fois les fichiers construits et l'API REST sous `/api/*`.
- Données : fichiers JSON dans `DATA_DIR` ([server/store.js](server/store.js)) — `users.json`
  (comptes, secret de session, invitations) et `inventaire.json` (l'inventaire commun du foyer).
  Écritures atomiques (fichier temporaire puis rename) ; toutes passent par `updateInventory`,
  qui lit et sauvegarde sans `await` entre les deux, de sorte que deux téléphones ne peuvent pas
  s'écraser l'un l'autre.
- Comptes : mots de passe dérivés par scrypt, session en cookie signé HMAC-SHA256 (`httpOnly`,
  `SameSite=Lax`). Connexions et inscriptions freinées (10 échecs par quart d'heure et par IP).
- Codes-barres : [src/lib/scan.ts](src/lib/scan.ts) utilise le `BarcodeDetector` natif là où il
  existe (Chrome, Edge) et charge un lecteur WebAssembly ailleurs (Safari, Firefox), seulement
  au moment voulu. Le `.wasm` est servi par l'app, pas par un CDN : le scan survit à une coupure
  d'Internet.
- Mealie : interrogé **depuis le serveur** ([server/mealie.js](server/mealie.js)), le jeton ne
  descend jamais dans le navigateur. Le croisement recettes/placard est un calcul pur
  ([server/cuisine.js](server/cuisine.js)), donc testable sans réseau.
- Open Food Facts : interrogé **depuis le serveur**
  ([server/openfoodfacts.js](server/openfoodfacts.js)), ce qui évite le CORS et met les réponses
  en cache pour tout le foyer. Le réseau n'est jamais obligatoire — un code inconnu se saisit à
  la main.

## Licence

[AGPL-3.0-or-later](LICENSE).
