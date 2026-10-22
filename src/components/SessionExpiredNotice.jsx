"use client";

import { useSession, signIn } from "next-auth/react";

// Shows only when Google couldn't renew the teacher's sign-in automatically.
export default function SessionExpiredNotice() {
    const { data: session } = useSession();
    if (session?.error !== "RefreshAccessTokenError") return null;

    return (
        <div
            role="alert"
            style={{
                position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
                zIndex: 1000, maxWidth: "calc(100% - 32px)", display: "flex", gap: 12,
                alignItems: "center", padding: "12px 16px", borderRadius: 10,
                background: "#fff7ed", color: "#7c2d12", border: "1px solid #fdba74",
                boxShadow: "0 6px 20px rgba(0,0,0,0.15)", fontSize: 14,
            }}
        >
            <span>Your Google sign-in expired, so student work can&apos;t load.</span>
            <button
                onClick={() => signIn("google")}
                style={{
                    padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                    background: "#ea580c", color: "#fff", fontWeight: 600, whiteSpace: "nowrap",
                }}
            >
                Sign in again
            </button>
        </div>
    );
}
