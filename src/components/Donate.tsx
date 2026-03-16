"use client";

const KEKS_PAY_PHONE = "+385911568525";
const IBAN = "HR7124020063208975836";

interface DonateProps {
  keksPayPhone?: string;
  iban?: string;
}

export default function Donate({ keksPayPhone = KEKS_PAY_PHONE, iban = IBAN }: DonateProps) {
  const keksLink = `kekspay://pay?receiver=${encodeURIComponent(keksPayPhone)}&currency=EUR`;

  return (
    <div className="bg-surface-1 border border-border rounded-default p-4 sm:p-6 md:p-8">
      <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-text-dim mb-3">Podržite razvoj</h3>
      <p className="font-mono text-xs text-text-dim leading-relaxed mb-4">
        Solar Analitika je besplatna. Ako vam pomaže, podržite daljnji razvoj donacijom.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <a
          href={keksLink}
          className="inline-flex items-center gap-2 bg-[#00b140] text-white font-mono text-xs font-bold px-4 py-2.5 rounded-sm no-underline transition-all duration-150 hover:bg-[#009936] hover:-translate-y-px active:translate-y-0"
        >
          KEKS Pay
        </a>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.6rem] text-text-dim">IBAN:</span>
          <code className="font-mono text-[0.6rem] text-text bg-surface-2 px-2 py-1 rounded-sm select-all">{iban}</code>
        </div>
      </div>

      <p className="font-mono text-[0.55rem] text-text-dim mt-3">
        KEKS Pay radi samo na mobilnim uređajima s instaliranom aplikacijom.
      </p>
    </div>
  );
}
