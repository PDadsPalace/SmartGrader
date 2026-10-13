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

/**
 * Build every user's bill for one month.
 * Bill = monthly base fee + the person's own AI cost, only for people who used the app that month.
 * The owner is never billed, but their own spending is still shown.
 * usageRows: [{ email, calls, costUsd, ... }]
 * settings:  { baseFee, fixedCosts: [{ name, monthly }], ownerEmails }
 * payments:  { [email]: { status, method, amount, ... } }
 */
export function computeBills(usageRows, settings, payments = {}) {
    const baseFee = roundCents(Math.max(0, Number(settings.baseFee) || 0));
    const fixedTotal = (settings.fixedCosts || []).reduce((s, c) => s + (Number(c.monthly) || 0), 0);
    const owners = (settings.ownerEmails || []).map((e) => e.toLowerCase());
    const active = usageRows.filter((r) => (r.calls || 0) > 0);

    const bills = active.map((r) => {
        const isOwner = owners.includes(r.email.toLowerCase());
        const aiCost = roundCents(r.costUsd || 0);
        const fee = isOwner ? 0 : baseFee;
        return {
            email: r.email,
            calls: r.calls || 0,
            inputTokens: r.inputTokens || 0,
            outputTokens: r.outputTokens || 0,
            aiCostExact: r.costUsd || 0,
            aiCost,
            baseFee: fee,
            total: roundCents(aiCost + fee),
            isOwner,
            payment: payments[r.email] || null,
        };
    }).sort((a, b) => b.total - a.total);

    const aiTotal = active.reduce((s, r) => s + (r.costUsd || 0), 0);
    const others = bills.filter((b) => !b.isOwner);
    const owed = others.reduce((s, b) => s + b.total, 0);
    const collected = others.filter((b) => b.payment?.status === "paid").reduce((s, b) => s + (b.payment.amount ?? b.total), 0);
    const ownerAi = bills.filter((b) => b.isOwner).reduce((s, b) => s + b.aiCostExact, 0);
    return {
        bills,
        summary: {
            activeUsers: active.length,
            payingUsers: others.length,
            baseFee,
            fixedTotal: roundCents(fixedTotal),
            aiTotal: roundCents(aiTotal),
            ownerAi: roundCents(ownerAi),
            totalCost: roundCents(aiTotal + fixedTotal),          // what you pay Google + Vercel + GitHub
            owedByOthers: roundCents(owed),
            collected: roundCents(collected),
            youCover: roundCents(aiTotal + fixedTotal - owed),    // your out-of-pocket if everyone pays
        },
    };
}
