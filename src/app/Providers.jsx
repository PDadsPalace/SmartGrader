"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import BillingReminder from "@/components/BillingReminder";
import SessionExpiredNotice from "@/components/SessionExpiredNotice";

export default function Providers({ children }) {
    return (
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <SessionProvider refetchOnWindowFocus={false} refetchInterval={10 * 60}>{children}<BillingReminder /><SessionExpiredNotice /></SessionProvider>
        </ThemeProvider>
    );
}
