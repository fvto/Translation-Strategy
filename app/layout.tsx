import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="dark">
      <body className="bg-[#070b14] text-slate-100 min-h-screen flex flex-col selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
