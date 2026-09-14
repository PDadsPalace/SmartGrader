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
        
        // Paginate studentSubmissions.list to get ALL student submissions
        let submissions = [];
        let subPageToken = undefined;
        do {
            const response = await classroom.courses.courseWork.studentSubmissions.list({
                courseId: courseId,
                courseWorkId: courseWorkId,
                pageSize: 100,
                pageToken: subPageToken,
            });
            if (response.data.studentSubmissions) {
                submissions = submissions.concat(response.data.studentSubmissions);
            }
            subPageToken = response.data.nextPageToken;
        } while (subPageToken);

        // Paginate students.list to get ALL enrolled student profiles in the course
        let students = [];
        let studentPageToken = undefined;
        do {
            const studentsResponse = await classroom.courses.students.list({
                courseId: courseId,
                pageSize: 100,
                pageToken: studentPageToken,
            });
            if (studentsResponse.data.students) {
                students = students.concat(studentsResponse.data.students);
            }
            studentPageToken = studentsResponse.data.nextPageToken;
        } while (studentPageToken);

        const studentMap = {};
        for (const student of students) {
            if (student.userId && student.profile) {
                studentMap[student.userId] = student.profile;
            }
        }

        // Fallback: If any student's userId wasn't in studentMap (e.g. co-teachers or removed students), fetch user profile directly
        for (const sub of submissions) {
            if (sub.userId && !studentMap[sub.userId]) {
                try {
                    const userProfileRes = await classroom.userProfiles.get({ userId: sub.userId });
                    if (userProfileRes.data && userProfileRes.data.name) {
                        studentMap[sub.userId] = userProfileRes.data;
                    }
                } catch (e) {
                    // Profile fetch failed (e.g. deleted user or restricted)
                }
            }
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
