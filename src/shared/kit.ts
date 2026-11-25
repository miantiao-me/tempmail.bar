import { ICON_NAMES, type IconName } from "./icons.ts";

export type { IconName };
export type { Lang, Env } from "./lang.ts";
export { langOf, t } from "./lang.ts";
export { ago, when } from "./format.ts";
export { readJSON, writeJSON } from "./storage.ts";

export type Child = VNode | string | number | boolean | null | undefined;

export interface VNode {
  type: string;
  props?: Record<string, unknown>;
  key?: string;
  children?: Child[];
}

export function h(
  type: string,
  props?: Record<string, unknown> | null,
  ...children: (Child | Child[])[]
): VNode {
  return {
    type,
    props: props ?? {},
    children: children
      .flat()
      .filter((child): child is Child => child !== null && child !== undefined && child !== false),
  };
}

export function T(text: string, props: Record<string, unknown> = {}): VNode {
  return h("Text", { text, ...props });
}

export function Icon(name: IconName, size = 14, color?: string): VNode {
  return h("Icon", {
    name: ICON_NAMES[name],
    width: size,
    height: size,
    ...(color ? { textColor: color } : {}),
  });
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
