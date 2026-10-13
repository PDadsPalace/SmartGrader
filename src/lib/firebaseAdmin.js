// Server-only Firestore access for SmartGrader's usage + billing records.
// Needs the FIREBASE_SERVICE_ACCOUNT env var on Vercel: the service-account JSON
// from Firebase console → Project settings → Service accounts → Generate new private key.
// (Paste the whole JSON, or a base64 copy of it.)
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let db = null;

function readServiceAccount() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) return null;
    const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(text);
}

export function isFirestoreConfigured() {
    return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
}

export function getDb() {
    if (db) return db;
    const account = readServiceAccount();
    if (!account) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
    const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(account) });
    db = getFirestore(app);
    return db;
}
