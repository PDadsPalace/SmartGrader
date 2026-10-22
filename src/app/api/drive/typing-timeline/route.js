import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getTypingTimeline } from "@/lib/driveIntegrity";
import { NextResponse } from "next/server";

export const maxDuration = 30;

// GET /api/drive/typing-timeline?fileId=...
// On-demand only (teacher clicks a button) so it never slows down grading.
export async function GET(request) {
    const session = await getServerSession(authOptions);
    if (!session || !session.accessToken || session.error) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fileId = new URL(request.url).searchParams.get("fileId");
    if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
        return NextResponse.json({ error: "A valid fileId is required" }, { status: 400 });
    }

    try {
        const timeline = await getTypingTimeline(session.accessToken, fileId);
        return NextResponse.json(timeline);
    } catch (error) {
        console.error("Typing timeline error:", error?.message);
        const status = error?.code === 403 || error?.status === 403 ? 403 : 500;
        return NextResponse.json({
            supported: false,
            reason: status === 403
                ? "Google denied access to this file's version history."
                : "Couldn't load the version history for this file.",
        }, { status: 200 });
    }
}
