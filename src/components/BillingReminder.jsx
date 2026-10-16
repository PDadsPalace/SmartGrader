"use client";

// Payment reminder pop-up. Shows for teachers (not the owner):
//  - in the last 7 days of the month: "about $X will be due on the 1st"
//  - after a month ends, if that bill is unpaid: "$X is due" — until paid
// After the teacher closes it, it stays away for 3 days (tracked on the server).
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { CreditCard, X } from "lucide-react";
import { money, monthName } from "@/components/BillingShell";

export default function BillingReminder() {
    const { status } = useSession();
    const pathname = usePathname() || "";
    const [reminder, setReminder] = useState(null);

    const onBillingPage = pathname.startsWith("/billing") || pathname.startsWith("/admin");

    useEffect(() => {
        if (status !== "authenticated" || onBillingPage) return;
        let cancelled = false;
        // Small delay so it doesn't pop up the instant the page opens.
        const t = setTimeout(async () => {
            try {
                const res = await fetch("/api/billing/reminder", { cache: "no-store" });
                const json = await res.json();
                if (!cancelled && json.show) setReminder(json);
            } catch { /* never block the app over a reminder */ }
        }, 4000);
        return () => { cancelled = true; clearTimeout(t); };
    }, [status, onBillingPage]);

    if (!reminder) return null;

    const close = () => {
        setReminder(null);
        fetch("/api/billing/reminder", { method: "POST" }).catch(() => {});
    };

    const due = reminder.kind === "due";
    const monthsText = reminder.months.map(monthName).join(" and ");

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="billing-reminder-title">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-5 text-slate-800 dark:text-slate-200">
                <div className="flex items-start justify-between gap-3">
                    <h2 id="billing-reminder-title" className="text-lg font-bold">
                        {due ? "Your SmartGrAIder bill is due" : "Your monthly bill is coming up"}
                    </h2>
                    <button onClick={close} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label="Close">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {due ? (
                    <p className="mt-2 text-sm">
                        Your bill for <strong>{monthsText}</strong> is <strong className="tabular-nums">{money(reminder.total)}</strong>.
                        You can pay by card or Venmo on your bill page.
                    </p>
                ) : (
                    <p className="mt-2 text-sm">
                        Your {monthsText} bill is <strong className="tabular-nums">{money(reminder.total)}</strong> so far.
                        It will be ready to pay on <strong>{monthName(reminder.dueMonth).split(" ")[0]} 1</strong>
                        {reminder.daysLeft > 1 ? ` — ${reminder.daysLeft} days left this month` : " — today is the last day of the month"}.
                    </p>
                )}
                <div className="mt-4 flex gap-2">
                    <a href="/billing" onClick={() => fetch("/api/billing/reminder", { method: "POST" }).catch(() => {})}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#760296] hover:bg-[#5e0278] text-white font-semibold text-sm">
                        <CreditCard className="w-4 h-4" />{due ? "Pay now" : "View my bill"}
                    </a>
                    <button onClick={close} className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-medium">
                        Remind me later
                    </button>
                </div>
            </div>
        </div>
    );
}
