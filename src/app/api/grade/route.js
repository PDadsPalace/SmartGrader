import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

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

        // Construct the Prompt
        const prompt = `
You are an expert high school teacher grading an assignment. You will evaluate the student's submission based on the provided rubric.

**TEACHER INSTRUCTIONS / RUBRIC:**
${rubric || "No specific rubric provided. Evaluate for general high school level clarity, accuracy, and grammar."}

**STUDENT CONTEXT (Keep this in mind for your feedback tone):**
${studentContext}

**GRADING STRICTNESS (1-10 Scale, 1 is easiest, 10 is hardest):**
The teacher has requested a strictness level of: ${strictness}/10. 
If the strictness is low, be very lenient and round up grades. If the strictness is high, be highly critical of minor errors.

**STUDENT SUBMISSION:**
"${submissionText}"
(If a binary file was attached, it has been provided to you directly as a document context. Please read it to grade the assignment.)

**MISSING WORK POLICY:**
If the STUDENT SUBMISSION is exactly "Empty document or non-text attachment." and there is no binary file attached, this means the student did not submit any work or it is completely blank.
In this case, you MUST give the student a default grade of 50. However, if the teacher's STUDENT CONTEXT notes explicitly state to give a 0 (or any other specific grade for missing work), you must follow the teacher's note instead.

**YOUR TASK:**
Evaluate the submission. You must return your evaluation strictly in the following JSON format without any markdown blocks or extra text:
{
  "suggested_grade": "A text representation of the score (e.g. 85/100, B+, 4/5)",
  "feedback_text": "A paragraph of constructive feedback written directly to the student."
}
`;

        let contentsData = [prompt];
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
        });

        // Parse the JSON string
        let parsedResult;
        try {
            // Get the text from the response safely
            const textValue = typeof response.text === 'function' ? response.text() : response.text;

            // Strip markdown blocks if Gemini accidentally includes them
            let rawText = textValue.replace(/```json/gi, "").replace(/```/g, "").trim();
            parsedResult = JSON.parse(rawText);
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
        return NextResponse.json({ error: "Failed to generate AI grade" }, { status: 500 });
    }
}
