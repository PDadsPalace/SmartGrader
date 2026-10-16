import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isFirestoreConfigured } from "@/lib/firebaseAdmin";
import { getMyBills, isAdmin } from "@/lib/billing";

export const dynamic = "force-dynamic";

// The signed-in teacher's bill for the current month (running) and the last 6 months.
export async function GET() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase();
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isFirestoreConfigured()) return NextResponse.json({ notConfigured: true, isAdmin: isAdmin(email) });

    try {
        const { settings, bills, discounts } = await getMyBills(email);
        return NextResponse.json({
            isAdmin: isAdmin(email),
            venmoUsername: settings.venmoUsername,
            baseFee: settings.baseFee,
            passCardFeeToPayer: settings.passCardFeeToPayer,
            bills,
            discounts,
        });
    } catch (err) {
        console.error("billing/me failed:", err);
        return NextResponse.json({ error: "Could not load your bill." }, { status: 500 });
    }
}
