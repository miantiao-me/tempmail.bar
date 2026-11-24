export type Lang = "zh" | "en";

export interface Env {
  inputs: Record<string, unknown>;
  reason?: string;
  viewport?: {
    width: number;
    height: number;
    titleBar: { height: number; left: number; right: number };
  };
}

export function langOf(env: Env): Lang {
  return env.inputs.lang === "zh" ? "zh" : "en";
}

export function t(lang: Lang, zh: string, en: string): string {
  return lang === "zh" ? zh : en;
}
