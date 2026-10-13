import { NextResponse } from "next/server";
import Stripe from "stripe";
import { setPayment } from "@/lib/billing";

export const dynamic = "force-dynamic";

// Stripe calls this after a card payment. Set the endpoint in Stripe → Developers → Webhooks
// to https://<your-site>/api/billing/webhook with event "checkout.session.completed".
export async function POST(request) {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
        return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const raw = await request.text();
    let event;
    try {
        event = stripe.webhooks.constructEvent(raw, request.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return NextResponse.json({ error: `Bad signature: ${err.message}` }, { status: 400 });
    }

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const s = event.data.object;
        const { month, email, billTotal } = s.metadata || {};
        if (month && email && s.payment_status === "paid") {
            await setPayment(month, email, {
                status: "paid",
                method: "card",
                amount: Number(billTotal) || 0,
                charged: (s.amount_total || 0) / 100,
                stripeSessionId: s.id,
                paidAt: new Date().toISOString(),
            });
        }
    }
    return NextResponse.json({ received: true });
}
