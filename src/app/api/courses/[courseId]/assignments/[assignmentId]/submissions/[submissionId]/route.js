import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getClassroomClient } from "@/lib/googleClassroom";
import { exportGoogleDocToText } from "@/lib/googleDrive";
import { extractGoogleFormResponse } from "@/lib/googleForms";
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

        // 1. Check if the assignment itself has a Google Form attached to the instructions
        const courseWorkResponse = await classroom.courses.courseWork.get({
            courseId: courseId,
            id: assignmentId,
        });

        const courseWork = courseWorkResponse.data;
        let formAttachment = null;

        if (courseWork.materials) {
            formAttachment = courseWork.materials.find(mat => mat.form);
        }

        if (formAttachment) {
            try {
                // Extract formId from the URL since the Classroom API doesn't cleanly expose the raw ID
                const formUrl = formAttachment.form.formUrl || "";
                const formIdMatch = formUrl.match(/\/forms\/d\/([a-zA-Z0-9-_]+)/);

                if (!formIdMatch) {
                    return NextResponse.json({ content: "Error: Could not extract the Form ID from the attached URL." });
                }
                const formId = formIdMatch[1];

                // Get student's email (or name for fallback) to cross-reference with Form Responses
                const studentResponse = await classroom.courses.students.get({
                    courseId: courseId,
                    userId: submission.userId
                });
                const studentEmail = studentResponse.data.profile?.emailAddress;
                const studentName = studentResponse.data.profile?.name?.fullName;

                const formExportData = await extractGoogleFormResponse(session.accessToken, formId, studentEmail, studentName);
                return NextResponse.json(formExportData);

            } catch (formError) {
                console.error("Error processing Google Form attachment:", formError);
                return NextResponse.json({ content: "Error: The Google Form extraction failed. Make sure you authorized the new Google Forms permissions and that the Form is set to 'Collect Email Addresses'." });
            }
        }

        // 2. Fall back to standard Google Drive Files (Docs, Sheets, PDFs)
        const attachments = submission.assignmentSubmission?.attachments || [];
        const driveAttachment = attachments.find(att => att.driveFile);

        if (!driveAttachment) {
            return NextResponse.json({ content: "No Supported Attachments Found. Materials attached to assignment: " + JSON.stringify(courseWork.materials) });
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
            return NextResponse.json({ error: "Permission Denied. Did you grant Google Drive and Forms access when logging in?" }, { status: 403 });
        }

        return NextResponse.json({ error: "Failed to fetch submission content" }, { status: 500 });
    }
}
