import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getAssignmentSubmissions, getClassroomClient } from "@/lib/googleClassroom";
import { NextResponse } from "next/server";

export async function GET(request, { params }) {
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { courseId, assignmentId } = await params;

        if (!courseId || !assignmentId) {
            return NextResponse.json({ error: "Course ID and Assignment ID are required" }, { status: 400 });
        }

        const submissions = await getAssignmentSubmissions(session.accessToken, courseId, assignmentId);

        let assignmentDetails = { title: "Unknown Assignment" };
        try {
            // Also fetch the name of the assignment so we can display it
            const classroom = getClassroomClient(session.accessToken);
            const cwRes = await classroom.courses.courseWork.get({
                courseId: courseId,
                id: assignmentId,
            });
            assignmentDetails = cwRes.data;
        } catch (cwErr) {
            console.log("Could not fetch assignment name details", cwErr);
        }

        return NextResponse.json({ submissions, assignmentDetails });
    } catch (error) {
        console.error("API Route Error fetching submissions:", error);
        return NextResponse.json({ error: "Failed to fetch submissions" }, { status: 500 });
    }
}
