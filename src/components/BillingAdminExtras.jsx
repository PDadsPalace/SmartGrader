"use client";

// Billing Admin: per-teacher adjustments and coupon codes.
import { useEffect, useState } from "react";
import { Plus, Trash2, Ticket, SlidersHorizontal, Power } from "lucide-react";
import { Card, money, monthName } from "@/components/BillingShell";

const TYPES = [
    { id: "amountOff", label: "$ off", needs: "amount" },
    { id: "percentOff", label: "% off", needs: "percent" },
    { id: "waiveBase", label: "Waive base fee" },
    { id: "comp", label: "Free (comp)" },
    { id: "charge", label: "Add a charge (they owe you)", needs: "amount" },
];
const COUPON_TYPES = TYPES.filter((t) => t.id !== "charge");

const input = "px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm";
const button = "flex items-center gap-1 px-4 py-2 rounded-lg bg-[#760296] hover:bg-[#5e0278] text-white text-sm font-semibold disabled:opacity-60";

function addMonths(key, n) {
    let [y, m] = key.split("-").map(Number);
    const t = y * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
const nextMonths = (from, n) => Array.from({ length: n }, (_, i) => addMonths(from, i));

function describe(a) {
    const what =
        a.type === "amountOff" ? `$${Number(a.amount).toFixed(2)} off` :
        a.type === "percentOff" ? `${a.percent}% off` :
        a.type === "waiveBase" ? "Base fee waived" :
        a.type === "comp" ? "Free (comp)" :
        a.type === "charge" ? `Charge $${Number(a.amount).toFixed(2)}` : a.type;
    return what;
}
const when = (a) => !a.endMonth ? `${monthName(a.startMonth)} on, every month`
    : a.startMonth === a.endMonth ? monthName(a.startMonth) : `${monthName(a.startMonth)} – ${monthName(a.endMonth)}`;

export function AdjustmentsCard({ data, post, reload, prefillEmail, onError }) {
    const current = data.currentMonth;
    const blank = { email: "", type: "amountOff", amount: "", percent: "", startMonth: current, duration: "once", months: 3, note: "" };
    const [form, setForm] = useState(blank);
    const [busy, setBusy] = useState(false);

    useEffect(() => { if (prefillEmail) setForm((f) => ({ ...f, email: prefillEmail })); }, [prefillEmail]);

    const type = TYPES.find((t) => t.id === form.type);
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const endMonth = form.duration === "once" ? form.startMonth
                : form.duration === "months" ? addMonths(form.startMonth, Math.max(1, Number(form.months) || 1) - 1) : null;
            await post({ action: "addAdjustment", adjustment: { ...form, endMonth } });
            setForm({ ...blank, email: form.email });
            await reload();
        } catch (err) { onError(err.message); }
        setBusy(false);
    };

    const remove = async (a) => {
        if (!confirm(`Remove "${describe(a)}" for ${a.email}? Unpaid bills will go back to normal.`)) return;
        try { await post({ action: "deleteAdjustment", id: a.id }); await reload(); } catch (err) { onError(err.message); }
    };

    const list = (data.adjustments || []).filter((a) => !a.endMonth || a.endMonth >= addMonths(current, -6));

    return (
        <Card>
            <h2 className="text-lg font-bold mb-1 flex items-center gap-2"><SlidersHorizontal className="w-5 h-5 text-[#760296]" />Adjust a teacher's bill</h2>
            <p className="text-sm text-slate-500 mb-4">Give someone a discount, waive their base fee, make it free, or add something extra they owe you. It changes their unpaid bills right away.</p>

            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium flex flex-col gap-1">Teacher
                    <input list="teacher-list" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="teacher@school.org" className={input} required />
                    <datalist id="teacher-list">{(data.teachers || []).map((t) => <option key={t} value={t} />)}</datalist>
                </label>
                <label className="text-sm font-medium flex flex-col gap-1">What
                    <select value={form.type} onChange={(e) => set("type", e.target.value)} className={input}>
                        {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                </label>
                {type?.needs === "amount" && (
                    <label className="text-sm font-medium flex flex-col gap-1">Amount ($)
                        <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} className={input} required />
                    </label>
                )}
                {type?.needs === "percent" && (
                    <label className="text-sm font-medium flex flex-col gap-1">Percent off
                        <input type="number" min="1" max="100" step="1" value={form.percent} onChange={(e) => set("percent", e.target.value)} className={input} required />
                    </label>
                )}
                <label className="text-sm font-medium flex flex-col gap-1">Starting
                    <select value={form.startMonth} onChange={(e) => set("startMonth", e.target.value)} className={input}>
                        {[...data.months.slice(1, 4).reverse(), ...nextMonths(current, 6)].map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
                    </select>
                </label>
                <label className="text-sm font-medium flex flex-col gap-1">For how long
                    <div className="flex gap-2">
                        <select value={form.duration} onChange={(e) => set("duration", e.target.value)} className={`${input} flex-1`}>
                            <option value="once">Just that month</option>
                            <option value="months">A number of months</option>
                            <option value="ongoing">Every month until I remove it</option>
                        </select>
                        {form.duration === "months" && (
                            <input type="number" min="1" max="24" value={form.months} onChange={(e) => set("months", e.target.value)} className={`${input} w-20`} aria-label="Number of months" />
                        )}
                    </div>
                </label>
                <label className="text-sm font-medium flex flex-col gap-1 sm:col-span-2">Note (they'll see it on their bill)
                    <input value={form.note} onChange={(e) => set("note", e.target.value)} placeholder={form.type === "charge" ? "e.g. Senior class T-shirt" : "e.g. Thanks for testing!"} maxLength={120} className={input} />
                </label>
                <div className="sm:col-span-2">
                    <button type="submit" disabled={busy} className={button}><Plus className="w-4 h-4" />{busy ? "Saving…" : "Add adjustment"}</button>
                </div>
            </form>

            {list.length > 0 && (
                <div className="mt-5 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                            <tr><th className="py-2 pr-3">Teacher</th><th className="py-2 pr-3">Adjustment</th><th className="py-2 pr-3">When</th><th className="py-2 pr-3">Note</th><th></th></tr>
                        </thead>
                        <tbody>
                            {list.map((a) => (
                                <tr key={a.id} className="border-b last:border-0 border-slate-100 dark:border-slate-800">
                                    <td className="py-2 pr-3">{a.email}</td>
                                    <td className="py-2 pr-3 font-medium">{describe(a)}{a.code && <span className="ml-1 text-xs text-slate-500">(coupon {a.code})</span>}</td>
                                    <td className="py-2 pr-3 text-slate-500">{when(a)}</td>
                                    <td className="py-2 pr-3 text-slate-500">{a.note}</td>
                                    <td className="py-2 text-right">
                                        <button onClick={() => remove(a)} className="p-1 text-slate-400 hover:text-rose-600" aria-label="Remove adjustment"><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

export function CouponsCard({ data, post, reload, onError }) {
    const blank = { code: "", type: "percentOff", amount: "", percent: "", months: 1, maxUses: "", expires: "", note: "" };
    const [form, setForm] = useState(blank);
    const [busy, setBusy] = useState(false);
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
    const type = COUPON_TYPES.find((t) => t.id === form.type);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try { await post({ action: "saveCoupon", coupon: form }); setForm(blank); await reload(); } catch (err) { onError(err.message); }
        setBusy(false);
    };
    const toggle = async (c) => {
        try { await post({ action: "saveCoupon", coupon: { ...c, active: !c.active } }); await reload(); } catch (err) { onError(err.message); }
    };
    const remove = async (c) => {
        if (!confirm(`Delete code ${c.code}? Teachers who already used it keep their discount (remove it above if needed).`)) return;
        try { await post({ action: "deleteCoupon", code: c.code }); await reload(); } catch (err) { onError(err.message); }
    };

    const couponText = (c) => {
        const what = c.type === "amountOff" ? `$${Number(c.amount).toFixed(2)} off` : c.type === "percentOff" ? `${c.percent}% off`
            : c.type === "waiveBase" ? "No base fee" : "Free";
        return `${what}, ${c.months ? `${c.months} month${c.months === 1 ? "" : "s"}` : "every month"}`;
    };

    return (
        <Card>
            <h2 className="text-lg font-bold mb-1 flex items-center gap-2"><Ticket className="w-5 h-5 text-[#760296]" />Coupon codes</h2>
            <p className="text-sm text-slate-500 mb-4">Make a code and give it to a teacher. They type it on their My Bill page and the discount starts that month. Each teacher can use a code once.</p>

            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-medium flex flex-col gap-1">Code
                    <input value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} placeholder="FRIEND50" maxLength={24} className={`${input} uppercase tracking-wide`} required />
                </label>
                <label className="text-sm font-medium flex flex-col gap-1">Discount
                    <select value={form.type} onChange={(e) => set("type", e.target.value)} className={input}>
                        {COUPON_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                </label>
                {type?.needs === "amount" ? (
                    <label className="text-sm font-medium flex flex-col gap-1">Amount ($)
                        <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} className={input} required />
                    </label>
                ) : type?.needs === "percent" ? (
                    <label className="text-sm font-medium flex flex-col gap-1">Percent off
                        <input type="number" min="1" max="100" value={form.percent} onChange={(e) => set("percent", e.target.value)} className={input} required />
                    </label>
                ) : <div className="hidden sm:block" />}
                <label className="text-sm font-medium flex flex-col gap-1">Lasts (months)
                    <input type="number" min="0" max="24" value={form.months} onChange={(e) => set("months", e.target.value)} className={input} />
                    <span className="text-xs font-normal text-slate-500">0 = every month</span>
                </label>
                <label className="text-sm font-medium flex flex-col gap-1">Max teachers
                    <input type="number" min="0" value={form.maxUses} onChange={(e) => set("maxUses", e.target.value)} placeholder="No limit" className={input} />
                </label>
                <label className="text-sm font-medium flex flex-col gap-1">Expires
                    <input type="date" value={form.expires} onChange={(e) => set("expires", e.target.value)} className={input} />
                </label>
                <label className="text-sm font-medium flex flex-col gap-1 sm:col-span-3">Note (shown on their bill)
                    <input value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={120} placeholder="e.g. Friends & family" className={input} />
                </label>
                <div className="sm:col-span-3">
                    <button type="submit" disabled={busy} className={button}><Plus className="w-4 h-4" />{busy ? "Saving…" : "Create code"}</button>
                </div>
            </form>

            {(data.coupons || []).length > 0 && (
                <div className="mt-5 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                            <tr><th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Gives</th><th className="py-2 pr-3">Used</th><th className="py-2 pr-3">Expires</th><th className="py-2 pr-3">Status</th><th></th></tr>
                        </thead>
                        <tbody>
                            {data.coupons.map((c) => (
                                <tr key={c.code} className="border-b last:border-0 border-slate-100 dark:border-slate-800">
                                    <td className="py-2 pr-3 font-mono font-semibold">{c.code}</td>
                                    <td className="py-2 pr-3">{couponText(c)}</td>
                                    <td className="py-2 pr-3 tabular-nums" title={(c.redeemedBy || []).join(", ")}>{c.uses || 0}{c.maxUses ? ` / ${c.maxUses}` : ""}</td>
                                    <td className="py-2 pr-3 text-slate-500">{c.expires || "—"}</td>
                                    <td className="py-2 pr-3">{c.active ? <span className="text-emerald-700 dark:text-emerald-400 font-medium">Active</span> : <span className="text-slate-500">Off</span>}</td>
                                    <td className="py-2 text-right whitespace-nowrap">
                                        <button onClick={() => toggle(c)} className="p-1 text-slate-400 hover:text-[#760296]" aria-label={c.active ? "Turn code off" : "Turn code on"} title={c.active ? "Turn off" : "Turn on"}><Power className="w-4 h-4" /></button>
                                        <button onClick={() => remove(c)} className="p-1 text-slate-400 hover:text-rose-600" aria-label="Delete code"><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}
