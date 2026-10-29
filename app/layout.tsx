import type { Metadata } from "next";
import "./globals.css";
import "./nothing.css";
import { LiveDebugHud } from "@/components/LiveDebugHud";

export const metadata: Metadata = {
  title: "Chingluh / Translation Workspace",
  description: "Không gian dịch văn bản, PowerPoint và Excel với thuật ngữ chuyên ngành Ching Luh.",
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
                if (savedTheme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="nothing-ui min-h-screen antialiased">
        {children}
        <LiveDebugHud />
      </body>
    </html>
  );
}
