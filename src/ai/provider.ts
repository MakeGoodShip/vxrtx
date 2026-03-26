import type { AIProvider } from "./types";
import type { Settings } from "@/shared/types";
import { getSettings } from "@/core/storage";
import { LocalProvider } from "./providers/local";
import { RelaxedProvider } from "./providers/relaxed";
import { YoloProvider } from "./providers/yolo";

export async function getAIProvider(): Promise<AIProvider> {
  const settings = await getSettings();
  return createProvider(settings);
}

function createProvider(settings: Settings): AIProvider {
  switch (settings.aiTier) {
    case "secure":
      return new LocalProvider();
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
      return new LocalProvider();
  }
}
