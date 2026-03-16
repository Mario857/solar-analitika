"use client";

import { useCallback, useState } from "react";
import html2canvas from "html2canvas";

interface ShareButtonProps {
  targetId: string;
  fileName?: string;
}

export default function ShareButton({ targetId, fileName = "solar-analitika" }: ShareButtonProps) {
  const [status, setStatus] = useState<"idle" | "capturing" | "done" | "error">("idle");

  const handleShare = useCallback(async () => {
    const element = document.getElementById(targetId);
    if (!element) return;

    setStatus("capturing");

    try {
      const isMobile = window.innerWidth < 768;

      const canvas = await html2canvas(element, {
        backgroundColor: "#060a0f",
        scale: isMobile ? 1.5 : 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        ignoreElements: (el) => el.classList.contains("no-screenshot"),
        ...(isMobile && {
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
        }),
      });

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) {
        setStatus("error");
        setTimeout(() => setStatus("idle"), 2000);
        return;
      }

      const file = new File([blob], `${fileName}.png`, { type: "image/png" });

      /* Use native Web Share API with file support (most mobile browsers) */
      const hasFileShare =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (hasFileShare) {
        await navigator.share({
          title: "Solar Analitika",
          files: [file],
        });
      } else if (typeof navigator.share === "function") {
        /* Share API exists but doesn't support files — save image and share URL */
        downloadBlob(blob, fileName);
        await navigator.share({
          title: "Solar Analitika",
          text: "Pogledaj moju solarnu analizu na Solar Analitika",
          url: window.location.href,
        });
      } else {
        /* Desktop fallback: download the image */
        downloadBlob(blob, fileName);
      }

      setStatus("done");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      /* AbortError = user cancelled the share sheet, not a real error */
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      setStatus(isAbort ? "idle" : "error");
      if (!isAbort) setTimeout(() => setStatus("idle"), 2000);
    }
  }, [targetId, fileName]);

  const labelMap: Record<typeof status, string> = {
    idle: "Podijeli",
    capturing: "...",
    done: "Spremljeno!",
    error: "Greška",
  };

  return (
    <button
      onClick={handleShare}
      disabled={status === "capturing"}
      className="no-screenshot inline-flex items-center gap-1.5 font-mono text-[0.65rem] text-text-dim bg-surface-2 border border-border px-2.5 py-1 rounded-sm cursor-pointer transition-all duration-150 hover:text-text hover:border-border-accent hover:bg-surface-1 disabled:opacity-50 disabled:cursor-wait"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
      {labelMap[status]}
    </button>
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.png`;
  link.click();
  URL.revokeObjectURL(url);
}
