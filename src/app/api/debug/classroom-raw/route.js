// Owner-only diagnostic: shows exactly what the Google Classroom API returns for one assignment,
// so we can tell whether interactive YouTube question scores are readable.
// Use: /api/debug/classroom-raw?course=<courseId>&work=<courseWorkId>
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getClassroomClient } from "@/lib/googleClassroom";
import { isAdmin } from "@/lib/billing";

export const dynamic = "force-dynamic";

const attempt = async (fn) => { try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, status: e?.code || e?.status, error: e?.errors?.[0]?.message || e?.message }; } };

export async function GET(request) {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken || !isAdmin(session.user?.email)) return NextResponse.json({ error: "Owner only" }, { status: 403 });
    const q = new URL(request.url).searchParams;
    const courseId = q.get("course"), id = q.get("work");
    if (!courseId || !id) return NextResponse.json({ error: "Add ?course=...&work=..." }, { status: 400 });
    const c = getClassroomClient(session.accessToken);

    const work = await attempt(async () => (await c.courses.courseWork.get({ courseId, id })).data);
    const subs = await attempt(async () => (await c.courses.courseWork.studentSubmissions.list({ courseId, courseWorkId: id, pageSize: 3 })).data.studentSubmissions || []);
    const addOns = await attempt(async () => (await c.courses.courseWork.addOnAttachments.list({ courseId, itemId: id })).data.addOnAttachments || []);

    const addOnGrades = [];
    if (addOns.ok) {
        for (const a of addOns.data.slice(0, 3)) {
            for (const s of (subs.ok ? subs.data : []).slice(0, 2)) {
                addOnGrades.push({ attachmentId: a.id, result: await attempt(async () => (await c.courses.courseWork.addOnAttachments.studentSubmissions.get({ courseId, itemId: id, attachmentId: a.id, submissionId: s.id })).data) });
            }
        }
    }

    return NextResponse.json({
        materials: work.ok ? work.data.materials : work,
        workType: work.ok ? work.data.workType : null,
        maxPoints: work.ok ? work.data.maxPoints : null,
        submissions: subs.ok ? subs.data.map((s) => ({
            state: s.state, assignedGrade: s.assignedGrade, draftGrade: s.draftGrade,
            fields: Object.keys(s), attachments: s.assignmentSubmission?.attachments,
        })) : subs,
        addOnAttachments: addOns,
        addOnGrades,
    });
}
