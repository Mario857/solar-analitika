"use client";

import { useState } from "react";

const IBAN = "HR7124020063208975836";

interface DonateProps {
  iban?: string;
}

export default function Donate({ iban = IBAN }: DonateProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(iban);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const copyLabel = isCopied ? "Kopirano!" : "Kopiraj";

  return (
    <div className="bg-surface-1 border border-border rounded-default p-4 sm:p-6 md:p-8">
      <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-text-dim mb-3">Podržite razvoj</h3>
      <p className="font-mono text-xs text-text-dim leading-relaxed mb-4">
        Solar Analitika je besplatna. Ako vam pomaže, podržite daljnji razvoj donacijom.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[0.6rem] text-text-dim font-bold">IBAN:</span>
        <code className="font-mono text-[0.6rem] text-text bg-surface-2 px-2 py-1 rounded-sm select-all">{iban}</code>
        <button
          onClick={handleCopy}
          className="font-mono text-[0.6rem] text-text-dim bg-surface-2 px-2 py-1 rounded-sm border border-border cursor-pointer transition-all duration-150 hover:text-text hover:border-text-dim active:translate-y-px"
        >
          {copyLabel}
        </button>
      </div>
    </div>
  );
}
