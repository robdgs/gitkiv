import Link from "next/link";

export default function NotFound() {
  return (
    <div className="border border-dashed border-[#30363d] rounded-md p-6">
      <h1 className="text-lg font-bold text-[#e6edf3] mb-1">Repository not found</h1>
      <p className="text-sm text-[#8b949e] mb-4">
        There&apos;s no repository at this address on Arkiv yet.
      </p>
      <Link href="/" className="text-sm text-[#58a6ff]">
        ← Back to all repositories
      </Link>
    </div>
  );
}
