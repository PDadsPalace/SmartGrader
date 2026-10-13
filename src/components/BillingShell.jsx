"use client";

import { ArrowLeft } from "lucide-react";

export const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

export function monthName(key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function StatusPill({ payment, isCurrent, isOwner }) {
    const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold";
    if (isOwner) return <span className={`${base} bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300`}>Owner</span>;
    if (payment?.status === "paid") return <span className={`${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`}>Paid{payment.method ? ` · ${payment.method}` : ""}</span>;
    if (payment?.status === "venmo-pending") return <span className={`${base} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`}>Venmo pending</span>;
    if (isCurrent) return <span className={`${base} bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300`}>In progress</span>;
    return <span className={`${base} bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300`}>Due</span>;
}

export function BillingShell({ title, children, right }) {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
            <header className="h-16 flex items-center justify-between px-4 sm:px-8 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                    <a href="/" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Back to dashboard">
                        <ArrowLeft className="w-5 h-5" />
                    </a>
                    <h1 className="text-xl font-bold">{title}</h1>
                </div>
                {right}
            </header>
            <main className="max-w-4xl mx-auto p-4 sm:p-8 space-y-6">{children}</main>
        </div>
    );
}

export function Card({ children, className = "" }) {
    return <section className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 ${className}`}>{children}</section>;
}
