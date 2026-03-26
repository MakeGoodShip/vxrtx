// Chrome Built-in AI — Prompt API (LanguageModel)
// Available from Chrome 138+ in extension contexts

interface LanguageModelCreateOptions {
  systemPrompt?: string;
  initialPrompts?: { role: "system" | "user" | "assistant"; content: string }[];
  temperature?: number;
  topK?: number;
}

interface LanguageModelSession {
  prompt(input: string): Promise<string>;
  prompt(
    input: { role: "user" | "assistant"; content: string }[],
  ): Promise<string>;
  promptStreaming(input: string): ReadableStream<string>;
  destroy(): void;
  readonly tokensSoFar: number;
  readonly maxTokens: number;
  readonly tokensLeft: number;
}

interface LanguageModelConstructor {
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
  availability(options?: {
    languages?: string[];
  }): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
}

declare const LanguageModel: LanguageModelConstructor;
