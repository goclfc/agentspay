export class HttpClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private maxRetries: number;

  constructor(opts: {
    baseUrl: string;
    agentKey?: string;
    masterKey?: string;
    merchantKey?: string;
  }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.headers = { 'Content-Type': 'application/json' };
    this.maxRetries = 3;

    if (opts.agentKey) this.headers['X-Agent-Key'] = opts.agentKey;
    if (opts.masterKey) this.headers['X-Master-Key'] = opts.masterKey;
    if (opts.merchantKey) this.headers['X-Merchant-Key'] = opts.merchantKey;
  }

  async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined>): Promise<T> {
    let url = `${this.baseUrl}${path}`;

    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method,
          headers: this.headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        if (res.status >= 500 && attempt < this.maxRetries - 1) {
          await this.sleep(Math.pow(2, attempt) * 500);
          continue;
        }

        const json = await res.json() as any;

        if (!res.ok) {
          const err = new SdkError(
            json?.error?.message || `HTTP ${res.status}`,
            json?.error?.code || 'UNKNOWN',
            res.status,
          );
          throw err;
        }

        return json as T;
      } catch (err) {
        if (err instanceof SdkError) throw err;
        lastError = err as Error;
        if (attempt < this.maxRetries - 1) {
          await this.sleep(Math.pow(2, attempt) * 500);
        }
      }
    }

    throw lastError || new Error('Request failed');
  }

  get<T>(path: string, query?: Record<string, string | number | undefined>) {
    return this.request<T>('GET', path, undefined, query);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }

  del<T>(path: string) {
    return this.request<T>('DELETE', path);
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}

export class SdkError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'AgentsPayError';
    this.code = code;
    this.status = status;
  }
}
