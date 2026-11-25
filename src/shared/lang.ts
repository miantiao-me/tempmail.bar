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

let appLanguage: Lang = "en";

export async function initLanguage(): Promise<void> {
  if (await $metrix.caniuse?.("app.locale")) {
    const locale = await $metrix.system("app.locale");
    appLanguage = /^zh(?:$|-(?:hans|cn|sg)(?:-|$))/i.test(locale) ? "zh" : "en";
  }
}

export function langOf(env: Env): Lang {
  const language = env.inputs.lang;
  return language === "zh" || language === "en" ? language : appLanguage;
}

export function t(lang: Lang, zh: string, en: string): string {
  return lang === "zh" ? zh : en;
}
