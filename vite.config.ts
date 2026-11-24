import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite-plus";
import manifest from "./manifest.ts";
import { renderBar } from "./src/shared/manifest.ts";

const noticesPath = fileURLToPath(new URL("./THIRD_PARTY_NOTICES.txt", import.meta.url));

function barArtifact(): Plugin {
  return {
    name: "bar-artifact",
    buildStart() {
      this.addWatchFile(noticesPath);
    },
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === "chunk");
      const entry = chunks[0];
      if (chunks.length !== 1 || !entry?.isEntry) {
        this.error("Build the dashboard as one Worker chunk.");
      }
      const notices = readFileSync(noticesPath, "utf8").replaceAll("*/", "* /");
      const source = renderBar(
        manifest,
        `/*!
${notices}*/
${entry.code}`,
      );
      delete bundle[entry.fileName];
      this.emitFile({ type: "asset", fileName: `${manifest.id}.bar`, source });
    },
  };
}

export default defineConfig({
  plugins: [barArtifact()],
  build: {
    target: "es2022",
    minify: true,
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "worker" },
  },
  fmt: { ignorePatterns: ["dist/**", "AGENTS.md", "LICENSE", "THIRD_PARTY_NOTICES.txt"] },
  lint: {
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: ["dist/**"],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
  },
});
