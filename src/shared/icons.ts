export const ICON_NAMES = {
  mail: "ri:mail-line",
  refresh: "ri:refresh-line",
  trash: "ri:delete-bin-line",
  external: "ri:external-link-line",
  copy: "ri:file-copy-line",
  key: "ri:key-2-line",
  prev: "ri:skip-back-fill",
  next: "ri:skip-forward-fill",
} as const;

export type IconName = keyof typeof ICON_NAMES;
