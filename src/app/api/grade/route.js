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
If the submission begins with "!!! ATTENTION AI GRADER: MIXED FORMAT GOOGLE FORM !!!", you are taking over grading for a form that contains BOTH multiple-choice (auto-graded) and essay (manual-grade) questions.
1. The header will tell you exactly how many points the student ALREADY EARNED on the auto-graded questions.
2. The header will tell you exactly how many PENDING MANUAL POINTS the essays are worth.
3. You must read the teacher's rubric carefully. Evaluate ONLY the manual-grade essays based on the rubric.
4. Assign a score to the essays (e.g., they earned 40 out of the 50 pending points).
5. Finally, ADD your essay score to the points they ALREADY EARNED. Divide that sum by the total possible points to get the final percentage out of 100. RETURN THAT FINAL PERCENTAGE. DO NOT return just the essay score!

**YOUR TASK:**
Evaluate the submission. You must return your evaluation strictly in the following JSON format:
{
  "suggested_grade": "A number between 0 and 100 representing the score. YOU MUST return ONLY the raw integer (e.g., 85). DO NOT add '/100', DO NOT use a percent sign (%), DO NOT return a letter grade.",
  "feedback_text": "A paragraph of constructive feedback written directly to the student. If this was a mixed-format form, explain how many points they got on the essays vs the auto-graded section so they understand their final grade."
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

        // Call Gemini 2.5 Flash
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contentsData,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json"
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
