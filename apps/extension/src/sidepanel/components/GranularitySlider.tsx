import type { GroupingGranularity } from "@/shared/types";
import { GRANULARITY_LABELS } from "@/shared/types";

const LEVELS: GroupingGranularity[] = [1, 2, 3, 4, 5];

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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">Grouping detail</span>
        <span className="text-xs font-medium text-brand-400">
          {GRANULARITY_LABELS[value]}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-zinc-600">Broad</span>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(e) =>
            onChange(Number(e.target.value) as GroupingGranularity)
          }
          disabled={disabled}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-800 accent-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="text-[10px] text-zinc-600">Fine</span>
      </div>
    </div>
  );
}
