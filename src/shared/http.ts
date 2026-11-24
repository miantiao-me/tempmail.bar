export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12_000,
): Promise<Response> {
  init.signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    // 正文读取也计入超时，避免收到响应头后仍无限等待。
    const body = await response.arrayBuffer();
    return new Response(body.byteLength ? body : null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}
