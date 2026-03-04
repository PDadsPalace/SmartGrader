import { google } from "googleapis";

export function getFormsClient(accessToken) {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ access_token: accessToken });
    return google.forms({ version: "v1", auth });
}

export async function extractGoogleFormResponse(accessToken, formId, studentEmail) {
    try {
        const forms = getFormsClient(accessToken);

        // 1. Fetch Form Metadata (Questions)
        const formResponse = await forms.forms.get({ formId });
        const form = formResponse.data;

        if (!form.items || form.items.length === 0) {
            return {
                isBinary: false,
                mimeType: 'text/plain',
                data: "Error: Could not retrieve questions from this Google Form. It may be empty or improperly formatted."
            };
        }

        // Map Question IDs to Question Titles
        const questionMap = {};
        form.items.forEach(item => {
            if (item.questionItem && item.questionItem.question) {
                questionMap[item.questionItem.question.questionId] = item.title || "Untitled Question";
            } else if (item.questionGroupItem && item.questionGroupItem.questions) {
                // Handle grid/matrix questions if any
                item.questionGroupItem.questions.forEach(q => {
                    questionMap[q.questionId] = `${item.title || "Group"} - Row`;
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
                data: `No responses found for this Google Form yet.`
            };
        }

        // 3. Find the student's response using email
        const targetEmail = studentEmail.toLowerCase();
        let studentFormResponse = allResponses.find(r =>
            r.respondentEmail && r.respondentEmail.toLowerCase() === targetEmail
        );

        if (!studentFormResponse) {
            // Fuzzy fallback: If email wasn't explicitly collected but maybe they typed it in a question?
            return {
                isBinary: false,
                mimeType: 'text/plain',
                data: `Error: Could not find a Google Form submission for ${studentEmail}. Note: The teacher MUST enable 'Collect Email Addresses' in the Google Form settings for the AI to dynamically link students to their answers.`
            };
        }

        // 4. Stitch Answers with Questions
        let compiledText = `Google Form Responses for: ${studentEmail}\n`;
        compiledText += `Form Title: ${form.info?.title || "Untitled Form"}\n`;
        compiledText += `====================================================\n\n`;

        const answers = studentFormResponse.answers || {};

        for (const [questionId, answerObj] of Object.entries(answers)) {
            const questionText = questionMap[questionId] || "Unknown Question";
            const answerText = answerObj.textAnswers?.answers?.map(a => a.value).join(", ") || "No Answer / Blank";

            compiledText += `Question: ${questionText}\n`;
            compiledText += `Student Answer: ${answerText}\n\n`;
            compiledText += `------------------------\n\n`;
        }

        return {
            isBinary: false,
            mimeType: 'text/plain',
            data: compiledText
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
