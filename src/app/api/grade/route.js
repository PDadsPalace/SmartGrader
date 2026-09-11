import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

export const maxDuration = 60; // 60 seconds timeout (maximum for Vercel Free tier)
export const dynamic = 'force-dynamic';

// For this prototype we're creating a mock "database" of student metadata
// In a real application, this would be an actual database table keyed by student ID/email
const MOCK_STUDENT_METADATA = {
    // We'll use a generic fallback for the prototype since we don't have real IDs yet
    "default": "This student occasionally struggles with run-on sentences. Be encouraging but firm on grammar."
};

export async function POST(request) {
    try {
        // ─── Security: Check Session ───
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.email) {
            return NextResponse.json({ error: "Unauthorized. Please log in to grade assignments." }, { status: 401 });
        }

        const body = await request.json();
        const { submissionText, rubric, strictness, studentId, studentNotes, rubricFile, studentFile, studentFiles, generateFeedback = false, maxPoints = 100, pastExemplars = [] } = body;

        if (!submissionText) {
            return NextResponse.json({ error: "No submission text provided" }, { status: 400 });
        }

        // Initialize Gemini (Requires GEMINI_API_KEY in .env)
        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: "Missing Gemini API Key. Please add it to your .env.local file." }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const studentContext = studentNotes || "No specific instructions provided for this student.";

        let exemplarsSection = "";
        if (Array.isArray(pastExemplars) && pastExemplars.length > 0) {
            exemplarsSection = `\n\n**TEACHER MANUAL GRADE ADJUSTMENTS & EXEMPLARS FROM PREVIOUS STUDENTS/CLASSES:**\nThe teacher has previously reviewed and manually adjusted grades for this assignment. Use these actual teacher decisions to calibrate your strictness, partial credit decisions, and grading style:\n` +
            pastExemplars.slice(0, 6).map((ex, idx) => `[Teacher Example ${idx + 1}]:\nStudent Text Snippet: "${ex.textSnippet || 'N/A'}"\nTeacher Assigned Grade: ${ex.grade}${ex.feedback ? `\nTeacher Feedback/Note: "${ex.feedback}"` : ''}`).join("\n\n");
        }

        // Construct the Prompt and System Instructions
        const systemInstruction = `
You are an expert high school teacher grading an assignment. You will evaluate the student's submission based on the provided rubric.

**TEACHER INSTRUCTIONS / RUBRIC:**
${rubric || "No specific rubric provided. Evaluate for general high school level clarity, accuracy, and grammar."}
${exemplarsSection}

**STUDENT CONTEXT (Keep this in mind for your feedback tone):**
${studentContext}

**GRADING STRICTNESS (1-10 Scale, 1 is easiest, 10 is hardest):**
The teacher has requested a strictness level of: ${strictness}/10. 
If the strictness is low, be very lenient and round up grades. If the strictness is high, be highly critical of minor errors.

**SUBMISSION LENGTH & EFFORT AWARENESS:**
Evaluate whether the student's submission text reflects genuine effort and completeness relative to typical expectations. If an assignment expects multi-paragraph or detailed responses and the submission is only 1-2 short sentences or low effort, deduct points accordingly for lack of thoroughness.

**EVALUATION REASONING & CONFIDENCE:**
Analyze the submission step-by-step against each requirement. Assess your confidence in grading this submission. Set confidence to "high" if clear, "medium" if partially ambiguous or minor format issues exist, or "low" if the text is blurry, truncated, or highly ambiguous.

**CRITICAL MISSING WORK POLICY (READ CAREFULLY):**
You MUST first determine if the student submitted any actual work. 
If the STUDENT SUBMISSION is "Empty document or non-text attachment." OR if the attached binary file (like a PDF or image) is completely blank, contains only empty grids, has no text, or shows no meaningful attempt at the assignment, you MUST give the student a grade of exactly 0. 
DO NOT grade them against the answer key if they submitted nothing. A blank file is a 0. Do NOT give a 100 for a blank document!

**MIXED FORMAT GOOGLE FORMS (CRITICAL SCORING LOGIC):**
If the submission begins with "!!! ATTENTION AI GRADER: MIXED FORMAT GOOGLE FORM !!!", this form has BOTH auto-graded multiple-choice AND manual-grade essay questions.
1. The auto-graded questions are ALREADY SCORED — ignore them completely.
2. Your job is to evaluate ONLY the questions marked [AI INSTRUCTION FOR THIS QUESTION] in the submission.
3. Grade each essay question using the teacher's rubric and assign it a raw point score.
4. Sum all your essay raw scores into one total number.
5. Return ONLY that raw essay total as "suggested_grade". Do NOT add the auto-graded points. Do NOT calculate a percentage. The system applies the final formula automatically.

**YOUR TASK:**
Evaluate the submission. You must return your evaluation strictly in JSON format.

IF the submission is a MIXED FORMAT GOOGLE FORM (it begins with "!!! ATTENTION AI GRADER..."):
Return the raw essay total sum as instructed above. DO NOT normalize this to ${maxPoints}.

IF the submission is a REGULAR DOCUMENT OR OTHER FILE:
The assignment is worth a maximum of ${maxPoints} points. You MUST calculate and return the final numeric score proportionally scaled out of ${maxPoints}. 
Make sure your "suggested_grade" natively matches the ${maxPoints} point scale (for example, if they got everything right, return ${maxPoints}). Do NOT treat the grade as a generic percentage unless maxPoints is 100.

${generateFeedback 
    ? `- Include a "suggested_grade" key with your final numeric score.\n- Include a "feedback_text" key with a paragraph of constructive feedback directly to the student.\n- Include a "confidence" key ("high", "medium", or "low").`
    : `- Include a "suggested_grade" key and a "confidence" key ("high", "medium", or "low").`
}
`;

        const userPrompt = `
=========================================
--- START OF ACTUAL STUDENT SUBMISSION ---
=========================================

TEXT SUBMISSION:
"${submissionText}"

(If a binary file was attached, it has been provided to you alongside this text as a document context. Please read it to grade the assignment.)

CRITICAL REMINDER: Look closely at the student's file and text. If both are completely blank, unreadable, or show no attempt at the assignment, YOU MUST RETURN EXACTLY 0. DO NOT grade the Master Answer Key instead!

=========================================
--- END OF STUDENT SUBMISSION ---
=========================================
`;


        let contentsData = [userPrompt];
        if (rubricFile && rubricFile.data) {
            contentsData.push({
                inlineData: {
                    data: rubricFile.data,
                    mimeType: rubricFile.mimeType
                }
            });
        }
        if (studentFiles && Array.isArray(studentFiles)) {
            for (const sf of studentFiles) {
                contentsData.push({
                    inlineData: {
                        data: sf.data,
                        mimeType: sf.mimeType
                    }
                });
            }
        } else if (studentFile && studentFile.data) {
            contentsData.push({
                inlineData: {
                    data: studentFile.data,
                    mimeType: studentFile.mimeType
                }
            });
        }

        const responseSchema = {
            type: "object",
            properties: {
                suggested_grade: {
                    type: "string",
                    description: "The numeric score earned."
                },
                confidence: {
                    type: "string",
                    description: "AI confidence level: high, medium, or low."
                },
                ...(generateFeedback ? {
                    feedback_text: {
                        type: "string",
                        description: "Constructive feedback for the student."
                    }
                } : {})
            },
            required: ["suggested_grade"]
        };

        // Call Gemini 2.5 Flash with Retry Logic (Bulletproof Form Feature)
        let response;
        let retries = 0;
        let lastError;
        
        while (retries < 2) {
            try {
                response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: contentsData,
                    config: {
                        systemInstruction: systemInstruction,
                        responseMimeType: "application/json",
                        responseSchema: responseSchema,
                        temperature: 0.1
                    }
                });
                break;
            } catch (apiErr) {
                lastError = apiErr;
                retries++;
                console.log(`Gemini API call failed (Attempt ${retries}). Retrying...`, apiErr.message);
                if (retries >= 2) throw lastError;
                // Wait 1 second before retry to allow rate limits to cool down
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Parse the JSON string
        let parsedResult;
        try {
            const textValue = typeof response.text === 'function' ? response.text() : response.text;
            parsedResult = JSON.parse(textValue);
        } catch (parseError) {
            const textValue = typeof response.text === 'function' ? response.text() : response.text;
            console.error("Failed to parse Gemini JSON:", textValue, parseError);
            return NextResponse.json({ error: "AI returned a malformed response." }, { status: 500 });
        }

        return NextResponse.json({
            grade: parsedResult.suggested_grade,
            feedback: parsedResult.feedback_text,
            confidence: parsedResult.confidence || "high"
        });

    } catch (error) {
        console.error("Gemini Grading Error:", error);
        return NextResponse.json({ error: "Failed to generate AI grade", details: error.message, stack: error.stack }, { status: 500 });
    }
}
