import { t, type Lang } from "./lang.ts";
import { fetchWithTimeout } from "./http.ts";

export class ServiceError extends Error {
  status: number;
  retryAt: number;
  constructor(message: string, status: number, retryAt = 0) {
    super(message);
    this.status = status;
    this.retryAt = retryAt;
  }
}

export function retryAt(value: string | null): number {
  if (!value) return 0;
  const delay = Number(value);
  return Number.isFinite(delay) && delay >= 0 ? Date.now() + delay * 1000 : Date.parse(value) || 0;
}

export async function request(
  url: string,
  init: RequestInit = {},
  lang: Lang = "zh",
): Promise<Response> {
  const response = await fetchWithTimeout(url, { ...init, redirect: "error" });
  if (!response.ok) {
    const messages: Record<number, [string, string]> = {
      400: ["请求无效，请检查输入", "Invalid input"],
      401: ["凭据失效，请检查设置", "Credentials are invalid"],
      402: ["积分不足", "Insufficient credits"],
      403: ["没有访问权限", "Access denied"],
      404: ["内容已不可用", "Content is unavailable"],
      429: ["请求频繁，请稍后重试", "Rate limited; try later"],
      503: ["服务暂不可用", "Service temporarily unavailable"],
    };
    const message = messages[response.status] ?? ["请求失败", "Request failed"];
    throw new ServiceError(
      `${t(lang, ...message)} (${response.status})`,
      response.status,
      retryAt(response.headers.get("Retry-After")),
    );
  }
  return response;
}

export async function jsonRequest<T>(
  url: string,
  init: RequestInit = {},
  lang: Lang = "zh",
): Promise<T> {
  const response = await request(url, init, lang);
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(t(lang, "服务返回了无效数据", "Invalid service response"));
  }
}

export async function copyText(value: string, lang: Lang): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    $metrix.toast(t(lang, "已复制", "Copied"));
  } catch {
    $metrix.toast(t(lang, "复制失败，请重试", "Copy failed; try again"));
  }
}
