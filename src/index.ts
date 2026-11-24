import { dataIcon, langOf, type Env } from "./shared/kit.ts";
import { model } from "./state.ts";
import { view } from "./views.ts";
export async function scheduled(env: Env): Promise<void> {
  model.lang = langOf(env);
  model.notify = env.inputs.notify !== false;
  model.restore();
  await model.refresh();
}
export function render(env: Env) {
  model.lang = langOf(env);
  model.restore();
  return {
    tray: {
      icon: dataIcon("mail", "currentColor"),
      title: model.unread ? String(model.unread) : "",
      tooltip: "TempMail.Best",
      error: model.error || undefined,
    },
    panel: view(env.viewport?.width),
  };
}
export function event(name: string, payload?: { type?: string }): void {
  if (name !== "lifecycle") return;
  if (payload?.type === "start") model.activate();
  if (payload?.type === "stop") model.stop();
  if (payload?.type === "expand") model.setExpanded(true);
  if (payload?.type === "collapse") model.setExpanded(false);
}
export default { scheduled, render, event };
