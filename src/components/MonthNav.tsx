"use client";

import { MonthSelection } from "@/lib/types";
import { MONTH_NAMES } from "@/lib/config";

interface MonthNavProps {
  monthList: MonthSelection[];
  selectedMonth: MonthSelection;
  onPickMonth: (month: MonthSelection) => void;
  onShiftMonth: (direction: -1 | 1) => void;
}

export default function MonthNav({ monthList, selectedMonth, onPickMonth, onShiftMonth }: MonthNavProps) {
  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      <button className="font-mono text-base py-1.5 px-2.5 rounded-sm border border-border bg-transparent text-text cursor-pointer transition-all duration-150 whitespace-nowrap hover:border-amber hover:text-amber font-bold leading-none" onClick={() => onShiftMonth(-1)}>
        &#8249;
      </button>
      {monthList.map((entry) => {
        const isActive = entry.month === selectedMonth.month && entry.year === selectedMonth.year;
        return (
          <button
            key={`${entry.year}-${entry.month}`}
            className={`font-mono text-xs py-1.5 px-2.5 rounded-sm border border-border bg-transparent text-text cursor-pointer transition-all duration-150 whitespace-nowrap hover:border-amber hover:text-amber${isActive ? " bg-amber! text-background! border-amber! font-semibold!" : ""}`}
            onClick={() => onPickMonth(entry)}
          >
            {MONTH_NAMES[entry.month]} {entry.year}
          </button>
        );
      })}
      <button className="font-mono text-base py-1.5 px-2.5 rounded-sm border border-border bg-transparent text-text cursor-pointer transition-all duration-150 whitespace-nowrap hover:border-amber hover:text-amber font-bold leading-none" onClick={() => onShiftMonth(1)}>
        &#8250;
      </button>
    </div>
  );
}
