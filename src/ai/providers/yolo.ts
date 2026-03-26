import type { AIModelProvider } from "@/shared/types";
import { CloudProvider } from "./cloud-base";

export class YoloProvider extends CloudProvider {
  constructor(
    private modelProvider: AIModelProvider,
    private claudeKey: string,
    private openaiKey: string,
  ) {
    super(true);
  }

  protected async completeWithAbort(
    prompt: string,
    signal: AbortSignal,
  ): Promise<string> {
    if (this.modelProvider === "claude") {
      return this.completeClaude(prompt, signal);
    }
    return this.completeOpenAI(prompt, signal);
  }

  protected async complete(prompt: string): Promise<string> {
    return this.completeWithAbort(prompt, AbortSignal.timeout(90_000));
  }

  private async completeClaude(
    prompt: string,
    signal: AbortSignal,
  ): Promise<string> {
    if (!this.claudeKey) throw new Error("Anthropic API key not configured");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.claudeKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find(
      (b: { type: string }) => b.type === "text",
    );
    if (!textBlock?.text) throw new Error("No text in Claude response");
    return textBlock.text;
  }

  private async completeOpenAI(
    prompt: string,
    signal: AbortSignal,
  ): Promise<string> {
    if (!this.openaiKey) throw new Error("OpenAI API key not configured");

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a browser organization assistant. Always respond with valid JSON only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          response_format: { type: "json_object" },
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content in OpenAI response");
    return content;
  }
}
