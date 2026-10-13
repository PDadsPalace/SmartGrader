import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isFirestoreConfigured } from "@/lib/firebaseAdmin";
import { getMonth, isAdmin } from "@/lib/billing";
import { monthKey, previousMonths, withCardFee, STRIPE_MINIMUM } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// The signed-in teacher's bill for the current month (running) and the last 6 months.
export async function GET() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase();
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isFirestoreConfigured()) return NextResponse.json({ notConfigured: true, isAdmin: isAdmin(email) });

    try {
        const current = monthKey();
        const months = previousMonths(7, current);
        const results = await Promise.all(months.map(getMonth));
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
                total: bill.total,
                cardAmount,
                canPayByCard: bill.total >= STRIPE_MINIMUM && Boolean(process.env.STRIPE_SECRET_KEY),
                payment: bill.payment,
                isOwner: bill.isOwner,
            };
        }).filter(Boolean);

        return NextResponse.json({
            isAdmin: isAdmin(email),
            venmoUsername: settings.venmoUsername,
            baseFee: settings.baseFee,
            passCardFeeToPayer: settings.passCardFeeToPayer,
            bills,
        });
    } catch (err) {
        console.error("billing/me failed:", err);
        return NextResponse.json({ error: "Could not load your bill." }, { status: 500 });
    }
}
