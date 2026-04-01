import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

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
        const body = await request.json();
        const { submissionText, rubric, strictness, studentId, studentNotes, rubricFile, studentFile, generateFeedback = true } = body;

        if (!submissionText) {
            return NextResponse.json({ error: "No submission text provided" }, { status: 400 });
        }

        // Initialize Gemini (Requires GEMINI_API_KEY in .env)
        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: "Missing Gemini API Key. Please add it to your .env.local file." }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const studentContext = studentNotes || "No specific instructions provided for this student.";

        // Construct the Prompt and System Instructions
        const systemInstruction = `
You are an expert high school teacher grading an assignment. You will evaluate the student's submission based on the provided rubric.

**TEACHER INSTRUCTIONS / RUBRIC:**
${rubric || "No specific rubric provided. Evaluate for general high school level clarity, accuracy, and grammar."}

**STUDENT CONTEXT (Keep this in mind for your feedback tone):**
${studentContext}

**GRADING STRICTNESS (1-10 Scale, 1 is easiest, 10 is hardest):**
The teacher has requested a strictness level of: ${strictness}/10. 
If the strictness is low, be very lenient and round up grades. If the strictness is high, be highly critical of minor errors.

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
${generateFeedback 
    ? `- Include a "suggested_grade" key with the raw score.\n- Include a "feedback_text" key with a paragraph of constructive feedback directly to the student.`
    : `- Only return a "suggested_grade" key. Do NOT generate feedback text to maximize speed.`
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
        if (studentFile && studentFile.data) {
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
                    description: "A number between 0 and 100 representing the score. YOU MUST return ONLY the raw integer (e.g., 85)."
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

        // Call Gemini 2.5 Flash
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contentsData,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.1
            }
        });

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
            feedback: parsedResult.feedback_text
        });

    } catch (error) {
        console.error("Gemini Grading Error:", error);
        return NextResponse.json({ error: "Failed to generate AI grade", details: error.message, stack: error.stack }, { status: 500 });
    }
}
