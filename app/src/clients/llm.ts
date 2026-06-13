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

// A system-prompt block. Marking the last block with cache_control turns the
// system content into a cacheable prefix (Anthropic); OpenAI caches it
// automatically. Used to cache the golden examples + instructions across notes.
export interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export interface LlmRequest {
  model: string;
  max_tokens: number;
  messages: LlmMessage[];
  system?: string | SystemBlock[];
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
export interface CallRecord {
  input: number;
  output: number;
  // Input tokens served from / written to the prompt cache (0 when not caching).
  // `input` is the remaining full-rate input.
  cacheRead: number;
  cacheWrite: number;
  // The pipeline pass that made the call ("draft"/"review"/"streamline"), or ""
  // when unlabeled — lets measure:prices attribute tokens per pass.
  label: string;
}

const meter = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  calls: 0,
  callLog: [] as CallRecord[],
};
let currentLabel = "";

// Tag the calls that follow with a pass label, so a measurement run can split
// usage per pipeline pass. No-op for the app, which never reads callLog.
export function labelCalls(label: string): void {
  currentLabel = label;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  calls: number;
  callLog: CallRecord[];
}

export function resetUsage(): void {
  meter.inputTokens = 0;
  meter.outputTokens = 0;
  meter.cacheReadTokens = 0;
  meter.cacheWriteTokens = 0;
  meter.calls = 0;
  meter.callLog = [];
  currentLabel = "";
}

export function snapshotUsage(): TokenUsage {
  return {
    inputTokens: meter.inputTokens,
    outputTokens: meter.outputTokens,
    cacheReadTokens: meter.cacheReadTokens,
    cacheWriteTokens: meter.cacheWriteTokens,
    calls: meter.calls,
    callLog: [...meter.callLog],
  };
}

export async function callModel(
  provider: Provider,
  apiKey: string,
  request: LlmRequest,
): Promise<LlmResponse> {
  if (provider === "openai") {
    const res = await callOpenAI(apiKey, request);
    // OpenAI's prompt_tokens INCLUDES cached tokens; split them out so `input` is
    // the full-rate remainder (no separate write premium on OpenAI).
    const cacheRead = res.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const inTok = Math.max(0, (res.usage?.prompt_tokens ?? 0) - cacheRead);
    const outTok = res.usage?.completion_tokens ?? 0;
    record(inTok, outTok, cacheRead, 0);
    return {
      text: res.choices.map((c) => c.message.content ?? "").join(""),
      truncated: res.choices[0]?.finish_reason === "length",
    };
  }
  const res = await callAnthropic(apiKey, request);
  // Anthropic reports cache read/creation SEPARATELY from input_tokens (which is
  // already the full-rate remainder).
  const cacheRead = res.usage?.cache_read_input_tokens ?? 0;
  const cacheWrite = res.usage?.cache_creation_input_tokens ?? 0;
  const inTok = res.usage?.input_tokens ?? 0;
  const outTok = res.usage?.output_tokens ?? 0;
  record(inTok, outTok, cacheRead, cacheWrite);
  return {
    text: res.content.map((b) => b.text).join(""),
    truncated: res.stop_reason === "max_tokens",
  };
}

function record(input: number, output: number, cacheRead: number, cacheWrite: number): void {
  meter.inputTokens += input;
  meter.outputTokens += output;
  meter.cacheReadTokens += cacheRead;
  meter.cacheWriteTokens += cacheWrite;
  meter.calls += 1;
  meter.callLog.push({ input, output, cacheRead, cacheWrite, label: currentLabel });
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

// True when a provider error is a credit/billing exhaustion — the cue to tell her
// to top up rather than retry. Distinct from a transient rate limit (retryable) or
// a bad key (re-enter). Anthropic: 400 "credit balance is too low"; OpenAI: 429
// "exceeded your current quota"; either may use 402 Payment Required. Also matches
// the message alone, since the pipeline re-wraps pass errors in a plain Error.
export function isOutOfCredits(err: unknown): boolean {
  if ((err instanceof AnthropicError || err instanceof OpenAIError) && err.status === 402) return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return /credit balance|insufficient (?:credit|quota|funds|balance)|exceeded your current quota|payment required|out of credits/.test(
    msg,
  );
}
