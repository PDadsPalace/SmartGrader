import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// Google access tokens last ~1 hour. This trades the saved refresh token for a fresh one
// so teachers don't get errors mid-grading. If it fails, session.error tells the app to
// ask the teacher to sign in again.
async function refreshAccessToken(token) {
    if (!token.refreshToken) {
        return { ...token, error: "RefreshAccessTokenError" };
    }
    try {
        const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                grant_type: "refresh_token",
                refresh_token: token.refreshToken,
            }),
        });
        const data = await response.json();
        if (!response.ok) throw data;

        return {
            ...token,
            accessToken: data.access_token,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
            // Google usually doesn't send a new refresh token; keep the old one.
            refreshToken: data.refresh_token ?? token.refreshToken,
            error: undefined,
        };
    } catch (error) {
        console.error("Google token refresh failed:", error?.error || error);
        return { ...token, error: "RefreshAccessTokenError" };
    }
}

export const authOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
                params: {
                    scope: "openid email profile https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.students.readonly https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.profile.emails https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/classroom.coursework.students https://www.googleapis.com/auth/classroom.coursework.me https://www.googleapis.com/auth/forms.responses.readonly https://www.googleapis.com/auth/forms.body.readonly",
                    prompt: "consent select_account",
                    access_type: "offline",
                    response_type: "code",
                },
            },
        }),
    ],
    callbacks: {
        async jwt({ token, account }) {
            // First sign-in: save Google's tokens and when the access token runs out.
            if (account) {
                return {
                    ...token,
                    accessToken: account.access_token,
                    refreshToken: account.refresh_token,
                    expiresAt: account.expires_at
                        ? account.expires_at * 1000
                        : Date.now() + (account.expires_in || 3600) * 1000,
                    error: undefined,
                };
            }

            // Still valid (with a 2-minute safety margin) → keep using it.
            if (token.expiresAt && Date.now() < token.expiresAt - 2 * 60 * 1000) {
                return token;
            }

            // Expired (or an older session with no expiry saved) → ask Google for a new one.
            return refreshAccessToken(token);
        },
        async session({ session, token }) {
            session.accessToken = token.accessToken;
            session.error = token.error;
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
    debug: process.env.NODE_ENV !== "production",
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
