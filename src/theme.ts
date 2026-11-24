import { ICON_BODIES } from "./shared/icons.ts";
import { h, Icon, type VNode } from "./shared/kit.ts";

// Brand & semantic accents aligned with tempmail.best/DESIGN.md (Nova Mail Console).
// Neutral surfaces, borders, and foregrounds inherit the host's native light/dark theme.
export const MAIL_ACCENT = "#5073ee";
export const MAIL_ACCENT_MUTED = "#5073ee1a";
export const MAIL_ACCENT_BORDER = "#5073ee4d";
export const MAIL_WARNING = "#eab308";
export const MAIL_DESTRUCTIVE = "#ef4444";

// Native Box-composed brand mark matching tempmail.best Header:
// black rounded badge, white mail glyph, and restrained mail-accent dot.
export function brandMark(size = 28): VNode {
  const glyph = Math.round(size * 0.52);
  const dot = size >= 36 ? 9 : 7;
  return h(
    "Box",
    {
      width: size,
      height: size,
      radius: Math.round(size * 0.25),
      background: "#09090b",
      borderWidth: 1,
      borderColor: "border",
      center: true,
      tw: "shrink-0",
    },
    Icon("mail", glyph, "#ffffff"),
    h("Box", {
      absolute: true,
      top: size - dot + 1,
      left: size - dot + 1,
      width: dot,
      height: dot,
      radius: dot / 2,
      background: MAIL_ACCENT,
      borderWidth: 1.5,
      borderColor: "background",
    }),
  );
}

// Color SVG data URI for manifest metadata (rendered as an image, not a monochrome mask).
export function brandIconUri(): string {
  const mail = ICON_BODIES.mail.replaceAll("currentColor", "#ffffff");
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    '<rect x="1" y="1" width="22" height="22" rx="6" fill="#09090b" stroke="#27272a" stroke-width="1"/>' +
    `<g transform="translate(5 5) scale(0.583)">${mail}</g>` +
    `<circle cx="19.5" cy="19.5" r="3" fill="${MAIL_ACCENT}" stroke="#09090b" stroke-width="1.5"/>` +
    "</svg>";
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
