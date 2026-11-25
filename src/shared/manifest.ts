export interface BarInput {
  name: string;
  type: "string" | "integer" | "number" | "bool" | "secret" | "file" | "select";
  label?: string;
  default?: string | number | boolean;
  placeholder?: string;
  help?: string;
  required?: boolean;
  zh?: { label?: string; help?: string; placeholder?: string };
  options?: { value: string; label: string; zh?: string }[];
}

export interface BarManifest {
  id: string;
  title: string;
  version?: string;
  minAppVersion?: string;
  description?: string;
  locales?: Record<string, { title?: string; description?: string }>;
  icon?: string;
  category?: string;
  refresh?: string;
  material?: "glass" | "solid";
  placements?: string;
  openMode?: "flyout" | "dialog" | "window";
  windowStyle?: "standard" | "immersive";
  widget?: boolean;
  homepage?: string;
  license?: string;
  permissions?: {
    network?: string[];
    file?: string[];
  };
  inputs?: BarInput[];
  docs?: string;
  docsLocales?: Record<string, string>;
  apis?: string[];
  workload?: "standard" | "compute";
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function cdata(value: string): string {
  return value.replaceAll("]]>", "]]]]><![CDATA[>");
}

export function renderBar(manifest: BarManifest, script: string): string {
  const attributes: [string, string | undefined][] = [
    ["protocol-version", "0"],
    ["min-app-version", manifest.minAppVersion],
    ["id", manifest.id],
    ["title", manifest.title],
    ["version", manifest.version],
    ["description", manifest.description],
    ["icon", manifest.icon],
    ["category", manifest.category],
    ["refresh", manifest.refresh],
    ["material", manifest.material],
    ["placements", manifest.placements],
    ["open-mode", manifest.openMode],
    ["window-style", manifest.windowStyle],
    ["widget", manifest.widget ? "true" : undefined],
    ["homepage", manifest.homepage],
    ["license", manifest.license],
  ];

  const renderedAttributes = attributes
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(" ");

  const sections: string[] = [`<bar ${renderedAttributes}>`];

  if (manifest.locales) {
    for (const [lang, loc] of Object.entries(manifest.locales)) {
      const attrs = [
        `lang="${escapeAttribute(lang)}"`,
        loc.title ? `title="${escapeAttribute(loc.title)}"` : "",
        loc.description ? `description="${escapeAttribute(loc.description)}"` : "",
      ]
        .filter(Boolean)
        .join(" ");
      sections.push(`  <locale ${attrs} />`);
    }
  }

  const network = manifest.permissions?.network ?? [];
  const files = manifest.permissions?.file ?? [];
  if (network.length > 0 || files.length > 0) {
    const rules = [
      ...network.map((origin) => `    <network origin="${escapeAttribute(origin)}" />`),
      ...files.map((path) => `    <file path="${escapeAttribute(path)}" />`),
    ];
    sections.push("  <permissions>", ...rules, "  </permissions>");
  }

  if (manifest.inputs?.length) {
    const inputs = manifest.inputs.map((input) => {
      const attrs = [
        `name="${escapeAttribute(input.name)}"`,
        `type="${input.type}"`,
        input.label ? `label="${escapeAttribute(input.label)}"` : "",
        input.default === undefined ? "" : `default="${escapeAttribute(String(input.default))}"`,
        input.placeholder ? `placeholder="${escapeAttribute(input.placeholder)}"` : "",
        input.help ? `help="${escapeAttribute(input.help)}"` : "",
        input.required ? 'required="true"' : "",
      ]
        .filter(Boolean)
        .join(" ");
      const locale = Object.entries(input.zh ?? {})
        .map(([key, value]) => `${key}="${escapeAttribute(value)}"`)
        .join(" ");
      const options = (input.options ?? []).map((option) => {
        const attrs = `value="${escapeAttribute(option.value)}" label="${escapeAttribute(option.label)}"`;
        return option.zh
          ? `      <option ${attrs}><locale lang="zh-Hans" label="${escapeAttribute(option.zh)}" /></option>`
          : `      <option ${attrs} />`;
      });
      if (!locale && options.length === 0) return `    <input ${attrs} />`;
      const lines = [`    <input ${attrs}>`];
      if (locale) lines.push(`      <locale lang="zh-Hans" ${locale} />`);
      return [...lines, ...options, "    </input>"].join("\n");
    });
    sections.push("  <inputs>", ...inputs, "  </inputs>");
  }

  if (manifest.docs) {
    const locales = Object.entries(manifest.docsLocales ?? {}).map(
      ([lang, text]) =>
        `    <locale lang="${escapeAttribute(lang)}"><![CDATA[${cdata(text)}]]></locale>`,
    );
    sections.push(
      ...(locales.length > 0
        ? [`  <docs><![CDATA[${cdata(manifest.docs)}]]>`, ...locales, "  </docs>"]
        : [`  <docs><![CDATA[${cdata(manifest.docs)}]]></docs>`]),
    );
  }

  const apis = manifest.apis?.length ? ` apis="${escapeAttribute(manifest.apis.join(" "))}"` : "";
  const workload = manifest.workload ? ` workload="${manifest.workload}"` : "";
  sections.push(`  <script${apis}${workload}><![CDATA[${cdata(script)}]]></script>`);
  sections.push("</bar>", "");

  return sections.join("\n");
}

export const languageInput: BarInput = {
  name: "lang",
  type: "select",
  label: "Language",
  zh: { label: "语言" },
  default: "auto",
  options: [
    { value: "auto", label: "Follow Metrix.Bar", zh: "跟随 Metrix.Bar" },
    { value: "en", label: "English" },
    { value: "zh", label: "简体中文" },
  ],
};
