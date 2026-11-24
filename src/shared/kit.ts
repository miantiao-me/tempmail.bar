import { ICON_BODIES } from "./icons.ts";
import type { IconName } from "./icons.ts";

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

const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">';

export function iconSvg(name: IconName): string {
  return SVG_OPEN + ICON_BODIES[name] + "</svg>";
}

export function Icon(name: IconName, size = 14, color?: string): VNode {
  return h("Icon", {
    svg: iconSvg(name),
    width: size,
    height: size,
    ...(color ? { textColor: color } : {}),
  });
}

export function dataIcon(name: IconName, color: string, size = 18): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
    ICON_BODIES[name].replaceAll("currentColor", color) +
    "</svg>";
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
