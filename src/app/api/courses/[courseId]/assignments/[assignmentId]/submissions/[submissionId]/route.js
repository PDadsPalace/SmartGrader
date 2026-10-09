import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getClassroomClient } from "@/lib/googleClassroom";
import { exportGoogleDocToText } from "@/lib/googleDrive";
import { getFileIntegrity } from "@/lib/driveIntegrity";
import { textStats } from "@/lib/integrityAnalysis";
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
        const driveAttachments = attachments.filter(att => att.driveFile);

        if (driveAttachments.length === 0) {
            // Check if they attached a Google Form as a generic 'Link' by mistake
            const linkAttachment = courseWork.materials?.find(mat => mat.link?.url?.includes("docs.google.com/forms"));
            if (linkAttachment) {
                return NextResponse.json({ content: "Error: You attached the Google Form as a generic 'Link'. The AI cannot pull responses from a generic link due to Google's privacy rules. \n\nHow to fix:\n1. Go to Google Classroom and edit this assignment.\n2. Delete the link attachment.\n3. Click the 'Google Drive' icon 📂 to attach the Form directly from your Drive. This gives the AI the correct 'File ID' it needs to grade it." });
            }

            return NextResponse.json({ content: "No Supported Attachments Found. Materials attached to assignment: " + JSON.stringify(courseWork.materials) });
        }

        let combinedText = "";
        let multipleBinaries = [];
        const integrityFiles = []; // file history for the cheating checks (owner, versions, timing)
        let totalBinaryChars = 0;
        const BINARY_LIMIT = 2500000; // ~2.5MB limit for base64 to avoid Vercel 4.5MB JSON payload limits

        // Export all valid Google Drive files sequentially to avoid rate limits
        for (const att of driveAttachments) {
            const fileId = att.driveFile.id;

            // Optional Optimization: Skip files that are exactly the teacher's original 'View Only' materials
            let isOriginalMaterial = false;
            if (courseWork.materials) {
                for (const mat of courseWork.materials) {
                    if (mat.driveFile && mat.driveFile.driveFile && mat.driveFile.driveFile.id === fileId) {
                        isOriginalMaterial = true;
                        break;
                    }
                }
            }
            // If it's a teacher's view-only instruction file, and we have other files, skip it to save payload space
            if (isOriginalMaterial && driveAttachments.length > 1) {
                continue;
            }

            // Fetch the file's history at the SAME time as its text, so the
            // integrity check adds essentially no extra waiting.
            const [exportData, fileIntegrity] = await Promise.all([
                exportGoogleDocToText(session.accessToken, fileId),
                isOriginalMaterial ? Promise.resolve(null) : getFileIntegrity(session.accessToken, fileId),
            ]);
            if (fileIntegrity) {
                integrityFiles.push({
                    ...fileIntegrity,
                    stats: exportData && !exportData.isBinary && typeof exportData.data === "string" && !exportData.data.startsWith("Fatal Error")
                        ? textStats(exportData.data)
                        : null,
                });
            }
            
            if (exportData) {
                if (exportData.isBinary) {
                    // Prevent pushing Vercel Serverless Function over 4.5MB by culling massive attachments
                    if (totalBinaryChars + exportData.data.length > BINARY_LIMIT && multipleBinaries.length > 0) {
                        console.warn(`Skipping attachment ${att.driveFile.title} to stay within Vercel body physical limits.`);
                        continue;
                    }
                    totalBinaryChars += exportData.data.length;

                    multipleBinaries.push({
                        data: exportData.data,
                        mimeType: exportData.mimeType,
                        title: att.driveFile.title || "Attached File"
                    });
                } else {
                    combinedText += `\n\n--- Attachment: ${att.driveFile.title || "File"} ---\n${exportData.data}`;
                }
            }
        }

        if (multipleBinaries.length === 0 && !combinedText.trim()) {
             throw new Error("Failed to export documents.");
        }

        // When did the student turn it in? (last TURNED_IN event in Classroom's history)
        let turnedInAt = null;
        for (const h of submission.submissionHistory || []) {
            if (h.stateHistory?.state === "TURNED_IN" && h.stateHistory.stateTimestamp) {
                if (!turnedInAt || h.stateHistory.stateTimestamp > turnedInAt) turnedInAt = h.stateHistory.stateTimestamp;
            }
        }

        return NextResponse.json({
            integrity: {
                files: integrityFiles,
                turnedInAt,
                viewerEmail: session.user?.email || null,
            },
            data: combinedText ? combinedText.trim() : "See attached student files.",
            isBinary: multipleBinaries.length > 0,
            multipleBinaries: multipleBinaries,
            mimeType: multipleBinaries.length > 0 ? multipleBinaries[0].mimeType : 'text/plain'
        });

    } catch (error) {
        console.error("API Route Error fetching specific submission:", error);

        if (error.status === 403) {
            return NextResponse.json({ error: "Permission Denied. Did you grant Google Drive and Forms access when logging in?" }, { status: 403 });
        }

        return NextResponse.json({ error: "Failed to fetch submission content" }, { status: 500 });
    }
}
