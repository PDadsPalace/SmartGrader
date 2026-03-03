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
        const { courseId } = await params;
        const body = await request.json();

        let { title, description, maxPoints, dueDate, dueTime, attachments } = body;

        // Google Classroom requires a dueTime if a dueDate is populated
        if (dueDate && !dueTime) {
            dueTime = "23:59:59";
        }

        if (!courseId || !title) {
            return NextResponse.json({ error: "Missing required fields (Course ID and Title)" }, { status: 400 });
        }

        const classroom = getClassroomClient(session.accessToken);

        // Construct coursework payload base
        const courseworkInput = {
            title: title,
            description: description || undefined,
            maxPoints: maxPoints || 100,
            workType: 'ASSIGNMENT',
            state: 'PUBLISHED',
        };

        // Handle Date parsing if provided (format from input type="date" is YYYY-MM-DD)
        if (dueDate) {
            const parts = dueDate.split('-');
            if (parts.length === 3) {
                courseworkInput.dueDate = {
                    year: parseInt(parts[0], 10),
                    month: parseInt(parts[1], 10),
                    day: parseInt(parts[2], 10)
                };
            }
        }

        // Handle Time parsing if provided (format from input type="time" is HH:MM or HH:MM:SS)
        if (dueTime) {
            const parts = dueTime.split(':');
            if (parts.length >= 2) {
                courseworkInput.dueTime = {
                    hours: parseInt(parts[0], 10),
                    minutes: parseInt(parts[1], 10),
                    seconds: parts.length > 2 ? parseInt(parts[2], 10) : 0,
                    nanos: 0
                };
            }
        }

        // Handle Attachments
        if (attachments && attachments.length > 0) {
            courseworkInput.materials = attachments
                .filter(a => a.url && a.url.trim() !== "")
                .map(a => {
                    // Let Google automatically identify links
                    return {
                        link: { url: a.url }
                    };
                });
        }

        const targetCourseIds = body.targetCourseIds || [courseId];
        const assignmentsCreated = [];

        for (const targetId of targetCourseIds) {
            try {
                const targetInput = { ...courseworkInput };

                // Apply per-course custom publish schedule if enabled
                if (body.targetCourseISO && body.targetCourseISO[targetId]) {
                    targetInput.scheduledTime = body.targetCourseISO[targetId];
                    targetInput.state = 'DRAFT';
                }

                const response = await classroom.courses.courseWork.create({
                    courseId: targetId,
                    requestBody: targetInput
                });
                assignmentsCreated.push(response.data);
            } catch (err) {
                console.error(`Failed to create assignment in course ${targetId}:`, err);
                throw err;
            }
        }

        return NextResponse.json({ success: true, assignment: assignmentsCreated[0], assignments: assignmentsCreated });

    } catch (error) {
        console.error("API Route Error creating assignment:", error);

        if (error.status === 403) {
            return NextResponse.json({ error: "Permission denied. Please ensure you have granted Classroom edit access." }, { status: 403 });
        }
        return NextResponse.json({ error: `Failed to create assignment: ${error.message || "Unknown error"}` }, { status: 500 });
    }
}
