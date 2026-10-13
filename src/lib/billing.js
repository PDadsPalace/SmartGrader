// Server-side billing helpers: settings, usage rows, payment records.
import { getDb } from "./firebaseAdmin";
import { computeBills } from "./pricing";

export const DEFAULT_SETTINGS = {
    baseFee: 6.5,                // charged to each friend in any month they use the app
    fixedCosts: [                // what the owner pays — shown for tracking only, not billed directly
        { name: "Vercel", monthly: 20 },
        { name: "GitHub", monthly: 0 },
    ],
    passCardFeeToPayer: true,    // card payers cover Stripe's 2.9% + 30¢
    venmoUsername: "Danielle-Panfili-1",
};

export function adminEmails() {
    return (process.env.BILLING_ADMIN_EMAILS || "ppanfili@htsdnj.org,phillypan@gmail.com")
        .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export const isAdmin = (email) => Boolean(email) && adminEmails().includes(email.toLowerCase());

export async function getSettings() {
    const snap = await getDb().collection("settings").doc("billing").get();
    return { ...DEFAULT_SETTINGS, ...(snap.exists ? snap.data() : {}), ownerEmails: adminEmails() };
}

export async function saveSettings(input) {
    const clean = {
        fixedCosts: (input.fixedCosts || [])
            .map((c) => ({ name: String(c.name || "").slice(0, 40).trim(), monthly: Math.max(0, Number(c.monthly) || 0) }))
            .filter((c) => c.name),
        baseFee: Math.round(Math.max(0, Number(input.baseFee) || 0) * 100) / 100,
        passCardFeeToPayer: input.passCardFeeToPayer !== false,
        venmoUsername: String(input.venmoUsername || "").replace(/^@/, "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30),
    };
    await getDb().collection("settings").doc("billing").set(clean);
    return clean;
}

const paymentId = (month, email) => `${month}_${email.toLowerCase()}`;

export async function getMonth(month) {
    const db = getDb();
    const [usageSnap, paySnap, settings] = await Promise.all([
        db.collection("usage").doc(month).collection("users").get(),
        db.collection("payments").where("month", "==", month).get(),
        getSettings(),
    ]);
    const rows = usageSnap.docs.map((d) => d.data());
    const payments = {};
    paySnap.docs.forEach((d) => { payments[d.data().email] = d.data(); });
    return { month, settings, ...computeBills(rows, settings, payments) };
}

export async function setPayment(month, email, data) {
    const ref = getDb().collection("payments").doc(paymentId(month, email));
    if (data === null) return ref.delete();
    return ref.set({ month, email: email.toLowerCase(), updatedAt: new Date().toISOString(), ...data }, { merge: true });
}
