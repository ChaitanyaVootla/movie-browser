declare module 'node-fetch' {
  interface RequestInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  }

  interface Response {
    ok: boolean;
    status: number;
    statusText: string;
    text(): Promise<string>;
    json(): Promise<any>;
  }

  function fetch(url: string, init?: RequestInit): Promise<Response>;
  export = fetch;
}
