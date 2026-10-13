"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, Trash2, Save, AlertTriangle } from "lucide-react";
import { BillingShell, Card, StatusPill, money, monthName } from "@/components/BillingShell";

function Stat({ label, value, sub }) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <div className="text-xs font-medium text-slate-500">{label}</div>
            <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
            {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
        </div>
    );
}

export default function AdminBillingPage() {
    const { status } = useSession();
    const [month, setMonth] = useState("");
    const [data, setData] = useState(null);
    const [settings, setSettings] = useState(null);
    const [error, setError] = useState(null);
    const [saved, setSaved] = useState(false);

    const load = async (m = month) => {
        setError(null);
        const res = await fetch(`/api/billing/admin${m ? `?month=${m}` : ""}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Could not load."); return; }
        setData(json);
        if (!json.notConfigured) {
            if (!m) setMonth(json.month);
            setSettings((s) => s || {
                baseFee: json.settings.baseFee,
                fixedCosts: json.settings.fixedCosts,
                passCardFeeToPayer: json.settings.passCardFeeToPayer,
                venmoUsername: json.settings.venmoUsername,
            });
        }
    };

    useEffect(() => { if (status === "authenticated") load(); }, [status]);

    const post = async (body) => {
        const res = await fetch("/api/billing/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        return json;
    };

    const saveSettings = async () => {
        try {
            const { settings: clean } = await post({ action: "saveSettings", settings });
            setSettings(clean); setSaved(true); setTimeout(() => setSaved(false), 2000);
            await load(month);
        } catch (e) { setError(e.message); }
    };

    const togglePaid = async (bill) => {
        try {
            if (bill.payment?.status === "paid") {
                if (!confirm(`Mark ${bill.email} as NOT paid for ${monthName(month)}?`)) return;
                await post({ action: "markUnpaid", month, email: bill.email });
            } else {
                await post({ action: "markPaid", month, email: bill.email, amount: bill.total, method: "venmo" });
            }
            await load(month);
        } catch (e) { setError(e.message); }
    };

    const updateCost = (i, field, value) =>
        setSettings((s) => ({ ...s, fixedCosts: s.fixedCosts.map((c, j) => (j === i ? { ...c, [field]: value } : c)) }));

    if (data?.notConfigured) {
        return <BillingShell title="Billing Admin"><Card>Add the <code>FIREBASE_SERVICE_ACCOUNT</code> environment variable in Vercel, then redeploy.</Card></BillingShell>;
    }

    const s = data?.summary;
    const isCurrent = data && data.month === data.currentMonth;

    return (
        <BillingShell
            title="Billing Admin"
            right={data && (
                <select value={month} onChange={(e) => { setMonth(e.target.value); load(e.target.value); }}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-medium">
                    {data.months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
                </select>
            )}
        >
            {error && <Card className="border-rose-300 text-rose-700 dark:text-rose-300">{error}</Card>}
            {!data && !error && <Card>Loading…</Card>}

            {data && (!data.stripeConfigured || !data.webhookConfigured) && (
                <Card className="flex gap-3 border-amber-300 text-sm">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <span>Card payments are off until <code>STRIPE_SECRET_KEY</code> and <code>STRIPE_WEBHOOK_SECRET</code> are set in Vercel. Venmo works without them.</span>
                </Card>
            )}

            {s && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Stat label={isCurrent ? "Your costs so far" : "Your costs"} value={money(s.totalCost)} sub={`AI ${money(s.aiTotal)} (yours ${money(s.ownerAi)}) + fixed ${money(s.fixedTotal)}`} />
                    <Stat label="Owed by friends" value={money(s.owedByOthers)} sub={`${s.payingUsers} paying · ${money(s.baseFee)} base each`} />
                    <Stat label="Collected" value={money(s.collected)} sub={`${money(Math.max(0, s.owedByOthers - s.collected))} outstanding`} />
                    <Stat label={s.youCover >= 0 ? "You cover" : "Extra after costs"} value={money(Math.abs(s.youCover))} sub="if everyone pays" />
                </div>
            )}

            {data && (
                <Card className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                            <tr>
                                <th className="p-3">Teacher</th>
                                <th className="p-3 text-right">AI requests</th>
                                <th className="p-3 text-right">AI cost</th>
                                <th className="p-3 text-right">Base fee</th>
                                <th className="p-3 text-right">Total</th>
                                <th className="p-3">Status</th>
                                <th className="p-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.bills.length === 0 && <tr><td colSpan={7} className="p-4 text-slate-500">No usage this month.</td></tr>}
                            {data.bills.map((b) => (
                                <tr key={b.email} className="border-b last:border-0 border-slate-100 dark:border-slate-800">
                                    <td className="p-3 font-medium">{b.email}</td>
                                    <td className="p-3 text-right tabular-nums">{b.calls}</td>
                                    <td className="p-3 text-right tabular-nums" title={`$${b.aiCostExact.toFixed(4)} · ${b.inputTokens.toLocaleString()} in / ${b.outputTokens.toLocaleString()} out tokens`}>{money(b.aiCost)}</td>
                                    <td className="p-3 text-right tabular-nums">{b.isOwner ? "—" : money(b.baseFee)}</td>
                                    <td className="p-3 text-right tabular-nums font-semibold">{money(b.total)}</td>
                                    <td className="p-3"><StatusPill payment={b.payment} isCurrent={isCurrent} isOwner={b.isOwner} /></td>
                                    <td className="p-3 text-right">
                                        {!b.isOwner && !isCurrent && (
                                            <button onClick={() => togglePaid(b)} className="text-xs font-medium text-[#760296] dark:text-purple-300 hover:underline">
                                                {b.payment?.status === "paid" ? "Mark unpaid" : "Mark paid (Venmo)"}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}

            {settings && (
                <Card>
                    <h2 className="text-lg font-bold mb-1">Settings</h2>
                    <p className="text-sm text-slate-500 mb-4">Friends pay the base fee plus their own AI cost in any month they use the app. Changes apply to every unpaid bill, including past months.</p>

                    <label className="flex items-center gap-2 text-sm font-medium mb-5">
                        Base fee per person
                        <span className="text-slate-500">$</span>
                        <input type="number" min="0" step="0.01" value={settings.baseFee} onChange={(e) => setSettings((s) => ({ ...s, baseFee: e.target.value }))}
                            className="w-24 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-right" />
                        <span className="text-xs text-slate-500">/month</span>
                    </label>

                    <h3 className="text-sm font-semibold mb-1">Your monthly costs</h3>
                    <p className="text-xs text-slate-500 mb-2">For tracking only — compared against what you collect. Not split or billed directly.</p>

                    <div className="space-y-2">
                        {settings.fixedCosts.map((c, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <input value={c.name} onChange={(e) => updateCost(i, "name", e.target.value)} placeholder="Name"
                                    className="flex-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm" />
                                <span className="text-slate-500">$</span>
                                <input type="number" min="0" step="0.01" value={c.monthly} onChange={(e) => updateCost(i, "monthly", e.target.value)}
                                    className="w-24 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm text-right" />
                                <span className="text-xs text-slate-500">/mo</span>
                                <button onClick={() => setSettings((s) => ({ ...s, fixedCosts: s.fixedCosts.filter((_, j) => j !== i) }))}
                                    className="p-2 text-slate-400 hover:text-rose-600" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        ))}
                        <button onClick={() => setSettings((s) => ({ ...s, fixedCosts: [...s.fixedCosts, { name: "", monthly: 0 }] }))}
                            className="flex items-center gap-1 text-sm font-medium text-[#760296] dark:text-purple-300"><Plus className="w-4 h-4" />Add cost</button>
                    </div>

                    <div className="mt-5 space-y-3 text-sm">
                        <label className="flex items-center gap-2">
                            Venmo username @
                            <input value={settings.venmoUsername} onChange={(e) => setSettings((s) => ({ ...s, venmoUsername: e.target.value }))}
                                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800" placeholder="your-venmo" />
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={settings.passCardFeeToPayer} onChange={(e) => setSettings((s) => ({ ...s, passCardFeeToPayer: e.target.checked }))} />
                            Card payers cover Stripe's fee (2.9% + 30¢)
                        </label>
                    </div>

                    <button onClick={saveSettings} className="mt-5 flex items-center gap-2 px-4 py-2 rounded-lg bg-[#760296] hover:bg-[#5e0278] text-white font-semibold">
                        <Save className="w-4 h-4" />{saved ? "Saved" : "Save settings"}
                    </button>
                </Card>
            )}
        </BillingShell>
    );
}
