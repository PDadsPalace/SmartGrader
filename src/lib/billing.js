// Server-side billing helpers: settings, usage rows, payment records.
import { getDb } from "./firebaseAdmin";
import { computeBills, addMonths, monthKey, previousMonths, ADJUSTMENT_TYPES, adjustmentApplies, describeAdjustment, withCardFee, STRIPE_MINIMUM } from "./pricing";

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
    const [usageSnap, paySnap, settings, adjustments] = await Promise.all([
        db.collection("usage").doc(month).collection("users").get(),
        db.collection("payments").where("month", "==", month).get(),
        getSettings(),
        getAdjustments(),
    ]);
    const rows = usageSnap.docs.map((d) => d.data());
    const payments = {};
    paySnap.docs.forEach((d) => { payments[d.data().email] = d.data(); });
    return { month, settings, ...computeBills(rows, settings, payments, adjustments, month) };
}

export async function setPayment(month, email, data) {
    const ref = getDb().collection("payments").doc(paymentId(month, email));
    if (data === null) return ref.delete();
    return ref.set({ month, email: email.toLowerCase(), updatedAt: new Date().toISOString(), ...data }, { merge: true });
}

// ─── Adjustments (per-teacher discounts / extra charges) ───────────────────────

const MONTH_RE = /^\d{4}-\d{2}$/;
const cleanEmail = (e) => String(e || "").trim().toLowerCase();

export async function getAdjustments() {
    const snap = await getDb().collection("adjustments").get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Validates and normalises an adjustment from the admin form or a coupon.
export function cleanAdjustment(input) {
    const type = String(input.type || "");
    if (!ADJUSTMENT_TYPES[type]) throw new Error("Pick an adjustment type.");
    const email = cleanEmail(input.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter the teacher's email.");
    const startMonth = MONTH_RE.test(input.startMonth || "") ? input.startMonth : monthKey();
    let endMonth = null;
    if (input.endMonth && MONTH_RE.test(input.endMonth)) endMonth = input.endMonth;
    if (endMonth && endMonth < startMonth) throw new Error("End month is before start month.");
    const out = {
        email, type, startMonth, endMonth,
        note: String(input.note || "").slice(0, 120).trim(),
        source: input.source === "coupon" ? "coupon" : "admin",
        code: input.code ? String(input.code).toUpperCase() : null,
        createdAt: new Date().toISOString(),
    };
    if (type === "amountOff" || type === "charge") {
        out.amount = Math.round(Math.max(0, Number(input.amount) || 0) * 100) / 100;
        if (!out.amount) throw new Error("Enter a dollar amount.");
    }
    if (type === "percentOff") {
        out.percent = Math.min(100, Math.max(0, Math.round(Number(input.percent) || 0)));
        if (!out.percent) throw new Error("Enter a percent.");
    }
    return out;
}

export async function addAdjustment(input) {
    const adj = cleanAdjustment(input);
    const ref = await getDb().collection("adjustments").add(adj);
    return { id: ref.id, ...adj };
}

export const deleteAdjustment = (id) => getDb().collection("adjustments").doc(String(id)).delete();

// ─── Coupon codes ──────────────────────────────────────────────────────────────
// coupons/{CODE}: { code, type, amount, percent, months (0 = every month), maxUses (0 = unlimited),
//                   uses, expires ("YYYY-MM-DD" or ""), active, note, redeemedBy: [emails] }

const COUPON_TYPES = ["amountOff", "percentOff", "waiveBase", "comp"];
export const cleanCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);

export async function getCoupons() {
    const snap = await getDb().collection("coupons").get();
    return snap.docs.map((d) => d.data()).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function saveCoupon(input) {
    const code = cleanCode(input.code);
    if (code.length < 3) throw new Error("Coupon code needs at least 3 letters or numbers.");
    if (!COUPON_TYPES.includes(input.type)) throw new Error("Pick what the coupon does.");
    const ref = getDb().collection("coupons").doc(code);
    const existing = await ref.get();
    const c = {
        code,
        type: input.type,
        months: Math.max(0, Math.min(24, Math.round(Number(input.months) || 0))),
        maxUses: Math.max(0, Math.round(Number(input.maxUses) || 0)),
        expires: /^\d{4}-\d{2}-\d{2}$/.test(input.expires || "") ? input.expires : "",
        active: input.active !== false,
        note: String(input.note || "").slice(0, 120).trim(),
        uses: existing.exists ? existing.data().uses || 0 : 0,
        redeemedBy: existing.exists ? existing.data().redeemedBy || [] : [],
        createdAt: existing.exists ? existing.data().createdAt : new Date().toISOString(),
    };
    if (c.type === "amountOff") {
        c.amount = Math.round(Math.max(0, Number(input.amount) || 0) * 100) / 100;
        if (!c.amount) throw new Error("Enter a dollar amount.");
    }
    if (c.type === "percentOff") {
        c.percent = Math.min(100, Math.max(0, Math.round(Number(input.percent) || 0)));
        if (!c.percent) throw new Error("Enter a percent.");
    }
    await ref.set(c);
    return c;
}

export const deleteCoupon = (code) => getDb().collection("coupons").doc(cleanCode(code)).delete();

const todayNJ = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

// A teacher types a code on My Bill. Creates an adjustment starting this month.
export async function redeemCoupon(email, rawCode) {
    const code = cleanCode(rawCode);
    const who = cleanEmail(email);
    const db = getDb();
    const ref = db.collection("coupons").doc(code);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!code || !snap.exists) throw new Error("That code isn't valid.");
        const c = snap.data();
        if (!c.active) throw new Error("That code isn't active any more.");
        if (c.expires && todayNJ() > c.expires) throw new Error("That code has expired.");
        if (c.maxUses && (c.uses || 0) >= c.maxUses) throw new Error("That code has been used up.");
        if ((c.redeemedBy || []).includes(who)) throw new Error("You've already used this code.");
        const start = monthKey();
        const adj = cleanAdjustment({
            email: who, type: c.type, amount: c.amount, percent: c.percent,
            startMonth: start, endMonth: c.months ? addMonths(start, c.months - 1) : null,
            note: c.note, source: "coupon", code,
        });
        tx.set(db.collection("adjustments").doc(), adj);
        tx.update(ref, { uses: (c.uses || 0) + 1, redeemedBy: [...(c.redeemedBy || []), who] });
        return adj;
    });
}

// ─── Teachers seen using the app (for the admin's pick list) ──────────────────

export async function knownTeachers(months = 6) {
    const db = getDb();
    const snaps = await Promise.all(previousMonths(months).map((m) => db.collection("usage").doc(m).collection("users").get()));
    const set = new Set();
    snaps.forEach((s) => s.docs.forEach((d) => set.add(d.id)));
    return [...set].sort();
}

// ─── Reminder pop-up state ───────────────────────────────────────────────────

export async function getReminderState(email) {
    const snap = await getDb().collection("reminders").doc(cleanEmail(email)).get();
    return snap.exists ? snap.data() : {};
}

export const dismissReminder = (email) =>
    getDb().collection("reminders").doc(cleanEmail(email)).set({ lastDismissedAt: new Date().toISOString() }, { merge: true });

// ─── One teacher's bills (My Bill page + reminder pop-up) ─────────────────────

export async function getMyBills(rawEmail, monthsBack = 7) {
    const email = cleanEmail(rawEmail);
    const current = monthKey();
    const results = await Promise.all(previousMonths(monthsBack, current).map(getMonth));
    const settings = results[0].settings;
    const bills = results.map((r) => {
        const bill = r.bills.find((b) => b.email === email);
        if (!bill) return null;
        const cardAmount = settings.passCardFeeToPayer && bill.total > 0 ? withCardFee(bill.total) : bill.total;
        return {
            month: r.month,
            isCurrent: r.month === current,
            calls: bill.calls,
            aiCost: bill.aiCost,
            baseFee: bill.baseFee,
            subtotal: bill.subtotal,
            adjustments: bill.adjustments.map(({ label, amount, note }) => ({ label, amount, note })),
            total: bill.total,
            cardAmount,
            canPayByCard: bill.total >= STRIPE_MINIMUM && Boolean(process.env.STRIPE_SECRET_KEY),
            payment: bill.payment,
            isOwner: bill.isOwner,
        };
    }).filter(Boolean);
    const all = await getAdjustments();
    const discounts = all
        .filter((a) => a.email === email && a.type !== "charge" && (!a.endMonth || a.endMonth >= current))
        .map((a) => ({
            label: describeAdjustment(a),
            from: a.startMonth,
            until: a.endMonth,
            activeNow: adjustmentApplies(a, current),
            note: a.note,
        }));
    return { email, current, settings, bills, discounts };
}
