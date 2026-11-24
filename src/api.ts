import { jsonRequest, request, ServiceError } from "./shared/service.ts";
import { t, type Lang } from "./shared/kit.ts";
import { solveChallenge, type Challenge } from "./pow.ts";

export type Lifetime = "10m" | "1h";
export interface Session {
  email: string;
  token: string;
  expiresAt: number;
  lifetime: Lifetime;
}
export interface Message {
  id: string;
  from: { name?: string; address?: string };
  to: string;
  subject: string | null;
  preview: string;
  date: string;
  text?: string | null;
  html?: string | null;
}
const BASE = "https://tempmail.best/api/agent/v1";
const emailPattern = /^[^@\s]+@[^@\s]+$/;
export function validSession(value: unknown): value is Session {
  const s = value as Session | null;
  return Boolean(
    s &&
    typeof s.email === "string" &&
    emailPattern.test(s.email) &&
    typeof s.token === "string" &&
    s.token &&
    Number.isSafeInteger(s.expiresAt) &&
    (s.lifetime === "10m" || s.lifetime === "1h"),
  );
}
function pause(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function createMailbox(
  lifetime: Lifetime,
  lang: Lang,
  signal: AbortSignal,
  stage: (value: "preparing" | "computing" | "creating") => void,
  progress: (value: number) => void,
): Promise<Session> {
  stage("preparing");
  const discovery = await jsonRequest<{ domains: string[]; defaultDomain: string }>(
    `${BASE}/domains`,
    { signal },
    lang,
  );
  if (!Array.isArray(discovery.domains) || !discovery.domains.includes(discovery.defaultDomain))
    throw new Error(t(lang, "邮箱域名数据无效", "Invalid mailbox domains"));
  const path = `${BASE}/cap/${lifetime}/${encodeURIComponent(discovery.defaultDomain)}`;
  const challenge = await jsonRequest<Challenge & { success: boolean; email: string }>(
    `${path}/challenge`,
    { method: "POST", signal },
    lang,
  );
  if (
    challenge.success !== true ||
    typeof challenge.email !== "string" ||
    !challenge.email.endsWith(`@${discovery.defaultDomain}`)
  )
    throw new Error(t(lang, "邮箱挑战无效", "Invalid mailbox challenge"));
  stage("computing");
  const solutions = await solveChallenge(challenge, { signal, onProgress: progress, lang });
  signal.throwIfAborted();
  stage("creating");
  const body = JSON.stringify({ token: challenge.token, solutions });
  let waited = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    try {
      const result = await jsonRequest<Session & { success: boolean }>(
        `${path}/redeem`,
        { method: "POST", signal, headers: { "Content-Type": "application/json" }, body },
        lang,
      );
      const session = {
        email: result.email,
        token: result.token,
        expiresAt: result.expiresAt,
        lifetime,
      };
      if (
        result.success !== true ||
        !validSession(session) ||
        session.email !== challenge.email ||
        session.expiresAt <= Date.now()
      )
        throw new Error(t(lang, "邮箱创建响应无效", "Invalid mailbox response"));
      return session;
    } catch (error) {
      if (!(error instanceof ServiceError) || ![429, 503].includes(error.status) || attempt === 2)
        throw error;
      const delay = error.retryAt
        ? Math.max(0, error.retryAt - Date.now())
        : error.status === 503
          ? 1000
          : -1;
      if (
        delay < 0 ||
        delay > 60_000 ||
        waited + delay > 120_000 ||
        Date.now() + delay >= challenge.expires
      )
        throw error;
      waited += delay;
      await pause(delay, signal);
    }
  }
  throw new Error(t(lang, "邮箱创建失败", "Mailbox creation failed"));
}
function path(session: Session, suffix = ""): string {
  return `${BASE}/mailboxes/${encodeURIComponent(session.email)}${suffix}`;
}
const authorization = (session: Session) => ({ Authorization: `Bearer ${session.token}` });
export async function listMessages(
  session: Session,
  lang: Lang,
  signal: AbortSignal,
): Promise<Message[]> {
  const messages = await jsonRequest<Message[]>(
    path(session, "/messages"),
    { signal, headers: authorization(session) },
    lang,
  );
  if (
    !Array.isArray(messages) ||
    messages.some((m) => !m || typeof m.id !== "string" || m.to !== session.email)
  )
    throw new Error(t(lang, "收件数据不匹配", "Mailbox response mismatch"));
  return messages.slice(0, 20);
}
export async function getMessage(
  session: Session,
  id: string,
  lang: Lang,
  signal: AbortSignal,
): Promise<Message> {
  const message = await jsonRequest<Message>(
    path(session, `/messages/${encodeURIComponent(id)}`),
    { signal, headers: authorization(session) },
    lang,
  );
  if (message.id !== id || message.to !== session.email)
    throw new Error(t(lang, "邮件数据不匹配", "Message response mismatch"));
  return message;
}
export async function deleteMailbox(
  session: Session,
  lang: Lang,
  signal?: AbortSignal,
): Promise<void> {
  await request(path(session), { method: "DELETE", signal, headers: authorization(session) }, lang);
}
function decodeEntities(text: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity: string) => {
    if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? whole;
    const hex = entity[1]?.toLowerCase() === "x";
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}
export function messageText(message: Pick<Message, "text" | "html">): string {
  const targets = new Set<string>();
  const html = (message.html || "")
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_whole, attributes: string, content: string) => {
      const attribute = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/i.exec(
        attributes,
      );
      const href = decodeEntities(attribute?.[1] || attribute?.[2] || attribute?.[3] || "").trim();
      if (!/^(?:https?:\/\/|mailto:)/i.test(href)) return content;
      targets.add(href);
      if (decodeEntities(content.replace(/<[^>]*>/g, "")).trim() === href) return content;
      const escaped = href.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `${content}\n${escaped}\n`;
    });
  if (typeof message.text === "string" && message.text.trim().length) {
    const text = message.text;
    return [text, ...[...targets].filter((href) => !text.includes(href))].join("\n");
  }
  return decodeEntities(
    html.replace(/<br\s*\/?>|<\/(?:p|div|li|tr|h[1-6])>/gi, "\n").replace(/<[^>]*>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function codes(text: string): string[] {
  return [
    ...new Set(
      [
        ...text.matchAll(
          /(?:验证码|verification\s+code|one[- ]time\s+(?:code|password)|\bOTP\b|\bcode\b)[^\d\n]{0,32}(\d{4,8})(?!\d)/gi,
        ),
      ].map((match) => match[1]!),
    ),
  ].slice(0, 5);
}
export function textPage(text: string, page: number): string {
  const boundary = (at: number) => (at > 0 && /[\uDC00-\uDFFF]/.test(text[at] ?? "") ? at - 1 : at);
  return text.slice(boundary(page * 16_000), boundary((page + 1) * 16_000));
}
