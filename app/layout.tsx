import type { Metadata } from "next";
import "./globals.css";
import { LiveDebugHud } from "@/components/LiveDebugHud";

export const metadata: Metadata = {
  title: "Secure Translator — Enterprise Controlled Translation & CAT System",
  description: "Security-first internal translation application with controlled terminology and rule-based QA validation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const savedTheme = localStorage.getItem('theme');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="bg-[#f7f7f8] dark:bg-[#090b10] text-slate-800 dark:text-slate-100 min-h-screen flex flex-col selection:bg-rose-500 selection:text-white antialiased transition-colors duration-150">
        {children}
        <LiveDebugHud />
      </body>
    </html>
  );
}
