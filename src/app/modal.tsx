"use client";
import { useEffect } from "react";

// A generic overlay + centered panel — Esc or a click on the backdrop
// closes it, a click inside the panel does not (stopPropagation on the
// panel itself). Nothing app-specific here; FilePreviewModal is the only
// user today, but this is the reusable primitive.
export default function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-[#2b1b22] border border-[#6b4552] rounded-md max-w-2xl w-full max-h-[85vh] overflow-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
