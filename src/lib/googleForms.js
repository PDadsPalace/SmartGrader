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

        // 3b. Fallback matching using First and Last Name (Strict)
        if (!studentFormResponse && studentName) {
            const targetNameClean = studentName.toLowerCase().replace(/[^a-z0-9]/g, '');
            const targetParts = studentName.toLowerCase().split(' ').filter(p => p.length >= 3);
            const reverseNameClean = targetParts.slice().reverse().join("");
            
            let bestMatchResponse = null;
            let highestScore = 0;

            allResponses.forEach(r => {
                let score = 0;
                const answersObj = r.answers || {};
                const textAnswers = Object.values(answersObj)
                    .flatMap(a => a.textAnswers?.answers?.map(ans => ans.value.toLowerCase().trim()) || []);
                
                // Convert all answers to a concatenated squished string for absolute matching
                const fullTextSquished = textAnswers.join("").replace(/[^a-z0-9]/g, '');
                
                // Method A: Perfect squished match forwards or backwards
                if (targetNameClean.length > 3 && fullTextSquished.includes(targetNameClean)) {
                    score += 100;
                }
                if (reverseNameClean && reverseNameClean.length > 3 && fullTextSquished.includes(reverseNameClean)) {
                    score += 100;
                }
                
                // Method B: Exact isolated word matches
                const typedWords = textAnswers.flatMap(text => text.split(/[\s,.-]+/)).filter(w => w.length >= 3);
                for (const part of targetParts) {
                    if (typedWords.includes(part)) {
                        score += 50; // They typed "Logan" distinctly
                    } else if (typedWords.some(tw => tw.includes(part) || (part.length >= 5 && part.includes(tw)))) {
                        // Very strict partial match: 'tw' includes 'logan' OR 'logan' includes 'logann'
                        score += 10;
                    }
                }
                
                if (score > highestScore && score > 0) {
                    highestScore = score;
                    bestMatchResponse = r;
                }
            });
            
            // Require a threshold indicating at least one distinct naming match
            if (highestScore >= 10) {
                studentFormResponse = bestMatchResponse;
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
        
        // 5. Calculate Native Score if available
        let autoGrade = null;
        if (studentFormResponse.totalScore !== undefined) {
            // Google Forms only gives us the totalScore achievable by summing the points in the questions
            let maxPoints = 0;
            form.items?.forEach(item => {
                const points = item.questionItem?.question?.grading?.pointValue;
                if (points) maxPoints += points;
                
                // Also check grid questions
                item.questionGroupItem?.questions?.forEach(q => {
                    const rowPoints = q.grading?.pointValue;
                    if (rowPoints) maxPoints += rowPoints;
                });
            });
            
            if (maxPoints > 0) {
                 // Calculate percentage 0-100 to match the rest of the application
                 autoGrade = Math.round((studentFormResponse.totalScore / maxPoints) * 100).toString();
                 compiledText = `[NATIVE GRADE: ${studentFormResponse.totalScore} / ${maxPoints} (${autoGrade}%)]\n\n` + compiledText;
            }
        }

        return {
            isBinary: false,
            mimeType: 'text/plain',
            content: compiledText,
            nativeGrade: autoGrade // Pass this back so page.js can skip AI processing if desired
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
