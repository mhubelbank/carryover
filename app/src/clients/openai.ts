// OpenAI API client. Like the Anthropic client, calls are made directly from the
// browser with the user's own key (BYOK); OpenAI's REST API allows cross-origin
// requests, so no special header is needed. Spend caps live in the OpenAI
// dashboard. The request shape mirrors AnthropicRequest so the two are
// interchangeable behind clients/llm.ts.
import type { LlmRequest } from "./llm";

const API_URL = "https://api.openai.com/v1/chat/completions";
const MODELS_URL = "https://api.openai.com/v1/models";

export interface OpenAIResponse {
  // finish_reason "length" means the model hit the token ceiling (common on
  // reasoning models that spend the budget on hidden reasoning) — used to retry.
  choices: Array<{ message: { content: string | null }; finish_reason?: string }>;
  // OpenAI caches long prompt prefixes automatically; cached_tokens reports how
  // many input tokens were served from cache (billed at the discounted rate).
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

export class OpenAIError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "OpenAIError";
  }
}

async function errorDetail(res: Response): Promise<string> {
  let detail = res.statusText;
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body.error?.message) detail = body.error.message;
  } catch {
    // Body wasn't JSON; fall back to status text.
  }
  return detail;
}

export async function callOpenAI(apiKey: string, request: LlmRequest): Promise<OpenAIResponse> {
  // OpenAI carries the system prompt as a leading "system" message rather than a
  // top-level field; everything else maps one-to-one. System blocks (used to mark
  // Anthropic's cache prefix) flatten to one string — OpenAI caches the prefix
  // automatically, so the ordering does the work without explicit markers.
  const systemText =
    typeof request.system === "string"
      ? request.system
      : request.system?.map((b) => b.text).join("\n\n");
  const messages = systemText
    ? [{ role: "system" as const, content: systemText }, ...request.messages]
    : request.messages;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      // OpenAI renamed this: newer models (GPT-5 family) reject `max_tokens` and
      // require `max_completion_tokens`. The newer name also works on gpt-4o, so
      // we always send it.
      max_completion_tokens: request.max_tokens,
      messages,
    }),
  });

  if (!res.ok) {
    throw new OpenAIError(await errorDetail(res), res.status);
  }
  return (await res.json()) as OpenAIResponse;
}

// Validate the key with a free GET /v1/models — no tokens spent, no body needed.
export async function validateOpenAIKey(apiKey: string): Promise<void> {
  const res = await fetch(MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new OpenAIError(await errorDetail(res), res.status);
  }
}
