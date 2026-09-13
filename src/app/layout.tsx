import type { Metadata } from "next";
import Link from "next/link";
import ArkivStatusCard from "./arkiv-status-card";
import "./globals.css";

export const metadata: Metadata = {
  title: "gitkiv",
  description: "Git-style commit history, read straight from Arkiv.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#2b1b22] text-[#fff8fa] font-mono min-h-screen">
        <header className="border-b border-[#6b4552] px-4 py-3">
          <Link href="/" className="flex items-baseline gap-2 w-fit">
            <span className="text-[#f06fa8] font-bold text-base">gitkiv</span>
            <span className="text-[#dfa8b7] text-sm hidden sm:inline">
              commit history read straight from Arkiv
            </span>
          </Link>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-6">
          <ArkivStatusCard />
          {children}
        </main>
      </body>
    </html>
  );
}
