// Provider-agnostic LLM dispatch. Generation code calls callModel() with the
// selected provider; this normalizes the request/response across Anthropic and
// OpenAI so the pipeline never branches on provider. The request shape is the
// shared one both clients accept; responses are flattened to plain text.
import { callAnthropic, validateApiKey, AnthropicError } from "./anthropic";
import { callOpenAI, validateOpenAIKey, OpenAIError } from "./openai";
import type { Provider } from "./models";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  model: string;
  max_tokens: number;
  messages: LlmMessage[];
  system?: string;
}

export interface LlmResponse {
  text: string;
  // True when the model stopped because it hit the token ceiling, so the text is
  // likely cut off and the caller may retry with a larger budget.
  truncated: boolean;
}

// Running token usage across every model call in this process. Both providers
// report exact counts on each response; we sum them here so a caller can measure
// a run's cost. The eval resets before a run and snapshots after; the app could
// do the same around a generation batch. Single-threaded JS makes the += safe
// under the eval's concurrency.
const meter = { inputTokens: 0, outputTokens: 0, calls: 0 };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export function resetUsage(): void {
  meter.inputTokens = 0;
  meter.outputTokens = 0;
  meter.calls = 0;
}

export function snapshotUsage(): TokenUsage {
  return { ...meter };
}

export async function callModel(
  provider: Provider,
  apiKey: string,
  request: LlmRequest,
): Promise<LlmResponse> {
  if (provider === "openai") {
    const res = await callOpenAI(apiKey, request);
    meter.inputTokens += res.usage?.prompt_tokens ?? 0;
    meter.outputTokens += res.usage?.completion_tokens ?? 0;
    meter.calls += 1;
    return {
      text: res.choices.map((c) => c.message.content ?? "").join(""),
      truncated: res.choices[0]?.finish_reason === "length",
    };
  }
  const res = await callAnthropic(apiKey, request);
  meter.inputTokens += res.usage?.input_tokens ?? 0;
  meter.outputTokens += res.usage?.output_tokens ?? 0;
  meter.calls += 1;
  return {
    text: res.content.map((b) => b.text).join(""),
    truncated: res.stop_reason === "max_tokens",
  };
}

export function validateKey(provider: Provider, apiKey: string): Promise<void> {
  return provider === "openai" ? validateOpenAIKey(apiKey) : validateApiKey(apiKey);
}

// HTTP status behind a provider error, for the retry/backoff logic. Undefined
// (treated as retryable) for network errors and anything non-provider.
export function llmErrorStatus(err: unknown): number | undefined {
  if (err instanceof AnthropicError || err instanceof OpenAIError) return err.status;
  return undefined;
}

// Friendly one-liner for a rejected key, regardless of provider.
export function formatLlmError(err: unknown): string {
  if (err instanceof AnthropicError || err instanceof OpenAIError) {
    return `Key rejected: ${err.message}`;
  }
  return err instanceof Error ? err.message : "Couldn't validate — check your connection.";
}
