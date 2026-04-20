import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "SmartGrAIder",
  description: "Stop spending weekends grading. SmartGrAIder uses AI to help teachers grade Google Classroom™ assignments faster, with detailed student feedback.",
  keywords: ["AI grading", "Google Classroom", "teacher tools", "education technology", "automated grading", "SmartGrAIder"],
  openGraph: {
    title: "SmartGrAIder | AI Assisted Grading",
    description: "Grade Google Classroom™ assignments instantly with AI. Reclaim your weekends.",
    url: "https://autograder-nine.vercel.app",
    siteName: "SmartGrAIder",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartGrAIder",
    description: "AI Assisted Grading for Google Classroom™",
  },
  verification: {
    google: 'riqJWBrcqpk5_URHq-CB20let4dpA258o8mm3CioCQQ',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-50`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
