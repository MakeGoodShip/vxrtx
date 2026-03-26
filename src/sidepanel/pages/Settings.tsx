import { useEffect, useState } from "react";
import { sendMessage } from "@/shared/messaging";
import type { AITier, AIModelProvider, Settings as SettingsType } from "@/shared/types";
import { DEFAULT_SETTINGS } from "@/shared/types";

const TIER_INFO: { id: AITier; label: string; description: string }[] = [
  {
    id: "secure",
    label: "Secure",
    description: "Fully local AI. Nothing leaves your machine.",
  },
  {
    id: "relaxed",
    label: "Relaxed",
    description: "Cloud AI with minimal data exposure. Titles only, no URLs.",
  },
  {
    id: "yolo",
    label: "YOLO",
    description: "Full context sent to AI for best results. Titles, URLs, timestamps.",
  },
];

const MODEL_PROVIDERS: { id: AIModelProvider; label: string }[] = [
  { id: "claude", label: "Claude (Anthropic)" },
  { id: "openai", label: "OpenAI" },
];

export function Settings() {
  const [settings, setSettings] = useState<SettingsType>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    sendMessage<void, SettingsType>("get-settings").then((res) => {
      if (res.success && res.data) setSettings(res.data);
    });
  }, []);

  async function save(updates: Partial<SettingsType>) {
    const next = { ...settings, ...updates };
    setSettings(next);
    await sendMessage("save-settings", updates);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      {/* AI Tier */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-300">AI Privacy Tier</h3>
        <div className="space-y-2">
          {TIER_INFO.map((tier) => (
            <button
              key={tier.id}
              onClick={() => save({ aiTier: tier.id })}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                settings.aiTier === tier.id
                  ? "border-indigo-500 bg-indigo-950/30"
                  : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
              }`}
            >
              <div className="text-sm font-medium">{tier.label}</div>
              <div className="mt-0.5 text-xs text-zinc-500">
                {tier.description}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Model Provider (only for relaxed/yolo) */}
      {settings.aiTier !== "secure" && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-300">AI Model</h3>
          <div className="flex gap-2">
            {MODEL_PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                onClick={() => save({ aiModelProvider: provider.id })}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  settings.aiModelProvider === provider.id
                    ? "border-indigo-500 bg-indigo-950/30 text-indigo-400"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {provider.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* API Keys */}
      {settings.aiTier !== "secure" && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">API Keys</h3>

          {(settings.aiModelProvider === "claude" || settings.aiTier === "yolo") && (
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Anthropic API Key
              </label>
              <input
                type="password"
                value={settings.claudeApiKey}
                onChange={(e) => save({ claudeApiKey: e.target.value })}
                placeholder="sk-ant-..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          )}

          {(settings.aiModelProvider === "openai" || settings.aiTier === "yolo") && (
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                OpenAI API Key
              </label>
              <input
                type="password"
                value={settings.openaiApiKey}
                onChange={(e) => save({ openaiApiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          )}
        </section>
      )}

      {/* Stale threshold */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-300">
          Stale Tab Threshold
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={90}
            value={settings.staleDaysThreshold}
            onChange={(e) =>
              save({ staleDaysThreshold: parseInt(e.target.value) || 7 })
            }
            className="w-20 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
          />
          <span className="text-sm text-zinc-500">days</span>
        </div>
      </section>

      {saved && (
        <div className="text-xs text-green-400">Settings saved</div>
      )}
    </div>
  );
}
