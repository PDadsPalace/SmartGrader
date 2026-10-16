import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getMonth } from "@/lib/billing";
import { monthKey, monthLabel, withCardFee, STRIPE_MINIMUM } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// Starts a Stripe Checkout page for one finished month's bill.
export async function POST(request) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase();
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Card payments aren't set up yet." }, { status: 500 });

    const { month } = await request.json();
    if (!/^\d{4}-\d{2}$/.test(month || "")) return NextResponse.json({ error: "Bad month" }, { status: 400 });
    if (month >= monthKey()) return NextResponse.json({ error: "This month isn't finished yet." }, { status: 400 });

    const data = await getMonth(month);
    const bill = data.bills.find((b) => b.email === email);
    if (!bill) return NextResponse.json({ error: "No bill for that month." }, { status: 404 });
    if (bill.payment?.status === "paid") return NextResponse.json({ error: "Already paid." }, { status: 400 });
    if (bill.total < STRIPE_MINIMUM) return NextResponse.json({ error: `Card payments must be at least $${STRIPE_MINIMUM.toFixed(2)}.` }, { status: 400 });

    const charge = data.settings.passCardFeeToPayer ? withCardFee(bill.total) : bill.total;
    const origin = new URL(request.url).origin;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const checkout = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: email,
        line_items: [{
            quantity: 1,
            price_data: {
                currency: "usd",
                unit_amount: Math.round(charge * 100),
                product_data: {
                    name: `SmartGrAIder — ${monthLabel(month)}`,
                    description: [`Base fee $${bill.baseFee.toFixed(2)}`, `AI grading $${bill.aiCost.toFixed(2)}`, ...bill.adjustments.map((l) => `${l.label} ${l.amount < 0 ? "-" : "+"}$${Math.abs(l.amount).toFixed(2)}`)].join(" · ")
                        + (charge > bill.total ? ` + card fee $${(charge - bill.total).toFixed(2)}` : ""),
                },
            },
        }],
        metadata: { month, email, billTotal: bill.total.toFixed(2) },
        success_url: `${origin}/billing?paid=${month}`,
        cancel_url: `${origin}/billing`,
    });

    return NextResponse.json({ url: checkout.url });
}
