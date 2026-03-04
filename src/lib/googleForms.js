import { google } from "googleapis";

export function getFormsClient(accessToken) {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ access_token: accessToken });
    return google.forms({ version: "v1", auth });
}

export async function extractGoogleFormResponse(accessToken, formId, studentEmail, studentName) {
    try {
        const forms = getFormsClient(accessToken);

        // 1. Fetch Form Metadata (Questions)
        const formResponse = await forms.forms.get({ formId });
        const form = formResponse.data;

        if (!form.items || form.items.length === 0) {
            return {
                isBinary: false,
                mimeType: 'text/plain',
                content: "Error: Could not retrieve questions from this Google Form. It may be empty or improperly formatted."
            };
        }

        const questionMap = {};
        form.items.forEach(item => {
            if (item.questionItem && item.questionItem.question) {
                const q = item.questionItem.question;
                questionMap[q.questionId] = {
                    title: item.title || "Untitled Question",
                    correctAnswers: q.grading?.correctAnswers?.answers?.map(a => a.value) || []
                };
            } else if (item.questionGroupItem && item.questionGroupItem.questions) {
                // Handle grid/matrix questions if any
                item.questionGroupItem.questions.forEach(q => {
                    questionMap[q.questionId] = {
                        title: `${item.title || "Group"} - Row`,
                        correctAnswers: q.grading?.correctAnswers?.answers?.map(a => a.value) || []
                    };
                });
            }
        });

        // 2. Fetch Form Responses
        const responsesObj = await forms.forms.responses.list({ formId });
        const allResponses = responsesObj.data.responses || [];

        if (allResponses.length === 0) {
            return {
                isBinary: false,
                mimeType: 'text/plain',
                content: `No responses found for this Google Form yet.`
            };
        }

        // 3. Find the student's response using email
        let studentFormResponse = null;

        if (studentEmail) {
            const targetEmail = studentEmail.toLowerCase();
            studentFormResponse = allResponses.find(r =>
                r.respondentEmail && r.respondentEmail.toLowerCase() === targetEmail
            );
        }

        // 3b. Fallback matching using First and Last Name
        if (!studentFormResponse && studentName) {
            const targetName = studentName.toLowerCase();
            // Filter out initials or short parts to avoid false positives
            const nameParts = targetName.split(' ').filter(p => p.length >= 3);

            if (nameParts.length > 0) {
                studentFormResponse = allResponses.find(r => {
                    const answersObj = r.answers || {};
                    // Concatenate EVERY text answer the student submitted into one giant string
                    const allTextInResponse = Object.values(answersObj)
                        .map(a => a.textAnswers?.answers?.map(ans => ans.value.toLowerCase()).join(' ') || '')
                        .join(' ');

                    // Check if *all* parts of their name appear SOMEWHERE in their answers (e.g. typing Daniel in Q1, Figueroa in Q2)
                    return nameParts.every(part => allTextInResponse.includes(part));
                });
            }
        }

        if (!studentFormResponse) {
            return {
                isBinary: false,
                mimeType: 'text/plain',
                content: `Error: Could not find a Google Form submission for '${studentName || studentEmail}'. Note: Because your school hides student emails, the AI tried to search the form answers for the student's name, but failed. Ensure the Google Form explicitly asks the student for their First and Last name!`
            };
        }

        // 4. Stitch Answers with Questions
        let compiledText = `Google Form Responses for: ${studentEmail}\n`;
        compiledText += `Form Title: ${form.info?.title || "Untitled Form"}\n`;
        compiledText += `====================================================\n\n`;

        const answers = studentFormResponse.answers || {};

        for (const [questionId, answerObj] of Object.entries(answers)) {
            const qInfo = questionMap[questionId] || { title: "Unknown Question", correctAnswers: [] };
            const answerText = answerObj.textAnswers?.answers?.map(a => a.value).join(", ") || "No Answer / Blank";

            compiledText += `Question: ${qInfo.title}\n`;
            compiledText += `Student Answer: ${answerText}\n`;

            if (qInfo.correctAnswers && qInfo.correctAnswers.length > 0) {
                compiledText += `[NATIVE FORM ANSWER KEY]: The correct answer programmed into the Google Form Quiz is: ${qInfo.correctAnswers.join(" OR ")}\n`;
            }

            compiledText += `\n------------------------\n\n`;
        }

        return {
            isBinary: false,
            mimeType: 'text/plain',
            content: compiledText
        };

    } catch (error) {
        console.error(`Error extracting Google Form ${formId}:`, error);
        return {
            isBinary: false,
            mimeType: 'text/plain',
            data: `Fatal Error: The system failed to extract data from this Google Form. Ensure you have authorized the app with the correct permissions. Details: ${error.message}`
        };
    }
}
