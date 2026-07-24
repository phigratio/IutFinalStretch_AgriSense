import { config } from "../config.js";

export interface Mem0Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface Mem0AddInput {
  messages: Mem0Message[];
  userId: string;
  agentId?: string;
  runId?: string;
  metadata?: Record<string, unknown>;
}

export interface Mem0SearchInput {
  query: string;
  userId: string;
  agentId?: string;
  runId?: string;
  limit?: number;
  filters?: Record<string, unknown>;
}

export class Mem0Client {
  constructor(
    private readonly apiUrl = config.mem0ApiUrl,
    private readonly apiKey = config.mem0ApiKey,
  ) {}

  async add(input: Mem0AddInput): Promise<unknown> {
    return this.request("/memories", {
      messages: input.messages,
      user_id: input.userId,
      agent_id: input.agentId,
      run_id: input.runId,
      metadata: input.metadata,
    });
  }

  async search(input: Mem0SearchInput): Promise<unknown> {
    return this.request("/memories/search", {
      query: input.query,
      user_id: input.userId,
      agent_id: input.agentId,
      run_id: input.runId,
      limit: input.limit ?? 10,
      filters: input.filters,
    });
  }

  private async request(path: string, body: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) as unknown : undefined;

    if (!response.ok) {
      throw new Error(`Mem0 request failed with ${response.status}: ${text}`);
    }

    return payload;
  }
}

export const mem0Client = new Mem0Client();
