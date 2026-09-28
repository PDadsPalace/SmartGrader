import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.email) {
            return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
        }

        const body = await request.json();
        const {
            submissionText,
            rubric,
            assignedGrade,
            feedback,
            studentName = "Student",
            studentNotes = "",
            maxPoints = 100,
            learnedRules = []
        } = body;

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: "Missing Gemini API Key in server environment." }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        let rulesText = "";
        if (Array.isArray(learnedRules) && learnedRules.length > 0) {
            rulesText = "\n\n**TEACHER LEARNED RULES APPLIED:**\n" +
                learnedRules.map((r, i) => `${i + 1}. ${typeof r === 'string' ? r : r.ruleText}`).join("\n");
        }

        const systemInstruction = `
You are a helpful, transparent AI grading assistant. 
A teacher wants to know: "Why did you give ${studentName} a grade of ${assignedGrade} out of ${maxPoints}?"

**ASSIGNMENT RUBRIC / INSTRUCTIONS:**
${rubric || "No specific rubric provided."}
${rulesText}

**STUDENT CONTEXT:**
${studentNotes || "None"}

**YOUR TASK:**
Explain in 2 to 4 clear, concise bullet points why this specific score of ${assignedGrade}/${maxPoints} was assigned.
- Explicitly point out what the student did correctly (strengths).
- Explicitly point out where points were deducted or what was missing/incorrect.
- Mention how strictness or specific rubric criteria affected the final grade.
Keep your answer clear, polite, and direct so the teacher can understand your reasoning immediately.
`;

        const userPrompt = `
STUDENT SUBMISSION:
"${(submissionText || "").substring(0, 4000)}"

AI PREVIOUS FEEDBACK TO STUDENT:
"${feedback || "N/A"}"

Please explain why ${studentName} received ${assignedGrade}/${maxPoints}.
`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [userPrompt],
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.2
            }
        });

        const explanationText = typeof response.text === 'function' ? response.text() : response.text;

        return NextResponse.json({
            explanation: explanationText || "No explanation could be generated."
        });

    } catch (error) {
        console.error("AI Explanation Error:", error);
        return NextResponse.json({ error: "Failed to generate AI explanation.", details: error.message }, { status: 500 });
    }
}
