import { CloudProvider } from "./cloud-base";

/**
 * OpenRouter provider — unified gateway to Claude, GPT, Llama, Mistral, etc.
 * Uses OpenAI-compatible chat completions API.
 */
export class OpenRouterProvider extends CloudProvider {
  constructor(
    private apiKey: string,
    private model: string,
    includeUrls: boolean,
  ) {
    super(includeUrls);
  }

  protected async completeWithAbort(
    prompt: string,
    signal: AbortSignal,
  ): Promise<string> {
    if (!this.apiKey) throw new Error("OpenRouter API key not configured");

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://github.com/vxrtx",
          "X-Title": "vxrtx",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content:
                "You are a browser organization assistant. Always respond with valid JSON only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content in OpenRouter response");
    return content;
  }

  protected async complete(prompt: string): Promise<string> {
    return this.completeWithAbort(prompt, AbortSignal.timeout(90_000));
  }
}
