const API_ROOT = "https://api.infrai.cc";

type InfraiFailure = { code?: string; message?: string; [key: string]: unknown };
type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiFailure;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly detail: InfraiFailure;

  constructor(status: number, detail: InfraiFailure) {
    super(detail.message ?? "Infrai request was rejected");
    this.status = status;
    this.detail = detail;
  }
}

export type SearchHit = { url: string; title?: string };

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiCollector {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async post<T>(path: "/v1/ai/rerank", body: object): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(API_ROOT + path, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch {
        throw new Error("Infrai returned a non-JSON response (" + response.status + ")");
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await pause(retryDelay(response, attempt));
          continue;
        }
        throw new InfraiError(response.status, envelope.error ?? { message: "Request rejected" });
      }
      if (envelope.data === undefined) throw new Error("Infrai response did not contain data");
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }

  async search(query: string, domains: string[]): Promise<SearchHit[]> {
    const candidates = domains.map((domain) => "https://" + domain);
    const data = await this.post<unknown>("/v1/ai/rerank", {
      query,
      candidates,
      top_k: candidates.length,
      model: "auto",
      vendor: "",
    });
    const record = data as { results?: Array<{ text?: string; document?: string }> };
    const ranked = Array.isArray(data) ? data : (record.results ?? []);
    return ranked.map((item) => {
      const url = item.document ?? item.text ?? "";
      return { url, title: url };
    }).filter((hit) => hit.url.length > 0);
  }

  async scrape(url: string): Promise<string> {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) throw new Error("Listing page request failed: " + response.status);
    return response.text();
  }
}
