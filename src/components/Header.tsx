"use client";

interface HeaderProps {
  meter: string;
}

export default function Header({ meter }: HeaderProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-5">
      <div className="flex items-center gap-4">
        <div className="sun-icon">
          <div className="pulse-ring" />
          <div className="sun-core" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-text-bright">
          <b className="text-amber">Solar</b> Analitika
        </h1>
      </div>
      <div className="flex gap-3 items-center flex-wrap">
        <span className="font-mono text-xs text-text-dim bg-surface-2 px-3 py-1.5 rounded-2xl border border-border">OMM {meter}</span>
      </div>
    </div>
  );
}
