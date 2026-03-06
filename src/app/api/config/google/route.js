import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        clientId: process.env.GOOGLE_CLIENT_ID,
        apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || ''
    });
}
