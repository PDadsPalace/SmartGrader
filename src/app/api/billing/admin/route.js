import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isFirestoreConfigured } from "@/lib/firebaseAdmin";
import { addAdjustment, deleteAdjustment, deleteCoupon, getAdjustments, getCoupons, getMonth, isAdmin, knownTeachers, saveCoupon, saveSettings, setPayment } from "@/lib/billing";
import { monthKey, previousMonths } from "@/lib/pricing";

export const dynamic = "force-dynamic";

async function requireAdmin() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!isAdmin(email)) return null;
    return email.toLowerCase();
}

const MONTH_RE = /^\d{4}-\d{2}$/;

export async function GET(request) {
    if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!isFirestoreConfigured()) return NextResponse.json({ notConfigured: true });
    const month = new URL(request.url).searchParams.get("month") || monthKey();
    if (!MONTH_RE.test(month)) return NextResponse.json({ error: "Bad month" }, { status: 400 });
    try {
        const [data, adjustments, coupons, teachers] = await Promise.all([getMonth(month), getAdjustments(), getCoupons(), knownTeachers()]);
        return NextResponse.json({
            ...data,
            adjustments: adjustments.sort((x, y) => (y.createdAt || "").localeCompare(x.createdAt || "")),
            coupons,
            teachers,
            currentMonth: monthKey(),
            months: previousMonths(12),
            stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
            webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
        });
    } catch (err) {
        console.error("billing/admin GET failed:", err);
        return NextResponse.json({ error: "Could not load billing data.", details: err.message }, { status: 500 });
    }
}

// Actions: { action: "saveSettings", settings } | { action: "markPaid" | "markUnpaid", month, email, amount? }
export async function POST(request) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!isFirestoreConfigured()) return NextResponse.json({ error: "Firestore not configured" }, { status: 500 });
    const body = await request.json();
    try {
        if (body.action === "saveSettings") {
            return NextResponse.json({ settings: await saveSettings(body.settings || {}) });
        }
        if (body.action === "addAdjustment") return NextResponse.json({ adjustment: await addAdjustment(body.adjustment || {}) });
        if (body.action === "deleteAdjustment") { await deleteAdjustment(body.id); return NextResponse.json({ ok: true }); }
        if (body.action === "saveCoupon") return NextResponse.json({ coupon: await saveCoupon(body.coupon || {}) });
        if (body.action === "deleteCoupon") { await deleteCoupon(body.code); return NextResponse.json({ ok: true }); }
        if (!MONTH_RE.test(body.month || "") || !body.email) {
            return NextResponse.json({ error: "month and email are required" }, { status: 400 });
        }
        if (body.action === "markPaid") {
            await setPayment(body.month, body.email, {
                status: "paid",
                method: body.method || "venmo",
                amount: Number(body.amount) || 0,
                paidAt: new Date().toISOString(),
                markedBy: admin,
            });
        } else if (body.action === "markUnpaid") {
            await setPayment(body.month, body.email, null);
        } else {
            return NextResponse.json({ error: "Unknown action" }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("billing/admin POST failed:", err);
        return NextResponse.json({ error: err.message || "Save failed." }, { status: 400 });
    }
}
