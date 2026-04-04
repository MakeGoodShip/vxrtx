import { useEffect, useState } from "react";
import { sendMessage } from "@/shared/messaging";
import type {
  AIModelProvider,
  AITier,
  LocalAIProvider,
  Settings as SettingsType,
} from "@/shared/types";
import { DEFAULT_SETTINGS } from "@/shared/types";

const TIER_INFO: { id: AITier; label: string; description: string; activeColor: string }[] = [
  {
    id: "secure",
    label: "Secure",
    description: "Fully local. Nothing leaves your machine.",
    activeColor: "text-brand-400 border-brand-400 bg-brand-950/30",
  },
  {
    id: "relaxed",
    label: "Relaxed",
    description: "Cloud AI, minimal data. Titles only, no URLs.",
    activeColor: "text-[#8b7fd4] border-[#5b4db8] bg-[#2d226d]/20",
  },
  {
    id: "yolo",
    label: "YOLO",
    description: "Full context to AI. Titles, URLs, timestamps.",
    activeColor: "text-[#f472c8] border-[#f433ab]/60 bg-[#f433ab]/8",
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
          !POPULAR_MODELS.some((m) => m.id === res.data?.openrouterModel)
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
        <h3 className="text-sm font-medium text-zinc-300">AI Privacy Tier</h3>
        <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
          {TIER_INFO.map((tier) => {
            const isActive = settings.aiTier === tier.id;
            return (
              <button
                key={tier.id}
                onClick={() => save({ aiTier: tier.id })}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  isActive ? tier.activeColor : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {tier.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-zinc-600">
          {TIER_INFO.find((t) => t.id === settings.aiTier)?.description}
        </p>
      </section>

      {/* Secure mode: local AI options */}
      {!showCloudSettings && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">Local AI Engine</h3>
          <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            {[
              { id: "rule-based" as LocalAIProvider, label: "Rules" },
              { id: "ollama" as LocalAIProvider, label: "Ollama" },
              { id: "chrome-ai" as LocalAIProvider, label: "Chrome AI" },
            ].map((opt) => {
              const isActive = settings.localAIProvider === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => save({ localAIProvider: opt.id })}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "border border-brand-400 bg-brand-950/30 text-brand-400"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-zinc-600">
            {settings.localAIProvider === "rule-based" &&
              "Fast domain-based grouping. No AI model needed."}
            {settings.localAIProvider === "ollama" &&
              "Connect to a local Ollama instance. Install from ollama.com."}
            {settings.localAIProvider === "chrome-ai" &&
              "Uses Chrome's built-in Gemini Nano. Requires Chrome 138+."}
          </p>

          {/* Ollama settings */}
          {settings.localAIProvider === "ollama" && (
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Server URL</label>
                <input
                  type="text"
                  value={settings.ollamaUrl}
                  onChange={(e) => save({ ollamaUrl: e.target.value })}
                  placeholder="http://localhost:11434"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Model</label>
                <div className="space-y-1.5">
                  {[
                    { id: "llama3.2", label: "Llama 3.2 (recommended)" },
                    { id: "mistral", label: "Mistral" },
                    { id: "gemma2", label: "Gemma 2" },
                    { id: "phi3", label: "Phi-3" },
                  ].map((model) => (
                    <button
                      key={model.id}
                      onClick={() => save({ ollamaModel: model.id })}
                      className={`w-full rounded-md border px-3 py-1.5 text-left text-xs transition-colors ${
                        settings.ollamaModel === model.id
                          ? "border-brand-400 bg-brand-950/30 text-brand-400"
                          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      {model.label}
                    </button>
                  ))}
                  <input
                    type="text"
                    value={settings.ollamaModel}
                    onChange={(e) => save({ ollamaModel: e.target.value })}
                    placeholder="Custom model name..."
                    className="w-full rounded-lg border border-dashed border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-brand-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Model Provider */}
      {showCloudSettings && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-300">AI Provider</h3>
          <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            {MODEL_PROVIDERS.map((provider) => {
              const isActive = settings.aiModelProvider === provider.id;
              return (
                <button
                  key={provider.id}
                  onClick={() => save({ aiModelProvider: provider.id })}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "border border-brand-400 bg-brand-950/30 text-brand-400"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {provider.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-zinc-600">
            {MODEL_PROVIDERS.find((p) => p.id === settings.aiModelProvider)?.description}
          </p>
        </section>
      )}

      {/* OpenRouter Settings */}
      {showCloudSettings && settings.aiModelProvider === "openrouter" && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">OpenRouter Configuration</h3>

          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              API Key
              <span className="ml-1 text-zinc-600">(get one at openrouter.ai)</span>
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
        <h3 className="text-sm font-medium text-zinc-300">Stale Tab Threshold</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={90}
            value={settings.staleDaysThreshold}
            onChange={(e) => save({ staleDaysThreshold: parseInt(e.target.value, 10) || 7 })}
            className="w-20 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-brand-400 focus:outline-none"
          />
          <span className="text-sm text-zinc-500">days</span>
        </div>
      </section>

      {saved && <div className="text-xs text-green-400">Settings saved</div>}
    </div>
  );
}
