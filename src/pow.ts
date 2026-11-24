import { t, type Lang } from "./shared/lang.ts";

export interface Challenge {
  format?: number;
  token: string;
  challenge: { c: number; s: number; d: number };
  expires: number;
}

function prng(seed: string, length: number): string {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i);
    state += (state << 1) + (state << 4) + (state << 7) + (state << 8) + (state << 24);
  }
  state >>>= 0;
  let result = "";
  while (result.length < length) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    result += state.toString(16).padStart(8, "0");
  }
  return result.slice(0, length);
}

export async function solveChallenge(
  value: unknown,
  options: {
    signal: AbortSignal;
    onProgress?: (value: number) => void;
    budgetMs?: number;
    lang?: Lang;
  },
): Promise<number[]> {
  const lang = options.lang ?? "en";
  const response = value as Challenge;
  if (
    !response ||
    (response.format !== undefined && response.format !== 1) ||
    Object.hasOwn(response, "instrumentation")
  )
    throw new Error(t(lang, "暂不支持此计算挑战", "Unsupported challenge"));
  const { c, s, d } = response.challenge ?? {};
  if (
    typeof response.token !== "string" ||
    ![c, s, d].every(Number.isInteger) ||
    c < 1 ||
    c > 1000 ||
    s < 1 ||
    s > 256 ||
    d < 1 ||
    d > 16 ||
    !Number.isFinite(response.expires)
  )
    throw new Error(t(lang, "计算挑战格式无效", "Invalid challenge"));
  const deadline = Math.min(response.expires, Date.now() + (options.budgetMs ?? 240_000));
  const encoder = new TextEncoder();
  const solutions = Array.from({ length: c }, () => 0);
  let next = 0;
  let done = 0;
  let failed = false;
  const check = () => {
    options.signal.throwIfAborted();
    if (failed) throw new Error(t(lang, "计算已停止", "Stopped"));
    if (Date.now() >= deadline)
      throw new Error(t(lang, "计算挑战已过期或超时，请重试", "Challenge expired or timed out"));
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(8, c) }, async () => {
        while (next < c) {
          const index = next++;
          const salt = prng(`${response.token}${index + 1}`, s);
          const target = Array.from(prng(`${response.token}${index + 1}d`, d), (digit) =>
            Number.parseInt(digit, 16),
          );
          for (let nonce = 0; nonce < Number.MAX_SAFE_INTEGER; nonce++) {
            check();
            const digest = new Uint8Array(
              await crypto.subtle.digest("SHA-256", encoder.encode(`${salt}${nonce}`)),
            );
            if (target.every((digit, i) => ((digest[i >> 1]! >> (i % 2 ? 0 : 4)) & 15) === digit)) {
              check();
              solutions[index] = nonce;
              options.onProgress?.(++done / c);
              break;
            }
          }
        }
      }),
    );
    return solutions;
  } catch (error) {
    failed = true;
    throw error;
  }
}
