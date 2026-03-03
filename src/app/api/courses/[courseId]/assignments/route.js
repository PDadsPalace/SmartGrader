import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getCourseAssignments } from "@/lib/googleClassroom";
import { NextResponse } from "next/server";

export async function GET(request, { params }) {
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { courseId } = await params;

        if (!courseId) {
            return NextResponse.json({ error: "Course ID is required" }, { status: 400 });
        }

        const assignments = await getCourseAssignments(session.accessToken, courseId);
        return NextResponse.json({ assignments });
    } catch (error) {
        console.error(`API Route Error for course ${params.courseId}:`, error);
        return NextResponse.json({ error: "Failed to fetch assignments" }, { status: 500 });
    }
}
