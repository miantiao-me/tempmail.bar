import { t, type Lang } from "./lang.ts";

export function ago(ts: number, lang: Lang): string {
  if (!ts) return t(lang, "从未", "never");
  const seconds = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const later = seconds > 0;
  if (abs < 45) return t(lang, "刚刚", "just now");
  const [value, zh, en] =
    abs < 3600
      ? [Math.round(abs / 60), "分钟", "min"]
      : abs < 86_400
        ? [Math.round(abs / 3600), "小时", "hr"]
        : [Math.round(abs / 86_400), "天", "days"];
  return lang === "zh"
    ? `${value} ${zh}${later ? "后" : "前"}`
    : `${value} ${en} ${later ? "from now" : "ago"}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function when(ts: number, lang: Lang): string {
  const date = new Date(ts);
  const hm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (date.toDateString() === new Date().toDateString()) return hm;
  return t(
    lang,
    `${date.getMonth() + 1}月${date.getDate()}日 ${hm}`,
    `${MONTHS[date.getMonth()]} ${date.getDate()}, ${hm}`,
  );
}
