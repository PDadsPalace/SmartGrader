import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { recordUsage } from "@/lib/usage";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.email) {
            return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
        }

        const body = await request.json();
        const { assignmentName, maxPoints = 100, courseName = "", pastRubrics = [] } = body;

        if (!assignmentName) {
            return NextResponse.json({ error: "Assignment name is required" }, { status: 400 });
        }

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: "Missing Gemini API Key." }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        let pastRubricsSection = "";
        if (Array.isArray(pastRubrics) && pastRubrics.length > 0) {
            pastRubricsSection = `\n\n**TEACHER'S HISTORICAL RUBRICS & GRADING PATTERNS (STUDY THESE TO LEARN THEIR STYLE):**\n` +
                pastRubrics.slice(0, 10).map((item, idx) => {
                    const title = item.assignmentName || `Past Assignment ${idx + 1}`;
                    const text = item.rubricText || item;
                    return `--- Past Rubric ${idx + 1}: "${title}" ---\n${text}`;
                }).join("\n\n");
        } else {
            pastRubricsSection = "\n\n(No past rubric history found yet. Generate a clean, high-school level grading rubric with clear point allocations.)";
        }

        const systemInstruction = `
You are an intelligent AI assistant for a high school teacher. Your task is to generate a custom grading rubric / answer key guide for an assignment titled "${assignmentName}".

Points Possible: ${maxPoints}
Course Context: ${courseName || "High School Course"}

${pastRubricsSection}

**YOUR TASK:**
1. Analyze the teacher's past rubrics above (if available) to learn their formatting, bullet style, scoring categories, strictness, and tone.
2. Synthesize a smart, highly tailored grading rubric for "${assignmentName}" (${maxPoints} points).
3. Follow the teacher's preferred style (e.g. 4-category breakdowns, point deduction rules, or specific criteria bullets) so it feels like they wrote it themselves.
4. Return ONLY the rubric text as plain formatted text with bullet points and clear category headings. Do not include markdown code block quotes.
`;

        const userPrompt = `Generate a smart grading rubric for the assignment titled "${assignmentName}" worth ${maxPoints} points based on my historical grading patterns.`;

        let retries = 0;
        const maxRetries = 3;
        let response;
        let lastError;

        while (retries < maxRetries) {
            try {
                response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [userPrompt],
                    config: {
                        systemInstruction: systemInstruction,
                        temperature: 0.2
                    }
                });
                await recordUsage({ email: session.user.email, route: "smart-rubric", response });
                break;
            } catch (apiErr) {
                lastError = apiErr;
                retries++;
                const backoffMs = Math.pow(2, retries) * 1000;
                if (retries >= maxRetries) throw lastError;
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
        }

        const rubricText = typeof response.text === 'function' ? response.text() : response.text;

        return NextResponse.json({
            rubric: rubricText ? rubricText.trim() : ""
        });

    } catch (error) {
        console.error("Smart Rubric Generation Error:", error);
        return NextResponse.json({ error: "Failed to generate smart rubric", details: error.message }, { status: 500 });
    }
}
