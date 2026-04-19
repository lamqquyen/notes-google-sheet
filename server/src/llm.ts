import type { Env } from "./types";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmCallOptions {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none" | "required";
  jsonMode?: boolean;
  temperature?: number;
}

export interface LlmCallResult {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
}

/**
 * Single entry point for all model calls. Phase 1 uses Groq/Gemini cloud free tiers,
 * Phase 2 swaps LLM_PROVIDER=ollama + LLM_BASE_URL=http://your-mac:11434/v1 with
 * zero code changes elsewhere.
 */
export async function callLlm(env: Env, options: LlmCallOptions): Promise<LlmCallResult> {
  if (env.LLM_PROVIDER === "gemini") {
    return callGemini(env, options);
  }
  return callOpenAICompatible(env, options);
}

async function callOpenAICompatible(env: Env, options: LlmCallOptions): Promise<LlmCallResult> {
  const url = `${env.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: env.LLM_MODEL,
    messages: options.messages,
    temperature: options.temperature ?? 0.1,
  };
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? "auto";
  }
  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.LLM_PROVIDER !== "ollama" && env.LLM_API_KEY) {
    headers.Authorization = `Bearer ${env.LLM_API_KEY}`;
  }

  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`LLM error ${response.status}: ${text.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
    }>;
  };
  const choice = data.choices?.[0]?.message;
  return {
    content: choice?.content ?? "",
    toolCalls: choice?.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })),
  };
}

/**
 * Minimal Gemini adapter. Tool-calling on Gemini uses a different schema, so for
 * Phase 1 we only support plain text + JSON mode here. The agent loop in agent.ts
 * sticks to OpenAI-compatible providers (Groq/Ollama) which is the default.
 */
async function callGemini(env: Env, options: LlmCallOptions): Promise<LlmCallResult> {
  const url = `${env.LLM_BASE_URL.replace(/\/$/, "")}/models/${env.LLM_MODEL}:generateContent?key=${env.LLM_API_KEY}`;
  const contents = options.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const systemInstruction = options.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n");

  const body: Record<string, unknown> = {
    contents,
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    generationConfig: {
      temperature: options.temperature ?? 0.1,
      ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gemini error ${response.status}: ${text.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return { content: text };
}
