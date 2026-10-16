// Pure cost math — no server imports, so it can be tested on its own.

// Gemini API paid-tier prices, US dollars per 1 million tokens.
// Check https://ai.google.dev/gemini-api/docs/pricing and update if Google changes them.
// Thinking tokens are billed as output.
export const MODEL_PRICES = {
    "gemini-2.5-flash": { input: 0.30, cachedInput: 0.03, output: 2.50 },
};

// Stripe's standard US card fee: 2.9% + 30¢.
export const STRIPE_PERCENT = 0.029;
export const STRIPE_FIXED = 0.30;
export const STRIPE_MINIMUM = 0.50;

export function costFromUsage(model, usage = {}) {
    const price = MODEL_PRICES[model] || MODEL_PRICES["gemini-2.5-flash"];
    const prompt = usage.promptTokenCount || 0;
    const cached = Math.min(usage.cachedContentTokenCount || 0, prompt);
    const output = (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0);
    const costUsd =
        ((prompt - cached) * price.input + cached * price.cachedInput + output * price.output) / 1_000_000;
    return { inputTokens: prompt, cachedTokens: cached, outputTokens: output, costUsd };
}

export const roundCents = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Month key ("2026-10") in New Jersey time.
export function monthKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit" })
        .formatToParts(date);
    const y = parts.find((p) => p.type === "year").value;
    const m = parts.find((p) => p.type === "month").value;
    return `${y}-${m}`;
}

export function monthLabel(key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function previousMonths(count, from = monthKey()) {
    let [y, m] = from.split("-").map(Number);
    const out = [];
    for (let i = 0; i < count; i++) {
        out.push(`${y}-${String(m).padStart(2, "0")}`);
        m -= 1;
        if (m === 0) { m = 12; y -= 1; }
    }
    return out;
}

// Amount to charge a card so that, after Stripe's fee, you still receive `amount`.
export function withCardFee(amount) {
    return Math.ceil(((amount + STRIPE_FIXED) / (1 - STRIPE_PERCENT)) * 100) / 100;
}

export function addMonths(key, n) {
    let [y, m] = key.split("-").map(Number);
    const total = y * 12 + (m - 1) + n;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// Days left in the month (NJ time), counting today. Last day of month → 1.
export function daysLeftInMonth(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(date);
    const y = Number(parts.find((p) => p.type === "year").value);
    const m = Number(parts.find((p) => p.type === "month").value);
    const d = Number(parts.find((p) => p.type === "day").value);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return lastDay - d + 1;
}

/*
 * Adjustments (set by the owner, or created when a teacher redeems a coupon):
 *   { id, email, type, amount, percent, startMonth, endMonth (null = every month), note, source, code }
 * type:
 *   "amountOff"  – take $amount off the bill
 *   "percentOff" – take percent% off base fee + AI
 *   "waiveBase"  – no base fee that month
 *   "comp"       – the usage part of the bill is free
 *   "charge"     – add $amount (something else they owe); shows up even in a month with no usage
 */
export const ADJUSTMENT_TYPES = {
    amountOff: "$ off",
    percentOff: "% off",
    waiveBase: "Waive base fee",
    comp: "Free (comp)",
    charge: "Add a charge",
};

export const adjustmentApplies = (a, month) =>
    a.startMonth <= month && (!a.endMonth || month <= a.endMonth);

export function describeAdjustment(a) {
    const what =
        a.type === "amountOff" ? `$${Number(a.amount).toFixed(2)} off` :
        a.type === "percentOff" ? `${Number(a.percent)}% off` :
        a.type === "waiveBase" ? "Base fee waived" :
        a.type === "comp" ? "Free (comp)" :
        a.type === "charge" ? `Extra charge $${Number(a.amount).toFixed(2)}` : a.type;
    return a.code ? `${what} (coupon ${a.code})` : what;
}

// Apply adjustments to one bill. Returns line items and the final total.
export function applyAdjustments({ baseFee, aiCost }, adjustments = []) {
    const lines = [];
    let base = baseFee;
    const comp = adjustments.find((a) => a.type === "comp");
    if (comp) {
        lines.push({ label: describeAdjustment(comp), amount: -roundCents(base + aiCost), id: comp.id, note: comp.note });
        base = 0;
    } else {
        const waive = adjustments.find((a) => a.type === "waiveBase");
        if (waive && base > 0) {
            lines.push({ label: describeAdjustment(waive), amount: -base, id: waive.id, note: waive.note });
            base = 0;
        }
    }
    let subtotal = comp ? 0 : base + aiCost;

    if (!comp) {
        const pct = Math.min(100, adjustments.filter((a) => a.type === "percentOff").reduce((s, a) => s + (Number(a.percent) || 0), 0));
        adjustments.filter((a) => a.type === "percentOff").forEach((a) => {
            const share = pct > 0 ? (Number(a.percent) || 0) / pct : 0;
            const off = roundCents((subtotal * pct / 100) * share);
            if (off > 0) lines.push({ label: describeAdjustment(a), amount: -off, id: a.id, note: a.note });
        });
        subtotal = subtotal - roundCents(subtotal * pct / 100);

        adjustments.filter((a) => a.type === "amountOff").forEach((a) => {
            const off = Math.min(subtotal, Math.max(0, Number(a.amount) || 0));
            if (off > 0) lines.push({ label: describeAdjustment(a), amount: -roundCents(off), id: a.id, note: a.note });
            subtotal -= off;
        });
    }

    let total = Math.max(0, subtotal);
    adjustments.filter((a) => a.type === "charge").forEach((a) => {
        const add = Math.max(0, Number(a.amount) || 0);
        if (add > 0) lines.push({ label: describeAdjustment(a), amount: roundCents(add), id: a.id, note: a.note });
        total += add;
    });
    return { lines, total: roundCents(total) };
}

/**
 * Build every user's bill for one month.
 * Bill = monthly base fee + the person's own AI cost (only for people who used the app that month),
 * then adjustments/coupons, plus any extra charges. The owner is never billed but sees their spending.
 * usageRows:   [{ email, calls, costUsd, ... }]
 * settings:    { baseFee, fixedCosts: [{ name, monthly }], ownerEmails }
 * payments:    { [email]: { status, method, amount, ... } }
 * adjustments: all adjustments (filtered here to this month)
 */
export function computeBills(usageRows, settings, payments = {}, adjustments = [], month = null) {
    const baseFee = roundCents(Math.max(0, Number(settings.baseFee) || 0));
    const fixedTotal = (settings.fixedCosts || []).reduce((s, c) => s + (Number(c.monthly) || 0), 0);
    const owners = (settings.ownerEmails || []).map((e) => e.toLowerCase());
    const isOwnerEmail = (e) => owners.includes(e.toLowerCase());
    const active = usageRows.filter((r) => (r.calls || 0) > 0);
    const forMonth = month ? adjustments.filter((a) => adjustmentApplies(a, month)) : adjustments;
    const adjFor = (email) => forMonth.filter((a) => a.email.toLowerCase() === email.toLowerCase());

    const rows = [...active];
    // People with an extra charge but no usage this month still get a bill (charge only, no base fee).
    forMonth.filter((a) => a.type === "charge" && !isOwnerEmail(a.email)).forEach((a) => {
        if (!rows.some((r) => r.email.toLowerCase() === a.email.toLowerCase())) rows.push({ email: a.email.toLowerCase(), calls: 0, costUsd: 0 });
    });

    const bills = rows.map((r) => {
        const isOwner = isOwnerEmail(r.email);
        const used = (r.calls || 0) > 0;
        const aiCost = roundCents(r.costUsd || 0);
        const fee = isOwner || !used ? 0 : baseFee;
        const subtotal = roundCents(aiCost + fee);
        const applied = isOwner ? { lines: [], total: subtotal } : applyAdjustments({ baseFee: fee, aiCost }, adjFor(r.email));
        return {
            email: r.email,
            calls: r.calls || 0,
            inputTokens: r.inputTokens || 0,
            outputTokens: r.outputTokens || 0,
            aiCostExact: r.costUsd || 0,
            aiCost,
            baseFee: fee,
            subtotal,
            adjustments: applied.lines,
            total: applied.total,
            isOwner,
            payment: payments[r.email] || null,
        };
    }).sort((a, b) => b.total - a.total);

    const aiTotal = active.reduce((s, r) => s + (r.costUsd || 0), 0);
    const others = bills.filter((b) => !b.isOwner);
    const owed = others.reduce((s, b) => s + b.total, 0);
    const collected = others.filter((b) => b.payment?.status === "paid").reduce((s, b) => s + (b.payment.amount ?? b.total), 0);
    const ownerAi = bills.filter((b) => b.isOwner).reduce((s, b) => s + b.aiCostExact, 0);
    const discounts = others.reduce((s, b) => s + b.adjustments.filter((l) => l.amount < 0).reduce((t, l) => t - l.amount, 0), 0);
    return {
        bills,
        summary: {
            activeUsers: active.length,
            payingUsers: others.length,
            baseFee,
            fixedTotal: roundCents(fixedTotal),
            aiTotal: roundCents(aiTotal),
            ownerAi: roundCents(ownerAi),
            totalCost: roundCents(aiTotal + fixedTotal),
            discounts: roundCents(discounts),
            owedByOthers: roundCents(owed),
            collected: roundCents(collected),
            youCover: roundCents(aiTotal + fixedTotal - owed),
        },
    };
}

/*
 * Should this teacher see a payment reminder pop-up right now?
 * - "due":      a finished month is unpaid (and not marked Venmo-pending) → remind until paid
 * - "upcoming": last 7 days of the month and this month's bill so far is > $0
 * Shown at most once every REMINDER_EVERY_DAYS days (after the teacher closes it).
 */
export const REMINDER_EVERY_DAYS = 3;
export const REMINDER_WINDOW_DAYS = 7;

export function reminderFor({ bills, currentMonth, daysLeft, lastDismissedAt, now = Date.now() }) {
    if (lastDismissedAt && now - new Date(lastDismissedAt).getTime() < REMINDER_EVERY_DAYS * 86400000) return null;
    const unpaid = bills.filter((b) => b.month < currentMonth && b.total > 0 && !b.isOwner
        && b.payment?.status !== "paid" && b.payment?.status !== "venmo-pending");
    if (unpaid.length) {
        const total = roundCents(unpaid.reduce((s, b) => s + b.total, 0));
        return { kind: "due", total, months: unpaid.map((b) => b.month).sort() };
    }
    const cur = bills.find((b) => b.month === currentMonth);
    if (cur && !cur.isOwner && cur.total > 0 && daysLeft <= REMINDER_WINDOW_DAYS) {
        return { kind: "upcoming", total: cur.total, months: [currentMonth], daysLeft, dueMonth: addMonths(currentMonth, 1) };
    }
    return null;
}
