import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getClassroomClient } from "@/lib/googleClassroom";
import { exportGoogleDocToText } from "@/lib/googleDrive";
import { NextResponse } from "next/server";

export async function GET(request, { params }) {
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { courseId, assignmentId, submissionId } = await params;

        if (!courseId || !assignmentId || !submissionId) {
            return NextResponse.json({ error: "Missing required IDs" }, { status: 400 });
        }

        const classroom = getClassroomClient(session.accessToken);

        // Fetch the full details of this specific submission
        const response = await classroom.courses.courseWork.studentSubmissions.get({
            courseId: courseId,
            courseWorkId: assignmentId,
            id: submissionId,
        });

        const submission = response.data;

        // Check if there are attachments
        if (!submission.assignmentSubmission?.attachments || submission.assignmentSubmission.attachments.length === 0) {
            return NextResponse.json({ content: "No attachments found for this submission." });
        }

        // Find the first Google Drive file attachment (assuming a Google Doc for the prototype)
        const driveAttachment = submission.assignmentSubmission.attachments.find(att => att.driveFile);

        if (!driveAttachment) {
            return NextResponse.json({ content: "Found attachments, but none of them are Google Drive files." });
        }

        const fileId = driveAttachment.driveFile.id;

        // Use the Drive API utility to export the text
        const exportData = await exportGoogleDocToText(session.accessToken, fileId);

        if (!exportData) {
            throw new Error("Failed to export document.");
        }

        return NextResponse.json(exportData);

    } catch (error) {
        console.error("API Route Error fetching specific submission:", error);

        if (error.status === 403) {
            return NextResponse.json({ error: "Permission Denied. Did you grant Google Drive access when logging in?" }, { status: 403 });
        }

        return NextResponse.json({ error: "Failed to fetch submission content" }, { status: 500 });
    }
}
