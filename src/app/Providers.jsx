"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import BillingReminder from "@/components/BillingReminder";

export default function Providers({ children }) {
    return (
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <SessionProvider refetchOnWindowFocus={false}>{children}<BillingReminder /></SessionProvider>
        </ThemeProvider>
    );
}
