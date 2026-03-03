import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from "next/server";

export async function GET(request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: "Missing URL parameter" }, { status: 400 });
    }

    try {
        // Fetch the thumbnail using the server-side OAuth access token
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${session.accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch thumbnail: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();

        // Pass the image buffer through to the client
        return new NextResponse(buffer, {
            headers: {
                "Content-Type": response.headers.get("content-type") || "image/jpeg",
                "Cache-Control": "public, max-age=86400" // Cache thumbnails for a day
            }
        });

    } catch (error) {
        console.error("Error proxying thumbnail:", error);
        return NextResponse.json({ error: "Failed to load thumbnail" }, { status: 500 });
    }
}
