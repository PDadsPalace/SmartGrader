import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isFirestoreConfigured } from "@/lib/firebaseAdmin";
import { dismissReminder, getMyBills, getReminderState, isAdmin } from "@/lib/billing";
import { daysLeftInMonth, reminderFor } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// Should the signed-in teacher see a "payment due" pop-up right now?
export async function GET() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase();
    if (!email || isAdmin(email) || !isFirestoreConfigured()) return NextResponse.json({ show: false });
    try {
        const [{ bills, current }, state] = await Promise.all([getMyBills(email, 4), getReminderState(email)]);
        const r = reminderFor({ bills, currentMonth: current, daysLeft: daysLeftInMonth(), lastDismissedAt: state.lastDismissedAt });
        return NextResponse.json(r ? { show: true, ...r } : { show: false });
    } catch (err) {
        console.error("billing/reminder failed:", err.message);
        return NextResponse.json({ show: false });
    }
}

// The teacher closed the pop-up — don't show it again for a few days.
export async function POST() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase();
    if (!email) return NextResponse.json({ ok: false }, { status: 401 });
    try { await dismissReminder(email); } catch (err) { console.error("dismissReminder failed:", err.message); }
    return NextResponse.json({ ok: true });
}
