"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { CreditCard, Send, Info, Shield } from "lucide-react";
import { BillingShell, Card, StatusPill, money, monthName } from "@/components/BillingShell";

export default function MyBillPage() {
    const { status } = useSession();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(null);
    const [paidMonth, setPaidMonth] = useState(null);

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

    const fixedTotal = (data?.fixedCosts || []).reduce((s, c) => s + (Number(c.monthly) || 0), 0);

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
                            You pay what your own AI grading actually cost that month, plus an even share of the
                            hosting costs ({money(fixedTotal)}/month: {(data.fixedCosts || []).filter(c => c.monthly > 0).map(c => `${c.name} ${money(c.monthly)}`).join(", ") || "none right now"}),
                            split among everyone who used SmartGrAIder that month. No usage, no bill.
                            {data.passCardFeeToPayer && " Card payments add the card processing fee; Venmo doesn't."}
                        </p>
                    </Card>

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
                                        <dt className="text-slate-500">AI grading ({bill.calls} AI requests)</dt><dd className="text-right tabular-nums">{money(bill.aiCost)}</dd>
                                        <dt className="text-slate-500">Hosting share (÷{bill.splitCount})</dt><dd className="text-right tabular-nums">{money(bill.fixedShare)}</dd>
                                        <dt className="font-semibold">{bill.isCurrent ? "So far" : "Total"}</dt><dd className="text-right font-semibold tabular-nums">{money(bill.total)}</dd>
                                    </dl>
                                    {bill.isCurrent && <p className="mt-2 text-xs text-slate-500">This month is still running. The hosting share can go down if more people use it.</p>}
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
