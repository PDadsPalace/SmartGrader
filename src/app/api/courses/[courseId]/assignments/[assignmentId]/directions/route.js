// The assignment's directions from Google Classroom: the description the teacher typed plus the
// text of any attached Google Docs/text files (and the first PDF/image, for the AI to read).
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getClassroomClient } from "@/lib/googleClassroom";
import { exportGoogleDocToText } from "@/lib/googleDrive";

export const dynamic = "force-dynamic";
const MAX_TEXT = 20000;
const MAX_FILE_B64 = 6_000_000; // ~4.5 MB file

export async function GET(request, { params }) {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken || session.error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { courseId, assignmentId } = await params;
    try {
        const c = getClassroomClient(session.accessToken);
        const work = (await c.courses.courseWork.get({ courseId, id: assignmentId })).data;
        const parts = [];
        if (work.description?.trim()) parts.push(work.description.trim());
        let file = null;
        const sources = [];

        for (const m of work.materials || []) {
            if (m.driveFile?.driveFile) {
                const df = m.driveFile.driveFile;
                const out = await exportGoogleDocToText(session.accessToken, df.id);
                if (out && !out.isBinary && out.data && !out.data.startsWith("Fatal Error")) {
                    parts.push(`--- ${df.title || "Attached document"} ---\n${out.data.trim()}`);
                    sources.push(df.title || "Attached document");
                } else if (out?.isBinary && !file && out.data.length < MAX_FILE_B64) {
                    file = { data: out.data, mimeType: out.mimeType, name: df.title || "Attached file" };
                    sources.push(df.title || "Attached file");
                }
            } else if (m.link) {
                parts.push(`Link: ${m.link.title || ""} ${m.link.url}`.trim());
            } else if (m.youtubeVideo) {
                parts.push(`YouTube video: ${m.youtubeVideo.title || ""} ${m.youtubeVideo.alternateLink || ""}`.trim());
            } else if (m.form) {
                parts.push(`Google Form: ${m.form.title || ""} ${m.form.formUrl || ""}`.trim());
            }
        }

        let text = parts.join("\n\n");
        if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT) + "\n[...cut off — too long]";
        return NextResponse.json({ text, file, sources, hasDescription: Boolean(work.description?.trim()) });
    } catch (err) {
        console.error("directions route failed:", err.message);
        return NextResponse.json({ error: "Couldn't load the directions from Classroom." }, { status: 500 });
    }
}
