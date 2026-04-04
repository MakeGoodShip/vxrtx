import type { AIProvider } from "./types";
import type { Settings } from "@/shared/types";
import { getSettings } from "@/core/storage";
import { OllamaProvider } from "./providers/ollama";
import { ChromeAIProvider } from "./providers/chrome-ai";
import { RelaxedProvider } from "./providers/relaxed";
import { YoloProvider } from "./providers/yolo";
import { OpenRouterProvider } from "./providers/openrouter";

export async function getAIProvider(): Promise<AIProvider> {
  const settings = await getSettings();
  return createProvider(settings);
}

function createProvider(settings: Settings): AIProvider {
  const includeUrls = settings.aiTier === "yolo";

  // OpenRouter handles both relaxed/yolo tiers via the includeUrls flag
  if (settings.aiModelProvider === "openrouter" && settings.aiTier !== "secure") {
    return new OpenRouterProvider(
      settings.openrouterApiKey,
      settings.openrouterModel,
      includeUrls,
    );
  }

  switch (settings.aiTier) {
    case "secure":
      return createLocalProvider(settings);
    case "relaxed":
      return new RelaxedProvider(
        settings.aiModelProvider,
        settings.claudeApiKey,
        settings.openaiApiKey,
      );
    case "yolo":
      return new YoloProvider(
        settings.aiModelProvider,
        settings.claudeApiKey,
        settings.openaiApiKey,
      );
    default:
      return createLocalProvider(settings);
  }
}

function createLocalProvider(settings: Settings): AIProvider {
  switch (settings.localAIProvider) {
    case "ollama":
      return new OllamaProvider(settings.ollamaUrl, settings.ollamaModel);
    case "chrome-ai":
      return new ChromeAIProvider();
    case "rule-based":
    default:
      // Rule-based is handled in the service worker before reaching the provider.
      // If we get here, throw a clear error rather than silently failing.
      throw new Error("Rule-based mode does not use an AI provider.");
  }
}
