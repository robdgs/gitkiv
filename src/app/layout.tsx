import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "gitkiv",
  description: "Git-style commit history, read straight from Arkiv.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0d1117] text-[#c9d1d9] font-mono min-h-screen">
        <header className="border-b border-[#30363d] px-4 py-3 flex items-center gap-2">
          <span className="text-[#58a6ff] font-bold">gitkiv</span>
          <span className="text-[#8b949e] text-sm">/ repos, but the commit log comes from Arkiv</span>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
