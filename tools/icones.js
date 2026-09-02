#!/usr/bin/env node
/**
 * Fabrique les PNG d'installation à partir de public/favicon.svg.
 * Copyright (C) 2026 fuzzinvaders
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 *   node tools/icones.js
 *
 * Le SVG est la source ; les PNG n'existent que parce que le manifeste et iOS les
 * réclament. Les refaire après avoir touché au dessin.
 *
 * Le rendu passe par le navigateur déjà installé sur la machine, en mode sans
 * fenêtre : une dépendance de plus pour dessiner trois carrés ne se justifie pas.
 */
"use strict";

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(__dirname, "..");
const PUBLIC = path.join(RACINE, "public");
const SVG = path.join(PUBLIC, "favicon.svg");

const CANDIDATS = [
  process.env.NAVIGATEUR,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean);

/* apple-touch-icon.png est réclamé par iOS, les deux autres par le manifeste. */
const SORTIES = [
  { taille: 180, nom: "apple-touch-icon.png" },
  { taille: 192, nom: "pwa-192x192.png" },
  { taille: 512, nom: "pwa-512x512.png" },
];

const navigateur = CANDIDATS.find((c) => fs.existsSync(c));
if (!navigateur) {
  console.error("Aucun navigateur trouvé. NAVIGATEUR=… pour l'indiquer.");
  process.exit(1);
}
if (!fs.existsSync(SVG)) {
  console.error("public/favicon.svg est introuvable.");
  process.exit(1);
}

const svg = fs.readFileSync(SVG, "utf8");
let rates = 0;

for (const { taille, nom } of SORTIES) {
  /* Une page sans marge, à la taille exacte : la capture est le PNG voulu. */
  const html =
    '<meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}' +
    `svg{display:block;width:${taille}px;height:${taille}px}</style>${svg}`;
  const page = path.join(os.tmpdir(), `gestock-icone-${taille}.html`);
  fs.writeFileSync(page, html, "utf8");

  const sortie = path.join(PUBLIC, nom);
  try {
    execFileSync(
      navigateur,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--default-background-color=00000000" /* fond transparent, pas blanc */,
        `--window-size=${taille},${taille}`,
        `--screenshot=${sortie}`,
        `file:///${page.replace(/\\/g, "/")}`,
      ],
      { stdio: "pipe", timeout: 60000 },
    );
  } catch {
    /* ces navigateurs parlent sur stderr même quand tout va bien */
  }

  if (!fs.existsSync(sortie)) {
    rates++;
    console.log(`  ÉCHEC     ${nom}`);
    continue;
  }
  console.log(`  ${String(fs.statSync(sortie).size).padStart(6)} o  ${nom}`);
}

process.exit(rates ? 1 : 0);
