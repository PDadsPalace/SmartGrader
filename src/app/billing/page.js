"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { CreditCard, Send, Info, Shield, Ticket } from "lucide-react";
import { BillingShell, Card, StatusPill, money, monthName } from "@/components/BillingShell";

export default function MyBillPage() {
    const { status } = useSession();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(null);
    const [paidMonth, setPaidMonth] = useState(null);
    const [code, setCode] = useState("");
    const [couponMsg, setCouponMsg] = useState(null);

    const load = async () => {
        try {
            const res = await fetch("/api/billing/me", { cache: "no-store" });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Could not load your bill.");
            setData(json);
        } catch (e) { setError(e.message); }
    };

    useEffect(() => {
        setPaidMonth(new URLSearchParams(window.location.search).get("paid"));
        if (status === "authenticated") load();
    }, [status]);

    if (status === "unauthenticated") {
        return <BillingShell title="My Bill"><Card><button onClick={() => signIn("google")} className="px-4 py-2 rounded-lg bg-[#760296] text-white font-semibold">Sign in with Google</button></Card></BillingShell>;
    }

    const payCard = async (month) => {
        setBusy(month + "card");
        try {
            const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month }) });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            window.location.href = json.url;
        } catch (e) { setError(e.message); setBusy(null); }
    };

    const redeem = async (e) => {
        e.preventDefault();
        if (!code.trim()) return;
        setBusy("coupon"); setCouponMsg(null);
        try {
            const res = await fetch("/api/billing/coupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Could not apply that code.");
            setCouponMsg({ ok: true, text: `Applied: ${json.applied}${json.until ? ` through ${monthName(json.until)}` : ""}.` });
            setCode("");
            await load();
        } catch (err) { setCouponMsg({ ok: false, text: err.message }); }
        setBusy(null);
    };

    const venmoLink = (bill) => {
        const note = encodeURIComponent(`SmartGrAIder ${monthName(bill.month)}`);
        return `https://venmo.com/${data.venmoUsername}?txn=pay&amount=${bill.total.toFixed(2)}&note=${note}`;
    };

    const markVenmoSent = async (month) => {
        setBusy(month + "venmo");
        await fetch("/api/billing/venmo-sent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month }) });
        await load();
        setBusy(null);
    };


    return (
        <BillingShell
            title="My Bill"
            right={data?.isAdmin && <a href="/admin/billing" className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-100 text-[#760296] dark:bg-purple-900/40 dark:text-purple-300"><Shield className="w-4 h-4" />Admin</a>}
        >
            {paidMonth && <Card className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40">Thanks! Your payment for {monthName(paidMonth)} went through. It can take a minute to show as Paid.</Card>}
            {error && <Card className="border-rose-300 text-rose-700 dark:text-rose-300">{error}</Card>}
            {!data && !error && <Card>Loading…</Card>}
            {data?.notConfigured && <Card>Billing isn't switched on yet.</Card>}

            {data?.bills && (
                <>
                    <Card className="flex gap-3 text-sm text-slate-600 dark:text-slate-300">
                        <Info className="w-5 h-5 shrink-0 text-[#760296]" />
                        <p>
                            Each month you use SmartGrAIder, you pay a {money(data.baseFee)} base fee (hosting) plus what
                            your own AI grading actually cost. Months you don't use it are free.
                            {data.passCardFeeToPayer && " Card payments add the card processing fee; Venmo doesn't."}
                        </p>
                    </Card>

                    {!data.isAdmin && (
                        <Card>
                            <form onSubmit={redeem} className="flex items-center gap-2 flex-wrap">
                                <Ticket className="w-5 h-5 text-[#760296]" />
                                <label htmlFor="coupon" className="text-sm font-medium">Have a coupon code?</label>
                                <input id="coupon" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE"
                                    className="flex-1 min-w-[120px] px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm uppercase tracking-wide" />
                                <button type="submit" disabled={busy === "coupon" || !code.trim()}
                                    className="px-4 py-2 rounded-lg bg-[#760296] hover:bg-[#5e0278] text-white text-sm font-semibold disabled:opacity-60">
                                    {busy === "coupon" ? "Checking…" : "Apply"}
                                </button>
                            </form>
                            {couponMsg && <p className={`mt-2 text-sm ${couponMsg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{couponMsg.text}</p>}
                            {(data.discounts || []).length > 0 && (
                                <ul className="mt-3 text-sm space-y-1">
                                    {data.discounts.map((d, i) => (
                                        <li key={i} className="text-slate-600 dark:text-slate-300">
                                            <span className="font-medium text-emerald-700 dark:text-emerald-400">{d.label}</span>
                                            {" — "}{d.until ? (d.from === d.until ? monthName(d.from) : `${monthName(d.from)} – ${monthName(d.until)}`) : `from ${monthName(d.from)}, every month`}
                                            {!d.activeNow && " (starts later)"}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>
                    )}

                    {data.bills.length === 0 && <Card>No usage yet — nothing owed.</Card>}

                    {data.bills.map((bill) => (
                        <Card key={bill.month}>
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-lg font-bold">{monthName(bill.month)}</h2>
                                        <StatusPill payment={bill.payment} isCurrent={bill.isCurrent} isOwner={bill.isOwner} />
                                    </div>
                                    <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
                                        {!bill.isOwner && <><dt className="text-slate-500">Base fee</dt><dd className="text-right tabular-nums">{money(bill.baseFee)}</dd></>}
                                        <dt className="text-slate-500">AI grading ({bill.calls} AI requests)</dt><dd className="text-right tabular-nums">{money(bill.aiCost)}</dd>
                                        {(bill.adjustments || []).map((l, i) => (
                                            <div key={i} className="contents">
                                                <dt className={l.amount < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500"}>{l.label}{l.note ? ` — ${l.note}` : ""}</dt>
                                                <dd className={`text-right tabular-nums ${l.amount < 0 ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{l.amount < 0 ? `−${money(-l.amount)}` : `+${money(l.amount)}`}</dd>
                                            </div>
                                        ))}
                                        <dt className="font-semibold">{bill.isOwner ? "Your AI spending" : bill.isCurrent ? "So far" : "Total"}</dt><dd className="text-right font-semibold tabular-nums">{money(bill.total)}</dd>
                                    </dl>
                                    {bill.isOwner && <p className="mt-2 text-xs text-slate-500">You're the owner, so this isn't billed. It's what your own grading cost.</p>}
                                    {bill.isCurrent && !bill.isOwner && <p className="mt-2 text-xs text-slate-500">This month is still running. You can pay once it ends.</p>}
                                </div>

                                {!bill.isCurrent && !bill.isOwner && bill.payment?.status !== "paid" && bill.total > 0 && (
                                    <div className="flex flex-col gap-2 min-w-[200px]">
                                        {bill.canPayByCard && (
                                            <button onClick={() => payCard(bill.month)} disabled={!!busy}
                                                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#760296] hover:bg-[#5e0278] text-white font-semibold disabled:opacity-60">
                                                <CreditCard className="w-4 h-4" />{busy === bill.month + "card" ? "Opening…" : `Pay ${money(bill.cardAmount)} by card`}
                                            </button>
                                        )}
                                        {data.venmoUsername && (
                                            <>
                                                <a href={venmoLink(bill)} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#008CFF] hover:bg-[#0074d4] text-white font-semibold">
                                                    <Send className="w-4 h-4" />Pay {money(bill.total)} with Venmo
                                                </a>
                                                {bill.payment?.status !== "venmo-pending" && (
                                                    <button onClick={() => markVenmoSent(bill.month)} disabled={!!busy} className="text-xs text-slate-500 hover:text-[#760296] underline">
                                                        I already sent it on Venmo
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        {!bill.canPayByCard && !data.venmoUsername && <p className="text-sm text-slate-500">Payment options coming soon.</p>}
                                        {!bill.canPayByCard && bill.total < 0.5 && data.venmoUsername && <p className="text-xs text-slate-500">Card payments need at least $0.50.</p>}
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))}
                </>
            )}
        </BillingShell>
    );
}
