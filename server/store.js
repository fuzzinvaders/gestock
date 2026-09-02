"use strict";

/**
 * Persistance en fichiers JSON sous DATA_DIR (volume Docker), sans base de données.
 * Écriture atomique : fichier .tmp puis rename, pour ne jamais laisser un fichier
 * à moitié écrit si le process est interrompu pendant une sauvegarde.
 *
 * Deux fichiers seulement :
 *   users.json      — les comptes du foyer, le secret de session, les invitations
 *   inventaire.json — l'inventaire, commun à tout le monde
 *
 * L'inventaire n'est pas rangé par compte, contrairement à Cadence : un congélateur
 * est un objet partagé. Chaque lot garde le nom de qui l'a posé là, ce qui suffit à
 * retrouver l'auteur d'une ligne sans cloisonner les données.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", ".data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const INVENTORY_FILE = path.join(DATA_DIR, "inventaire.json");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function atomicWrite(file, contents) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, contents, "utf-8");
  fs.renameSync(tmp, file);
}

// ---- Mots de passe (scrypt, zéro dépendance) ----

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// ---- Jeton de session : HMAC sans état, `<payload base64url>.<hmac>` ----

function base64url(input) {
  return Buffer.from(input, "utf-8").toString("base64url");
}

function fromBase64url(input) {
  return Buffer.from(input, "base64url").toString("utf-8");
}

function signValue(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function signSession(userId, secret, maxAgeSec) {
  const payload = base64url(JSON.stringify({ uid: userId, exp: Date.now() + maxAgeSec * 1000 }));
  return `${payload}.${signValue(payload, secret)}`;
}

function verifySession(token, secret) {
  const [payload, mac] = String(token).split(".");
  if (!payload || !mac) return null;
  const expected = signValue(payload, secret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(fromBase64url(payload));
    if (typeof uid !== "string" || typeof exp !== "number" || Date.now() > exp) return null;
    return uid;
  } catch {
    return null;
  }
}

// ---- Comptes ----

function readUsersStore() {
  if (!fs.existsSync(USERS_FILE)) return { users: [], invites: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    // Les champs sont relus nommément, mais TOUS ceux qui sont persistés doivent y figurer :
    // writeUsersStore réécrit le fichier à partir de ce qui est lu, si bien qu'un champ oublié
    // ici est effacé au premier enregistrement suivant.
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      invites: Array.isArray(parsed.invites) ? parsed.invites : [],
      secret: parsed.secret,
    };
  } catch {
    return { users: [], invites: [] };
  }
}

function writeUsersStore(store) {
  atomicWrite(USERS_FILE, JSON.stringify(store, null, 2));
}

function toSafeUser(u) {
  return { id: u.id, username: u.username, admin: Boolean(u.admin), createdAt: u.createdAt };
}

function userCount() {
  return readUsersStore().users.length;
}

function listUsers() {
  return readUsersStore().users.map(toSafeUser);
}

function findByUsername(username) {
  const needle = String(username).trim().toLowerCase();
  return readUsersStore().users.find((u) => u.username.toLowerCase() === needle);
}

function findById(id) {
  return readUsersStore().users.find((u) => u.id === id);
}

function checkCredentials(username, password) {
  const name = String(username).trim();
  if (name.length < 2) return "Identifiant trop court (2 caractères min).";
  if (name.length > 40) return "Identifiant trop long (40 caractères max).";
  if (String(password).length < 6) return "Mot de passe trop court (6 caractères min).";
  return null;
}

/* Le premier compte est celui qui installe : il est administrateur, et c'est lui
   qui distribue les invitations au reste du foyer. Passé ce cap, /setup se ferme. */
function createFirstUser(username, password) {
  const problem = checkCredentials(username, password);
  if (problem) return { ok: false, error: problem };
  const store = readUsersStore();
  if (store.users.length > 0) return { ok: false, error: "Un compte existe déjà." };
  const user = {
    id: crypto.randomUUID(),
    username: String(username).trim(),
    passwordHash: hashPassword(password),
    admin: true,
    createdAt: new Date().toISOString(),
  };
  store.users.push(user);
  writeUsersStore(store);
  return { ok: true, user: toSafeUser(user) };
}

function authenticate(username, password) {
  const user = findByUsername(username);
  if (!user) return null;
  return verifyPassword(password, user.passwordHash) ? user : null;
}

function verifyPasswordForUser(id, password) {
  const user = findById(id);
  if (!user) return false;
  return verifyPassword(password, user.passwordHash);
}

function updatePassword(id, newPassword) {
  if (String(newPassword).length < 6) {
    return { ok: false, error: "Mot de passe trop court (6 caractères min)." };
  }
  const store = readUsersStore();
  const idx = store.users.findIndex((u) => u.id === id);
  if (idx === -1) return { ok: false, error: "Utilisateur introuvable." };
  store.users[idx] = { ...store.users[idx], passwordHash: hashPassword(newPassword) };
  writeUsersStore(store);
  return { ok: true };
}

function deleteUser(id) {
  const store = readUsersStore();
  const user = store.users.find((u) => u.id === id);
  if (!user) return { ok: false, error: "Compte introuvable." };
  if (user.admin) return { ok: false, error: "Le compte administrateur ne peut pas être supprimé." };
  store.users = store.users.filter((u) => u.id !== id);
  writeUsersStore(store);
  return { ok: true };
}

// ---- Invitations ----

const INVITE_DAYS = 7;
const INVITE_MAX = 20;

/* Un code lisible à voix haute : on le dicte plus souvent qu'on ne le copie.
   Ni O ni 0, ni I ni 1 — les paires qui se confondent à l'oral comme à l'écrit. */
const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newInviteCode() {
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (const b of bytes) code += INVITE_ALPHABET[b % INVITE_ALPHABET.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function listInvites() {
  const now = Date.now();
  return readUsersStore()
    .invites.filter((i) => !i.usedBy && Date.parse(i.expiresAt) > now)
    .map((i) => ({ code: i.code, createdAt: i.createdAt, expiresAt: i.expiresAt }));
}

function createInvite() {
  const store = readUsersStore();
  const now = Date.now();
  // Le ménage se fait à la création plutôt que par une tâche de fond : un code
  // périmé ou consommé n'a plus rien à dire, et personne ne va le relire.
  store.invites = store.invites.filter((i) => !i.usedBy && Date.parse(i.expiresAt) > now);
  if (store.invites.length >= INVITE_MAX) {
    return { ok: false, error: `Trop d'invitations en attente (${INVITE_MAX} max).` };
  }
  const invite = {
    code: newInviteCode(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(now + INVITE_DAYS * 86400000).toISOString(),
    usedBy: null,
  };
  store.invites.push(invite);
  writeUsersStore(store);
  return {
    ok: true,
    invite: { code: invite.code, createdAt: invite.createdAt, expiresAt: invite.expiresAt },
  };
}

function revokeInvite(code) {
  const store = readUsersStore();
  const before = store.invites.length;
  store.invites = store.invites.filter((i) => i.code !== code);
  if (store.invites.length === before) return { ok: false, error: "Invitation introuvable." };
  writeUsersStore(store);
  return { ok: true };
}

/* Inscription par invitation : le code est vérifié et consommé dans la même
   écriture que la création du compte, pour qu'il ne puisse pas servir deux fois. */
function registerWithInvite(username, password, code) {
  const problem = checkCredentials(username, password);
  if (problem) return { ok: false, error: problem };
  const store = readUsersStore();
  if (store.users.length === 0) return { ok: false, error: "Aucun compte n'existe encore." };
  const wanted = String(code).trim().toUpperCase();
  const invite = store.invites.find((i) => i.code === wanted && !i.usedBy);
  if (!invite) return { ok: false, error: "Code d'invitation invalide ou déjà utilisé." };
  if (Date.parse(invite.expiresAt) <= Date.now()) {
    return { ok: false, error: "Code d'invitation expiré." };
  }
  const name = String(username).trim();
  if (store.users.some((u) => u.username.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: "Cet identifiant est déjà pris." };
  }
  const user = {
    id: crypto.randomUUID(),
    username: name,
    passwordHash: hashPassword(password),
    admin: false,
    createdAt: new Date().toISOString(),
  };
  invite.usedBy = user.id;
  store.users.push(user);
  writeUsersStore(store);
  return { ok: true, user: toSafeUser(user) };
}

// ---- Secret de session ----

let cachedSecret = null;

function getSessionSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (cachedSecret) return cachedSecret;
  const store = readUsersStore();
  if (store.secret) {
    cachedSecret = store.secret;
    return cachedSecret;
  }
  const secret = crypto.randomBytes(32).toString("hex");
  writeUsersStore({ ...store, secret });
  cachedSecret = secret;
  return secret;
}

// ---- Inventaire (commun au foyer) ----

/* Trois listes plutôt qu'une : un produit (le pot de miel en général) n'est pas
   un lot (CE pot-là, rangé le 3 mars au deuxième étage du placard). Séparer les
   deux évite de ressaisir le code-barres à chaque course, et permet de compter le
   stock d'un produit toutes réserves confondues. */
function emptyInventory() {
  return { places: [], products: [], lots: [], links: [] };
}

function readInventory() {
  if (!fs.existsSync(INVENTORY_FILE)) return emptyInventory();
  try {
    const parsed = JSON.parse(fs.readFileSync(INVENTORY_FILE, "utf-8"));
    return {
      places: Array.isArray(parsed.places) ? parsed.places : [],
      products: Array.isArray(parsed.products) ? parsed.products : [],
      lots: Array.isArray(parsed.lots) ? parsed.lots : [],
      // Correspondances entre les aliments de Mealie et les produits du foyer.
      // Absentes tant que personne n'a branché de carnet de recettes.
      links: Array.isArray(parsed.links) ? parsed.links : [],
    };
  } catch {
    return emptyInventory();
  }
}

function writeInventory(data) {
  atomicWrite(INVENTORY_FILE, JSON.stringify(data, null, 2));
}

/* Les écritures passent toutes par ici : lecture, modification, sauvegarde d'un
   seul tenant. Aucun await ne sépare la lecture de l'écriture, donc deux
   téléphones qui rangent les courses en même temps ne peuvent pas s'écraser. */
function updateInventory(mutate) {
  const data = readInventory();
  const result = mutate(data);
  if (result && result.ok === false) return result;
  writeInventory(data);
  return result ?? { ok: true };
}

export {
  DATA_DIR,
  userCount,
  listUsers,
  findByUsername,
  findById,
  toSafeUser,
  createFirstUser,
  registerWithInvite,
  authenticate,
  verifyPasswordForUser,
  updatePassword,
  deleteUser,
  listInvites,
  createInvite,
  revokeInvite,
  getSessionSecret,
  signSession,
  verifySession,
  emptyInventory,
  readInventory,
  writeInventory,
  updateInventory,
};
