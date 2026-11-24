import type { VNode } from "../src/shared/kit.ts";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function nodes(tree: unknown): VNode[] {
  if (!tree || typeof tree !== "object") return [];
  const node = tree as VNode;
  return [node, ...(node.children ?? []).flatMap(nodes)];
}

export function text(tree: unknown): string {
  return nodes(tree)
    .map((node) => (typeof node.props?.text === "string" ? node.props.text : ""))
    .filter(Boolean)
    .join("\n");
}

export function find(tree: unknown, label: string): VNode {
  const node = nodes(tree).find(
    (node) =>
      node.props?.text === label || node.props?.label === label || node.props?.tooltip === label,
  );
  if (!node) throw new Error(`Control not found: ${label}\n${text(tree)}`);
  return node;
}

export function click(node: VNode): unknown {
  if (node.props?.disabled === true) return;
  return (node.props?.onClick as (() => unknown) | undefined)?.();
}

export function memoryStorage(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  };
}

export function host() {
  Object.assign(globalThis, {
    $metrix: {
      invalidate() {},
      log() {},
      toast() {},
      schedule() {},
      openURL() {},
      secret() {
        return "";
      },
    },
    localStorage: memoryStorage(),
  });
}

export async function settled(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

export type FetchInput = Parameters<typeof fetch>[0];

export function requestURL(input: FetchInput): string {
  return input instanceof Request ? input.url : input.toString();
}

export async function capture(name: string, panel: unknown): Promise<void> {
  const directory = process.env.UI_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${name}.json`), JSON.stringify(panel));
}
