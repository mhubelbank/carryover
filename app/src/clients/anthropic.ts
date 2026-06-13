// Anthropic API client. Calls are made directly from the browser using
// the documented BYOK header. Spend caps must be set in the dashboard.

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

// A system block; the last one may carry cache_control to mark the cacheable
// prefix (golden examples + instructions) for prompt caching.
export interface AnthropicSystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  // String for the simple case, or blocks when a cacheable prefix is marked.
  system?: string | AnthropicSystemBlock[];
}

export interface AnthropicResponse {
  content: Array<{ type: "text"; text: string }>;
  stop_reason: string;
  // cache_* fields appear only when prompt caching is used: creation = tokens
  // written to the cache (billed at 1.25×), read = served from it (0.1×).
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export class AnthropicError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AnthropicError";
  }
}

export async function callAnthropic(
  apiKey: string,
  request: AnthropicRequest,
): Promise<AnthropicResponse> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) detail = body.error.message;
    } catch {
      // Body wasn't JSON; fall back to status text.
    }
    throw new AnthropicError(detail, res.status);
  }

  return (await res.json()) as AnthropicResponse;
}

// Cheapest possible ping to confirm the key works. Uses Haiku and a
// 1-token reply, so cost is fractions of a cent per validation.
export async function validateApiKey(apiKey: string): Promise<void> {
  await callAnthropic(apiKey, {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1,
    messages: [{ role: "user", content: "hi" }],
  });
}
