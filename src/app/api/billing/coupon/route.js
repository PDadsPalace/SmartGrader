import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isAdmin, redeemCoupon } from "@/lib/billing";
import { describeAdjustment } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// A teacher enters a coupon code on My Bill.
export async function POST(request) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase();
    if (!email) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    if (isAdmin(email)) return NextResponse.json({ error: "You're the owner — you aren't billed, so coupons don't apply to you." }, { status: 400 });
    const { code } = await request.json().catch(() => ({}));
    try {
        const adj = await redeemCoupon(email, code);
        return NextResponse.json({ ok: true, applied: describeAdjustment(adj), until: adj.endMonth });
    } catch (err) {
        return NextResponse.json({ error: err.message || "Could not apply that code." }, { status: 400 });
    }
}
