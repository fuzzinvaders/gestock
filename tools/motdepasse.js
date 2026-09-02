#!/usr/bin/env node
/**
 * Redonne un mot de passe à un compte, depuis la machine qui héberge.
 * Copyright (C) 2026 fuzzinvaders
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 *   DATA_DIR=/data node tools/motdepasse.js
 *   DATA_DIR=/data node tools/motdepasse.js <identifiant>
 *   DATA_DIR=/data node tools/motdepasse.js <identifiant> <motdepasse>
 *
 * Sans mot de passe en argument, il en tire un au hasard et l'affiche : rien ne passe alors par
 * l'historique du shell.
 *
 * Pourquoi en ligne de commande plutôt qu'un écran de récupération ? Parce que Gestock n'envoie
 * aucun courrier : un écran « mot de passe oublié » ne pourrait vérifier l'identité de personne.
 * Ici le droit vient de l'accès à la machine, ce qui est le bon niveau.
 *
 * Le secret de signature des sessions est renouvelé au passage : sans cela, un mot de passe
 * changé ne chasserait pas les navigateurs déjà connectés. Tout le foyer devra donc se
 * reconnecter — c'est le prix d'une reprise en main, et il est assumé.
 */
"use strict";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", ".data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function sortir(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(USERS_FILE)) {
  sortir(
    `Aucun fichier de comptes dans ${DATA_DIR}.\n` +
      "Indique le bon dossier avec DATA_DIR, par exemple :\n" +
      "  docker exec gestock node tools/motdepasse.js",
  );
}

const store = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
const users = Array.isArray(store.users) ? store.users : [];
if (users.length === 0) sortir("Aucun compte n'existe encore : ouvre l'application pour le créer.");

const demande = process.argv[2];
let compte;
if (demande) {
  compte = users.find((u) => u.username.toLowerCase() === demande.toLowerCase());
  if (!compte) {
    sortir(`Aucun compte « ${demande} ». Comptes existants : ${users.map((u) => u.username).join(", ")}`);
  }
} else if (users.length === 1) {
  compte = users[0];
} else {
  sortir(
    "Plusieurs comptes existent, précise lequel :\n" +
      users.map((u) => `  node tools/motdepasse.js ${u.username}`).join("\n"),
  );
}

const motDePasse = process.argv[3] ?? crypto.randomBytes(9).toString("base64url");
if (motDePasse.length < 6) sortir("Mot de passe trop court (6 caractères minimum).");

// Même dérivation que server/store.js : sel aléatoire, scrypt, format « sel:empreinte ».
const sel = crypto.randomBytes(16).toString("hex");
const empreinte = crypto.scryptSync(motDePasse, sel, 64).toString("hex");

compte.passwordHash = `${sel}:${empreinte}`;
store.secret = crypto.randomBytes(32).toString("hex");

// Écriture atomique, comme le serveur : un fichier de comptes à moitié écrit interdirait
// toute connexion.
const tmp = `${USERS_FILE}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf-8");
fs.renameSync(tmp, USERS_FILE);

console.log(`Compte « ${compte.username} » : nouveau mot de passe`);
console.log(`  ${motDePasse}`);
console.log("Les sessions ouvertes ont été fermées. Redémarre le conteneur pour en tenir compte :");
console.log("  docker compose restart");
