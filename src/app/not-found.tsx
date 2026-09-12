import Link from "next/link";

export default function NotFound() {
  return (
    <div className="border border-dashed border-[#6b4552] rounded-md p-6">
      <h1 className="text-lg font-bold text-[#fff8fa] mb-1">Repository not found</h1>
      <p className="text-sm text-[#dfa8b7] mb-4">
        There&apos;s no repository at this address on Arkiv yet.
      </p>
      <Link href="/" className="text-sm text-[#f06fa8]">
        ← Back to all repositories
      </Link>
    </div>
  );
}
