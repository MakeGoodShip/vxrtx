import { useEffect, useState } from "react";
import { sendMessage } from "@/shared/messaging";
import type {
  AITier,
  AIModelProvider,
  Settings as SettingsType,
} from "@/shared/types";
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
    description:
      "Cloud AI with minimal data exposure. Titles only, no URLs.",
  },
  {
    id: "yolo",
    label: "YOLO",
    description:
      "Full context sent to AI for best results. Titles, URLs, timestamps.",
  },
];

const MODEL_PROVIDERS: {
  id: AIModelProvider;
  label: string;
  description: string;
}[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Access Claude, GPT, Llama & more with one key",
  },
  {
    id: "claude",
    label: "Claude",
    description: "Direct Anthropic API",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Direct OpenAI API",
  },
];

const POPULAR_MODELS = [
  { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
  { id: "anthropic/claude-haiku-4", label: "Claude Haiku 4 (fast/cheap)" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini (fast/cheap)" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "meta-llama/llama-4-scout", label: "Llama 4 Scout (free)" },
];

export function Settings() {
  const [settings, setSettings] = useState<SettingsType>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [customModel, setCustomModel] = useState(false);

  useEffect(() => {
    sendMessage<void, SettingsType>("get-settings").then((res) => {
      if (res.success && res.data) {
        setSettings(res.data);
        // Check if current model is not in the popular list
        if (
          res.data.openrouterModel &&
          !POPULAR_MODELS.some((m) => m.id === res.data!.openrouterModel)
        ) {
          setCustomModel(true);
        }
      }
    });
  }, []);

  async function save(updates: Partial<SettingsType>) {
    const next = { ...settings, ...updates };
    setSettings(next);
    await sendMessage("save-settings", updates);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const showCloudSettings = settings.aiTier !== "secure";

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold tracking-tight">Settings</h2>

      {/* AI Tier */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-300">
          AI Privacy Tier
        </h3>
        <div className="space-y-2">
          {TIER_INFO.map((tier) => (
            <button
              key={tier.id}
              onClick={() => save({ aiTier: tier.id })}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                settings.aiTier === tier.id
                  ? "border-brand-400 bg-brand-950/30"
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

      {/* Model Provider */}
      {showCloudSettings && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-300">AI Provider</h3>
          <div className="space-y-2">
            {MODEL_PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                onClick={() => save({ aiModelProvider: provider.id })}
                className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                  settings.aiModelProvider === provider.id
                    ? "border-brand-400 bg-brand-950/30"
                    : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                }`}
              >
                <div className="text-sm font-medium">{provider.label}</div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {provider.description}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* OpenRouter Settings */}
      {showCloudSettings && settings.aiModelProvider === "openrouter" && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">
            OpenRouter Configuration
          </h3>

          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              API Key
              <span className="ml-1 text-zinc-600">
                (get one at openrouter.ai)
              </span>
            </label>
            <input
              type="password"
              value={settings.openrouterApiKey}
              onChange={(e) => save({ openrouterApiKey: e.target.value })}
              placeholder="sk-or-..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-500">Model</label>
            {!customModel ? (
              <div className="space-y-1.5">
                {POPULAR_MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => save({ openrouterModel: model.id })}
                    className={`w-full rounded-md border px-3 py-1.5 text-left text-xs transition-colors ${
                      settings.openrouterModel === model.id
                        ? "border-brand-400 bg-brand-950/30 text-brand-400"
                        : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    {model.label}
                  </button>
                ))}
                <button
                  onClick={() => setCustomModel(true)}
                  className="w-full rounded-md border border-dashed border-zinc-700 px-3 py-1.5 text-left text-xs text-zinc-500 hover:border-zinc-600 hover:text-zinc-400"
                >
                  Use custom model ID...
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={settings.openrouterModel}
                  onChange={(e) => save({ openrouterModel: e.target.value })}
                  placeholder="provider/model-name"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-400 focus:outline-none"
                />
                <button
                  onClick={() => setCustomModel(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-400"
                >
                  Back to model list
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Direct API Keys */}
      {showCloudSettings && settings.aiModelProvider === "claude" && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">Anthropic API Key</h3>
          <input
            type="password"
            value={settings.claudeApiKey}
            onChange={(e) => save({ claudeApiKey: e.target.value })}
            placeholder="sk-ant-..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-400 focus:outline-none"
          />
        </section>
      )}

      {showCloudSettings && settings.aiModelProvider === "openai" && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">OpenAI API Key</h3>
          <input
            type="password"
            value={settings.openaiApiKey}
            onChange={(e) => save({ openaiApiKey: e.target.value })}
            placeholder="sk-..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-400 focus:outline-none"
          />
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
            className="w-20 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-brand-400 focus:outline-none"
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
