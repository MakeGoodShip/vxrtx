import type { GroupingGranularity } from "@/shared/types";
import { GRANULARITY_LABELS } from "@/shared/types";

export function GranularitySlider({
  value,
  onChange,
  disabled,
}: {
  value: GroupingGranularity;
  onChange: (v: GroupingGranularity) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
          Grouping detail
        </span>
        <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-400">
          {GRANULARITY_LABELS[value]}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium text-zinc-600">Broad</span>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) as GroupingGranularity)}
          disabled={disabled}
          className="h-1 flex-1"
        />
        <span className="text-[10px] font-medium text-zinc-600">Fine</span>
      </div>
    </div>
  );
}
