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
        let maxAutoPoints = 0;
        let maxManualPoints = 0;

        form.items.forEach(item => {
            if (item.questionItem && item.questionItem.question) {
                const q = item.questionItem.question;
                const points = q.grading?.pointValue || 0;
                const correctAnswers = q.grading?.correctAnswers?.answers?.map(a => a.value) || [];
                
                if (correctAnswers.length > 0) {
                    maxAutoPoints += points;
                } else if (points > 0) {
                    // It has points but no correct answers defined -> Essay / Short Answer
                    maxManualPoints += points;
                }

                questionMap[q.questionId] = {
                    title: item.title || "Untitled Question",
                    correctAnswers: correctAnswers,
                    points: points,
                    isManual: correctAnswers.length === 0 && points > 0
                };
            } else if (item.questionGroupItem && item.questionGroupItem.questions) {
                // Handle grid/matrix questions if any
                item.questionGroupItem.questions.forEach(q => {
                    const rowPoints = q.grading?.pointValue || 0;
                    const rowAnswers = q.grading?.correctAnswers?.answers?.map(a => a.value) || [];
                    
                    if (rowAnswers.length > 0) {
                         maxAutoPoints += rowPoints;
                    } else if (rowPoints > 0) {
                         maxManualPoints += rowPoints;
                    }

                    questionMap[q.questionId] = {
                        title: `${item.title || "Group"} - Row`,
                        correctAnswers: rowAnswers,
                        points: rowPoints,
                        isManual: rowAnswers.length === 0 && rowPoints > 0
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

            compiledText += `Question: ${qInfo.title} (Worth: ${qInfo.points} pts)\n`;
            compiledText += `Student Answer: ${answerText}\n`;

            if (qInfo.isManual) {
                compiledText += `[AI INSTRUCTION FOR THIS QUESTION]: This is a manual-grade essay/short-answer question. Evaluate the student's answer based on the teacher's rubric and assign a score up to the maximum ${qInfo.points} points.\n`;
            } else if (qInfo.correctAnswers && qInfo.correctAnswers.length > 0) {
                compiledText += `[NATIVE FORM ANSWER KEY]: The correct answer programmed into the Google Form Quiz is: ${qInfo.correctAnswers.join(" OR ")}\n`;
            }

            compiledText += `\n------------------------\n\n`;
        }
        
        // 5. Calculate Native Score if available
        let autoGrade = null;
        const totalMaxPoints = maxAutoPoints + maxManualPoints;

        if (studentFormResponse.totalScore !== undefined) {
            // studentFormResponse.totalScore represents the points they got from the strictly auto-graded section
            const earnedAutoPoints = studentFormResponse.totalScore;
            
            if (maxManualPoints > 0) {
                 // The form has essays. We MUST NOT return a nativeGrade so the system sends it to the AI.
                 // We will append a header instructing the AI on the exact math to perform.
                 let header = `====================================================\n`;
                 header += `!!! ATTENTION AI GRADER: MIXED FORMAT GOOGLE FORM !!!\n`;
                 header += `This Google Form contains both auto-graded multiple-choice questions AND manual-grade essays.\n`;
                 header += `[POINTS ALREADY EARNED]: The student scored ${earnedAutoPoints} out of ${maxAutoPoints} on the auto-graded questions.\n`;
                 header += `[PENDING MANUAL POINTS]: There are ${maxManualPoints} points worth of essays below that need your evaluation.\n`;
                 header += `[FINAL GRADE MATH]: You MUST grade the essays below, give them a score out of ${maxManualPoints}, add that score to the ${earnedAutoPoints} already earned, and return the final percentage out of ${totalMaxPoints}.\n`;
                 header += `====================================================\n\n`;
                 
                 compiledText = header + compiledText;
            } else if (totalMaxPoints > 0) {
                 // 100% strictly auto-graded Google Form (No essays). We can return the native percentage directly and skip AI.
                 autoGrade = Math.round((earnedAutoPoints / totalMaxPoints) * 100).toString();
                 compiledText = `[NATIVE GRADE: ${earnedAutoPoints} / ${totalMaxPoints} (${autoGrade}%)]\n\n` + compiledText;
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
