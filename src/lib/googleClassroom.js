import { google } from "googleapis";

// Initialize the Google Classroom client using an OAuth2 access token
export function getClassroomClient(accessToken) {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ access_token: accessToken });
    return google.classroom({ version: "v1", auth });
}

// Fetch the list of courses the user is teaching
export async function getActiveCourses(accessToken) {
    try {
        const classroom = getClassroomClient(accessToken);
        const response = await classroom.courses.list({
            courseStates: ["ACTIVE"],
            teacherId: "me", // Only get courses where the user is a teacher
        });
        return response.data.courses || [];
    } catch (error) {
        console.error("Error fetching courses:", error);
        return [];
    }
}

// Fetch assignments (courseWork) for a specific course
export async function getCourseAssignments(accessToken, courseId) {
    try {
        const classroom = getClassroomClient(accessToken);
        const response = await classroom.courses.courseWork.list({
            courseId: courseId,
            courseWorkStates: ["PUBLISHED"], // Only published assignments
        });
        return response.data.courseWork || [];
    } catch (error) {
        console.error(`Error fetching assignments for course ${courseId}:`, error);
        return [];
    }
}

// Fetch submissions for a specific assignment
export async function getAssignmentSubmissions(accessToken, courseId, courseWorkId) {
    try {
        const classroom = getClassroomClient(accessToken);
        const response = await classroom.courses.courseWork.studentSubmissions.list({
            courseId: courseId,
            courseWorkId: courseWorkId,
        });

        const submissions = response.data.studentSubmissions || [];

        // For this prototype, we will try to fetch the student profiles
        // to associate names with the submission IDs
        const studentsResponse = await classroom.courses.students.list({
            courseId: courseId,
        });
        const students = studentsResponse.data.students || [];
        const studentMap = {};
        for (const student of students) {
            studentMap[student.userId] = student.profile;
        }

        // Attach student profiles to submissions
        return submissions.map(sub => ({
            ...sub,
            studentProfile: studentMap[sub.userId] || { name: { fullName: "Unknown Student" } }
        }));
    } catch (error) {
        console.error(`Error fetching submissions for assignment ${courseWorkId}:`, error);
        return [];
    }
}
