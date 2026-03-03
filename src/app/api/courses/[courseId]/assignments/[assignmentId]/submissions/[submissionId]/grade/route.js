import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getClassroomClient } from "@/lib/googleClassroom";
import { NextResponse } from "next/server";

export async function POST(request, { params }) {
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { courseId, assignmentId, submissionId } = await params;
        const body = await request.json();
        const { draftGrade } = body;

        if (!courseId || !assignmentId || !submissionId) {
            return NextResponse.json({ error: "Missing required IDs" }, { status: 400 });
        }

        const classroom = getClassroomClient(session.accessToken);

        // Safely parse the grade whether it arrived as a string or a float number
        let numericGrade = 0;
        if (typeof draftGrade === 'number') {
            numericGrade = draftGrade;
        } else if (typeof draftGrade === 'string') {
            const numericGradeMatches = draftGrade.match(/(\d+)/);
            if (numericGradeMatches && numericGradeMatches[0]) {
                numericGrade = parseFloat(numericGradeMatches[0]);
            }
        }

        const updateParams = {
            draftGrade: numericGrade,
        };

        const response = await classroom.courses.courseWork.studentSubmissions.patch({
            courseId: courseId,
            courseWorkId: assignmentId,
            id: submissionId,
            updateMask: 'draftGrade',
            requestBody: updateParams
        });

        return NextResponse.json({ success: true, submission: response.data });

    } catch (error) {
        console.error("API Route Error patching specific submission:", error);

        if (error.status === 403) {
            return NextResponse.json({ error: "Write permission denied. Did you re-login to grant Classroom edit access?" }, { status: 403 });
        }
        return NextResponse.json({ error: `Failed to sync grade: ${error.message || "Unknown error"}` }, { status: 500 });
    }
}
