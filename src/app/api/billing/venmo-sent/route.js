import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getMonth, setPayment } from "@/lib/billing";

// A teacher says "I sent it on Venmo" — shows as "Venmo pending" until the owner confirms.
export async function POST(request) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase();
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { month } = await request.json();
    if (!/^\d{4}-\d{2}$/.test(month || "")) return NextResponse.json({ error: "Bad month" }, { status: 400 });
    const data = await getMonth(month);
    const bill = data.bills.find((b) => b.email === email);
    if (!bill) return NextResponse.json({ error: "No bill for that month" }, { status: 404 });
    if (bill.payment?.status === "paid") return NextResponse.json({ ok: true });
    await setPayment(month, email, { status: "venmo-pending", method: "venmo", amount: bill.total, reportedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true });
}
