"use client";
import { useEffect, useMemo } from "react";
import Modal from "../../modal";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);
const PDF_EXT = new Set(["pdf"]);
// A reasonable guess at "this is probably text," not an exhaustive list —
// anything not on it just falls through to the UTF-8-decode attempt below,
// which is the real test.
const TEXT_EXT = new Set([
  "txt", "md", "json", "js", "jsx", "ts", "tsx", "css", "html", "htm", "py",
  "java", "c", "cpp", "h", "sh", "yml", "yaml", "xml", "csv", "log", "toml",
  "rs", "go", "sql", "env", "gitignore", "lock",
]);

const MAX_TEXT_CHARS = 50_000;

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

// Decides how to render arbitrary downloaded bytes with only a filename to
// go on (Swarm ID's downloadFile doesn't return a content-type) — try the
// extension first, then fall back to "does this decode as valid UTF-8" for
// anything not on the known-text list, since a lot of real text files
// (Dockerfile, Makefile, LICENSE) have no extension at all.
export default function FilePreviewModal({
  fileName,
  bytes,
  onClose,
}: {
  fileName: string;
  bytes: Uint8Array;
  onClose: () => void;
}) {
  const ext = extOf(fileName);

  const objectUrl = useMemo(() => URL.createObjectURL(new Blob([new Uint8Array(bytes)])), [bytes]);
  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  function download() {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName;
    a.click();
  }

  // ext === "" covers real text files with no extension at all
  // (Dockerfile, Makefile, LICENSE) — anything else unrecognized (.zip,
  // .exe, .bin) never even attempts a decode, rather than risk garbling
  // real binary data that happens to decode without throwing.
  let text: string | null = null;
  if (!IMAGE_EXT.has(ext) && !PDF_EXT.has(ext) && (TEXT_EXT.has(ext) || ext === "")) {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = null;
    }
  }

  let body: React.ReactNode;
  if (IMAGE_EXT.has(ext)) {
    // eslint-disable-next-line @next/next/no-img-element
    body = <img src={objectUrl} alt={fileName} className="max-w-full max-h-[65vh] mx-auto rounded-md" />;
  } else if (PDF_EXT.has(ext)) {
    body = <iframe src={objectUrl} title={fileName} className="w-full h-[65vh] bg-white rounded-md border-0" />;
  } else if (text !== null) {
    const truncated = text.length > MAX_TEXT_CHARS;
    body = (
      <pre className="whitespace-pre-wrap break-words text-xs text-[#fff8fa] bg-[#3d2632] border border-[#6b4552] rounded-md p-3 max-h-[65vh] overflow-auto">
        {truncated ? `${text.slice(0, MAX_TEXT_CHARS)}\n\n… truncated (${text.length.toLocaleString()} chars total)` : text}
      </pre>
    );
  } else {
    body = (
      <p className="text-sm text-[#dfa8b7] py-10 text-center">
        No preview available for this file type ({bytes.length.toLocaleString()} bytes).
      </p>
    );
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-3 gap-4">
        <h2 className="text-sm font-bold text-[#fff8fa] truncate" title={fileName}>
          {fileName}
        </h2>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={download} className="text-xs text-[#f06fa8] hover:underline cursor-pointer">
            Download
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[#dfa8b7] hover:text-[#fff8fa] cursor-pointer text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>
      {body}
    </Modal>
  );
}
