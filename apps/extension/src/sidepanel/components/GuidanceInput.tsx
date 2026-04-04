import { useEffect, useRef, useState } from "react";
import { sendMessage } from "@/shared/messaging";

const TAB_PRESETS = [
  { label: "By project", value: "Group tabs by project or codebase, not by domain" },
  { label: "By domain", value: "Group tabs primarily by website domain" },
  {
    label: "By activity",
    value: "Group tabs by what I'm actively working on vs. reference material",
  },
  { label: "Fewer groups", value: "Create as few groups as possible, merge aggressively" },
];

const BOOKMARK_PRESETS = [
  { label: "By topic", value: "Organize bookmarks by topic and subject matter" },
  {
    label: "By purpose",
    value: "Organize bookmarks by purpose: tools, reference, reading, entertainment",
  },
  {
    label: "Nested",
    value:
      "Organize into a hierarchical folder tree using '/' paths like 'Dev/Frontend'. Group related categories under shared parents.",
  },
  {
    label: "Flat",
    value:
      "Create a completely flat folder structure. Do NOT use '/' nesting. Use only simple top-level folder names.",
  },
];

export function GuidanceInput({
  type,
  value,
  onChange,
}: {
  type: "tabs" | "bookmarks";
  value: string;
  onChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const presets = type === "tabs" ? TAB_PRESETS : BOOKMARK_PRESETS;
  const hasValue = value.trim().length > 0;

  useEffect(() => {
    if (expanded && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [expanded]);

  // Save guidance to settings when it changes
  useEffect(() => {
    const key = type === "tabs" ? "tabGuidance" : "bookmarkGuidance";
    const timer = setTimeout(() => {
      sendMessage("save-settings", { [key]: value });
    }, 500);
    return () => clearTimeout(timer);
  }, [value, type]);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform text-zinc-500 ${expanded ? "rotate-90" : ""}`}
        >
          <path d="M3.5 2l3 3-3 3" />
        </svg>
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Guidance
        </span>
        {hasValue && !expanded && (
          <span className="ml-auto max-w-[160px] truncate text-[10px] text-zinc-600 italic">
            {value}
          </span>
        )}
      </button>

      {expanded && (
        <div className="animate-slide-down space-y-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              type === "tabs"
                ? "e.g., Group by project, keep GitHub and Linear tabs together..."
                : "e.g., Organize by topic, separate work from personal..."
            }
            rows={2}
            className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-brand-400 focus:outline-none"
          />
          <div className="flex flex-wrap gap-1">
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  onChange(preset.value);
                  if (textareaRef.current) textareaRef.current.focus();
                }}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  value === preset.value
                    ? "border-brand-400/40 bg-brand-950/30 text-brand-400"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                }`}
              >
                {preset.label}
              </button>
            ))}
            {hasValue && (
              <button
                onClick={() => onChange("")}
                className="rounded-full border border-zinc-800 px-2.5 py-1 text-[10px] font-medium text-zinc-600 transition-colors hover:border-[#f433ab]/30 hover:text-[#f472c8]"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
