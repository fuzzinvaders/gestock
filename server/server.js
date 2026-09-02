#!/usr/bin/env node
"use strict";

/**
 * Gestock — serveur auto-hébergé, sans dépendance.
 * Copyright (C) 2026 fuzzinvaders
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Statique   : dist/ (build Vite), avec repli SPA vers index.html.
 * Comptes    : GET /api/session, POST /api/setup (une seule fois), POST /api/register
 *              (sur invitation), POST /api/login, /api/logout, /api/password
 * Foyer      : GET /api/invites, POST /api/invites, POST /api/invites/revoke,
 *              POST /api/users/delete — réservés à l'administrateur
 * Inventaire : GET /api/data, GET /api/export, POST/PATCH/DELETE /api/places(/:id),
 *              /api/products(/:id), /api/lots(/:id), POST /api/lots/:id/consume
 * Codes-barres : GET /api/lookup?ean=…
 * Santé      : GET /healthz — jamais protégé (utilisé par le HEALTHCHECK Docker)
 *
 * Environnement : PORT, HOST, DATA_DIR, AUTH_SECRET, ORIGIN, OFF_BASE_URL, OFF_USER_AGENT
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "./store.js";
import {
  consumeLot,
  defaultPlaces,
  deleteLot,
  deletePlace,
  deleteProduct,
  upsertLot,
  upsertPlace,
  upsertProduct,
} from "./inventaire.js";
import { lookup } from "./openfoodfacts.js";
import { validateBody, validateEan, validateId } from "./validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DIST_DIR = path.join(__dirname, "..", "dist");
// Non défini par défaut : le serveur ne peut pas deviner de façon fiable l'origine vue par le
// navigateur (port hôte différent du port interne avec Docker, proxy de dev Vite sur un autre
// port, etc.). Ne renseigner ORIGIN que pour un déploiement derrière un reverse proxy — la
// vérification anti-CSRF ci-dessous s'active alors automatiquement.
const CONFIGURED_ORIGIN = process.env.ORIGIN || null;
const COOKIE_NAME = "gestock_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 jours
const MAX_BODY_BYTES = 200_000;

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
};

// ---- Utilitaires requête/réponse ----

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return cookies;
}

function setSessionCookie(res, userId) {
  const token = store.signSession(userId, store.getSessionSecret(), MAX_AGE_SEC);
  const secure = Boolean(CONFIGURED_ORIGIN && CONFIGURED_ORIGIN.startsWith("https://"));
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SEC}`,
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const uid = store.verifySession(token, store.getSessionSecret());
  if (!uid) return null;
  const user = store.findById(uid);
  return user ? store.toSafeUser(user) : null;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

// Protection CSRF minimale, active seulement si ORIGIN est configuré (déploiement derrière un
// reverse proxy) : sur une requête d'écriture porteuse d'un en-tête Origin, celui-ci doit alors
// correspondre. Sans ORIGIN configuré, le contrôle est désactivé — le cookie de session
// (HttpOnly + SameSite=Lax) reste la protection de base en local/dev.
function originIsAllowed(req) {
  if (!CONFIGURED_ORIGIN) return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === CONFIGURED_ORIGIN;
}

// Freine les tentatives de connexion en rafale. Volontairement en mémoire : remis à zéro au
// redémarrage, ce qui suffit pour une instance familiale et évite d'écrire sur le disque à
// chaque échec. Derrière un reverse proxy, X-Forwarded-For porte l'IP réelle du visiteur.
const loginAttempts = new Map();

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "inconnu";
}

function loginIsThrottled(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordLoginFailure(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, first: Date.now() });
    return;
  }
  entry.count += 1;
}

// ---- Fichiers statiques (build Vite) avec repli SPA ----

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  let filePath = path.join(DIST_DIR, urlPath === "/" ? "index.html" : urlPath);

  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(400);
    res.end();
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, "index.html");
  }

  const ext = path.extname(filePath);
  const servedPath = filePath;
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      // Longueur explicite plutôt qu'un envoi par morceaux : l'enregistrement d'un service
      // worker est plus exigeant que le chargement d'une page ordinaire sur la forme de la
      // réponse, et c'est le fichier dont dépend l'installation de la PWA.
      "content-length": data.length,
      "cache-control": cacheControlFor(servedPath),
    });
    res.end(data);
  });
}

function cacheControlFor(filePath) {
  const name = path.basename(filePath);
  // Le service worker et la page d'entrée doivent être revalidés à chaque fois, sinon une
  // nouvelle version reste invisible tant que le cache du navigateur n'a pas expiré.
  if (name === "sw.js" || name === "index.html" || name === "manifest.webmanifest") {
    return "no-cache";
  }
  // Le reste du build porte une empreinte dans son nom : le contenu ne change jamais.
  if (filePath.startsWith(path.join(DIST_DIR, "assets"))) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600";
}

// ---- Routes API ----

/* Toutes les écritures d'inventaire suivent la même chorégraphie : valider, muter,
   sauvegarder, renvoyer l'inventaire entier. Renvoyer le tout plutôt que la seule
   ligne touchée coûte quelques kilo-octets et évite qu'un téléphone garde un état
   décalé quand quelqu'un d'autre range les courses en même temps. */
function applyInventory(res, mutate) {
  const result = store.updateInventory(mutate);
  if (result.ok === false) return sendJson(res, 400, { error: result.error });
  // « entity » est la ligne qui vient d'être touchée : l'écran d'ajout en a besoin
  // tout de suite, pour enchaîner sur le lot sans rechercher le produit qu'il
  // vient lui-même de créer.
  const entity = result.place ?? result.product ?? result.lot ?? null;
  return sendJson(res, 200, { ...store.readInventory(), entity });
}

function segments(pathname) {
  return pathname.split("/").filter(Boolean);
}

async function handleApi(req, res, pathname) {
  if (req.method !== "GET" && !originIsAllowed(req)) {
    return sendJson(res, 403, { error: "Origine non autorisée" });
  }

  if (pathname === "/api/session" && req.method === "GET") {
    const user = getSessionUser(req);
    return sendJson(res, 200, { user, needsSetup: store.userCount() === 0 });
  }

  if (pathname === "/api/setup" && req.method === "POST") {
    if (store.userCount() > 0) return sendJson(res, 409, { error: "Un compte existe déjà." });
    const body = await readJsonBody(req);
    const result = store.createFirstUser(String(body.username || ""), String(body.password || ""));
    if (!result.ok) return sendJson(res, 400, { error: result.error });
    // Le premier compte inaugure aussi la maison : trois réserves plausibles valent
    // mieux qu'un écran vide dont on ne sait pas par quel bout le prendre.
    store.updateInventory((data) => {
      if (data.places.length === 0) data.places = defaultPlaces();
    });
    setSessionCookie(res, result.user.id);
    return sendJson(res, 200, { user: result.user });
  }

  if (pathname === "/api/register" && req.method === "POST") {
    const ip = clientIp(req);
    // Le même frein que la connexion : le code d'invitation est court, il ne doit
    // pas pouvoir être deviné par répétition.
    if (loginIsThrottled(ip)) {
      return sendJson(res, 429, { error: "Trop de tentatives. Réessayez dans quelques minutes." });
    }
    const body = await readJsonBody(req);
    const result = store.registerWithInvite(
      String(body.username || ""),
      String(body.password || ""),
      String(body.code || ""),
    );
    if (!result.ok) {
      recordLoginFailure(ip);
      return sendJson(res, 400, { error: result.error });
    }
    loginAttempts.delete(ip);
    setSessionCookie(res, result.user.id);
    return sendJson(res, 200, { user: result.user });
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const ip = clientIp(req);
    if (loginIsThrottled(ip)) {
      return sendJson(res, 429, {
        error: "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
      });
    }
    const body = await readJsonBody(req);
    const user = store.authenticate(String(body.username || ""), String(body.password || ""));
    if (!user) {
      recordLoginFailure(ip);
      return sendJson(res, 401, { error: "Identifiant ou mot de passe incorrect." });
    }
    loginAttempts.delete(ip);
    setSessionCookie(res, user.id);
    return sendJson(res, 200, { user: store.toSafeUser(user) });
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  // Tout ce qui suit exige une session valide.
  const user = getSessionUser(req);
  if (!user) return sendJson(res, 401, { error: "Non authentifié" });

  if (pathname === "/api/password" && req.method === "POST") {
    const body = await readJsonBody(req);
    if (!store.verifyPasswordForUser(user.id, String(body.currentPassword || ""))) {
      return sendJson(res, 403, { error: "Mot de passe actuel incorrect." });
    }
    const result = store.updatePassword(user.id, String(body.newPassword || ""));
    if (!result.ok) return sendJson(res, 400, { error: result.error });
    return sendJson(res, 200, { ok: true });
  }

  // ---- Le foyer ----

  if (pathname === "/api/users" && req.method === "GET") {
    return sendJson(res, 200, { users: store.listUsers() });
  }

  if (pathname === "/api/invites" || pathname === "/api/invites/revoke" || pathname === "/api/users/delete") {
    if (!user.admin) return sendJson(res, 403, { error: "Réservé à l'administrateur." });

    if (pathname === "/api/invites" && req.method === "GET") {
      return sendJson(res, 200, { invites: store.listInvites() });
    }
    if (pathname === "/api/invites" && req.method === "POST") {
      const result = store.createInvite();
      if (!result.ok) return sendJson(res, 400, { error: result.error });
      return sendJson(res, 200, { invite: result.invite, invites: store.listInvites() });
    }
    if (pathname === "/api/invites/revoke" && req.method === "POST") {
      const body = await readJsonBody(req);
      const result = store.revokeInvite(String(body.code || ""));
      if (!result.ok) return sendJson(res, 404, { error: result.error });
      return sendJson(res, 200, { invites: store.listInvites() });
    }
    if (pathname === "/api/users/delete" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (String(body.id) === user.id) {
        return sendJson(res, 400, { error: "On ne supprime pas son propre compte." });
      }
      const result = store.deleteUser(String(body.id || ""));
      if (!result.ok) return sendJson(res, 400, { error: result.error });
      return sendJson(res, 200, { users: store.listUsers() });
    }
  }

  // ---- Inventaire ----

  if (pathname === "/api/data" && req.method === "GET") {
    return sendJson(res, 200, { ...store.readInventory(), users: store.listUsers() });
  }

  if (pathname === "/api/export" && req.method === "GET") {
    const payload = JSON.stringify(
      { version: 1, exportedAt: new Date().toISOString(), ...store.readInventory() },
      null,
      2,
    );
    const name = `gestock-${new Date().toISOString().slice(0, 10)}.json`;
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "content-length": Buffer.byteLength(payload),
    });
    return res.end(payload);
  }

  if (pathname === "/api/lookup" && req.method === "GET") {
    const ean = validateEan(new URL(req.url, "http://x").searchParams.get("ean"));
    if (!ean.ok) return sendJson(res, 400, { error: ean.error });
    if (!ean.value) return sendJson(res, 400, { error: "Code-barres manquant." });
    // Un produit déjà connu de la maison passe avant la base publique : c'est le
    // nom que le foyer lui donne, et il arrive sans attendre le réseau.
    const known = store.readInventory().products.find((p) => p.ean === ean.value);
    if (known) return sendJson(res, 200, { found: true, source: "gestock", product: known });
    const result = await lookup(ean.value);
    return sendJson(res, 200, result);
  }

  const parts = segments(pathname); // ["api", collection, id?, action?]
  const collection = parts[1];
  const rawId = parts[2];

  const collections = {
    places: { upsert: upsertPlace, remove: deletePlace },
    products: { upsert: upsertProduct, remove: deleteProduct },
    lots: { upsert: upsertLot, remove: deleteLot },
  };

  if (parts[0] === "api" && collections[collection]) {
    const { upsert, remove } = collections[collection];

    if (!rawId && req.method === "POST") {
      const body = validateBody(await readJsonBody(req));
      if (!body.ok) return sendJson(res, 400, { error: body.error });
      return applyInventory(res, (data) => upsert(data, null, body.value, user.username));
    }

    if (rawId) {
      const id = validateId(rawId, "L'identifiant");
      if (!id.ok) return sendJson(res, 400, { error: id.error });

      if (req.method === "PATCH" && !parts[3]) {
        const body = validateBody(await readJsonBody(req));
        if (!body.ok) return sendJson(res, 400, { error: body.error });
        return applyInventory(res, (data) => upsert(data, id.value, body.value, user.username));
      }

      if (req.method === "DELETE" && !parts[3]) {
        return applyInventory(res, (data) => remove(data, id.value));
      }

      if (collection === "lots" && parts[3] === "consume" && req.method === "POST") {
        const body = await readJsonBody(req);
        return applyInventory(res, (data) =>
          consumeLot(data, id.value, body.quantity, user.username),
        );
      }
    }
  }

  return sendJson(res, 404, { error: "Route inconnue" });
}

// ---- Serveur ----

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://x").pathname;

  if (pathname === "/healthz") {
    return sendJson(res, 200, { ok: true });
  }

  if (pathname.startsWith("/api/")) {
    handleApi(req, res, pathname).catch((err) => {
      const tooBig = err?.message === "payload too large";
      const badJson = err?.message === "invalid json";
      if (!tooBig && !badJson) console.error("api", pathname, err);
      sendJson(res, tooBig ? 413 : badJson ? 400 : 500, {
        error: tooBig ? "Requête trop volumineuse." : badJson ? "JSON invalide." : "Erreur serveur.",
      });
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    return res.end();
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Gestock écoute sur http://${HOST}:${PORT} (données : ${store.DATA_DIR})`);
  if (!fs.existsSync(DIST_DIR)) {
    console.log("dist/ absent : lancez `npm run build`, ou `npm run dev` pour le serveur Vite.");
  }
});
