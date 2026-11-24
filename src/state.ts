import { errorText, readJSON, t, writeJSON, type Lang } from "./shared/kit.ts";
import { ServiceError } from "./shared/service.ts";
import {
  codes,
  createMailbox,
  deleteMailbox,
  getMessage,
  listMessages,
  messageText,
  validSession,
  type Lifetime,
  type Message,
  type Session,
} from "./api.ts";

export type Phase =
  | "idle"
  | "preparing"
  | "computing"
  | "creating"
  | "saving"
  | "save-error"
  | "ready"
  | "expired"
  | "deleting";
const STORAGE = "tempmail:mailbox:v1";
const SECRET = "mailboxToken";
export class MailModel {
  lang: Lang = "zh";
  lifetime: Lifetime = "10m";
  session: Session | null = null;
  phase: Phase = "idle";
  progress = 0;
  error = "";
  detailError = "";
  messages: Message[] = [];
  detail: Message | null = null;
  body = "";
  bodyPage = 0;
  candidateCodes: string[] = [];
  selectedId = "";
  readIds = new Set<string>();
  loading = false;
  detailLoading = false;
  confirm: "" | "delete" | "replace" = "";
  expanded = false;
  active = false;
  updatedAt = 0;
  notify = true;
  private seen = new Map<string, Set<string>>();
  private restored = false;
  private generation = 0;
  private readVersion = 0;
  private authFailed = false;
  private blockedUntil = 0;
  private createBlockedUntil = 0;
  private expiredSecret = false;
  private retired: Session | null = null;
  private createAbort: AbortController | null = null;
  private pollAbort: AbortController | null = null;
  private detailAbort: AbortController | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private secretJob: Promise<void> = Promise.resolve();
  private changeSecret(operation: () => Promise<void>): Promise<void> {
    const job = this.secretJob.then(operation);
    this.secretJob = job.catch(() => {});
    return job;
  }
  get busy(): boolean {
    return ["preparing", "computing", "creating", "saving", "deleting"].includes(this.phase);
  }
  get unread(): number {
    return this.messages.filter((message) => !this.readIds.has(message.id)).length;
  }
  get remaining(): number {
    return this.session ? Math.max(0, Math.ceil((this.session.expiresAt - Date.now()) / 1000)) : 0;
  }
  restore(): void {
    if (this.restored) return;
    this.restored = true;
    let raw = "";
    try {
      raw = $metrix.secret(SECRET) || "";
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const session = JSON.parse(raw) as unknown;
      if (!validSession(session)) throw new Error("invalid session");
      if (session.expiresAt <= Date.now()) {
        this.phase = "expired";
        this.expiredSecret = true;
        return;
      }
      this.session = session;
      this.lifetime = session.lifetime;
      this.phase = "ready";
      const saved = readJSON<{ email: string; readIds: string[] } | null>(STORAGE, null);
      if (saved?.email === session.email && Array.isArray(saved.readIds))
        this.readIds = new Set(saved.readIds.slice(0, 20));
    } catch {
      this.error = t(
        this.lang,
        "会话凭据无效，请重新创建",
        "Invalid saved session; create a new inbox",
      );
    }
  }
  activate(): void {
    this.active = true;
    if (this.expiredSecret) {
      this.expiredSecret = false;
      void this.changeSecret(() => $metrix.deleteSecret(SECRET)).catch(() => {});
    }
    this.planPoll();
    $metrix.invalidate();
  }
  private remember(): void {
    if (this.session)
      writeJSON(STORAGE, {
        email: this.session.email,
        expiresAt: this.session.expiresAt,
        readIds: [...this.readIds].slice(0, 20),
      });
  }
  private planPoll(): void {
    if (!this.active) return;
    const delay =
      this.session && this.phase !== "save-error" && !this.authFailed
        ? Math.min(
            86_400_000,
            Math.max(this.expanded ? 15_000 : 60_000, this.blockedUntil - Date.now()),
          )
        : null;
    try {
      $metrix.schedule(delay);
    } catch {
      // Sandbox and preview hosts do not expose a scheduling backend.
    }
  }
  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    if (this.clock) clearInterval(this.clock);
    this.clock = expanded
      ? setInterval(() => {
          this.tick();
          $metrix.invalidate();
        }, 1000)
      : null;
    this.tick();
    this.planPoll();
    if (expanded && Date.now() - this.updatedAt > 15_000) void this.refresh();
  }
  stop(): void {
    this.active = false;
    this.generation++;
    this.createAbort?.abort();
    this.pollAbort?.abort();
    this.detailAbort?.abort();
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
  }
  private forget(phase: "idle" | "expired"): void {
    this.generation++;
    this.pollAbort?.abort();
    this.detailAbort?.abort();
    this.session = null;
    this.messages = [];
    this.detail = null;
    this.body = "";
    this.candidateCodes = [];
    this.selectedId = "";
    this.readIds.clear();
    this.loading = false;
    this.detailLoading = false;
    this.authFailed = false;
    this.phase = phase;
    try {
      localStorage.removeItem(STORAGE);
    } catch {
      /* 本地记录可选 */
    }
    if (this.active)
      void this.changeSecret(() => $metrix.deleteSecret(SECRET)).catch(() => {
        this.error = t(this.lang, "凭据清理失败", "Could not remove saved credentials");
        $metrix.invalidate();
      });
    this.planPoll();
    $metrix.invalidate();
  }
  tick(): void {
    if (this.session && this.session.expiresAt <= Date.now() && !this.busy) this.forget("expired");
  }
  cancelCreate(): void {
    if (["preparing", "computing"].includes(this.phase)) this.createAbort?.abort();
  }
  async create(replace = false): Promise<void> {
    if (
      !this.active ||
      this.busy ||
      (this.session && !replace) ||
      Date.now() < this.createBlockedUntil
    )
      return;
    const previous = this.session;
    const generation = ++this.generation;
    this.pollAbort?.abort();
    this.detailAbort?.abort();
    this.loading = false;
    this.detailLoading = false;
    const controller = new AbortController();
    this.createAbort = controller;
    this.phase = "preparing";
    this.progress = 0;
    this.error = "";
    $metrix.invalidate();
    try {
      const session = await createMailbox(
        this.lifetime,
        this.lang,
        controller.signal,
        (phase) => {
          if (generation === this.generation) {
            this.phase = phase;
            $metrix.invalidate();
          }
        },
        (value) => {
          if (generation === this.generation) {
            this.progress = value;
            $metrix.invalidate();
          }
        },
      );
      if (generation !== this.generation || controller.signal.aborted) return;
      this.session = session;
      this.retired = previous;
      this.messages = [];
      this.detail = null;
      this.body = "";
      this.candidateCodes = [];
      this.selectedId = "";
      this.readIds.clear();
      this.authFailed = false;
      await this.persist();
    } catch (error) {
      if (generation !== this.generation) return;
      this.phase = previous ? "ready" : "idle";
      if (!controller.signal.aborted) this.failure(error, false);
    } finally {
      if (generation === this.generation) {
        this.createAbort = null;
        this.tick();
        this.planPoll();
        $metrix.invalidate();
      }
    }
  }
  private async persist(): Promise<void> {
    const session = this.session;
    const generation = this.generation;
    if (!session || !this.active) return;
    this.phase = "saving";
    $metrix.invalidate();
    try {
      const value = JSON.stringify(session);
      if (new TextEncoder().encode(value).length > 2560) throw new Error("too large");
      // 邮箱身份和 Bearer 原子写入同一 secret，避免两处存储不一致而无法恢复。
      await this.changeSecret(() => $metrix.setSecret(SECRET, value));
      if (generation !== this.generation || session !== this.session) return;
      this.remember();
      this.phase = "ready";
      this.error = "";
      const retired = this.retired;
      this.retired = null;
      if (retired) {
        try {
          await deleteMailbox(retired, this.lang);
        } catch {
          this.error = t(
            this.lang,
            "旧邮箱将按原时间到期",
            "Previous inbox will expire at its original time",
          );
        }
      }
    } catch {
      if (generation === this.generation) {
        this.phase = "save-error";
        this.error = t(
          this.lang,
          "会话尚未保存，请重试保存；关闭后可能丢失",
          "Session not saved; retry before closing",
        );
      }
    }
    this.planPoll();
    $metrix.invalidate();
  }
  async retrySave(): Promise<void> {
    if (this.phase === "save-error") await this.persist();
  }
  private failure(error: unknown, mailbox = true): void {
    this.error = errorText(error);
    if (error instanceof ServiceError && error.status === 429) {
      const until = error.retryAt || Date.now() + 60_000;
      if (mailbox) this.blockedUntil = until;
      else this.createBlockedUntil = until;
    }
    if (mailbox && error instanceof ServiceError && error.status === 401) this.authFailed = true;
  }
  async refresh(): Promise<void> {
    this.restore();
    this.tick();
    const session = this.session;
    if (
      !session ||
      this.loading ||
      this.busy ||
      this.phase === "save-error" ||
      Date.now() < this.blockedUntil
    )
      return;
    const generation = this.generation;
    const controller = new AbortController();
    this.pollAbort = controller;
    this.loading = true;
    $metrix.invalidate();
    try {
      const messages = await listMessages(session, this.lang, controller.signal);
      if (generation !== this.generation || controller.signal.aborted) return;
      this.tick();
      if (session !== this.session) return;
      this.announce(session.email, messages);
      this.messages = messages;
      this.updatedAt = Date.now();
      this.error = "";
      this.authFailed = false;
      this.readIds = new Set(
        [...this.readIds].filter((id) => messages.some((message) => message.id === id)),
      );
      this.remember();
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted) this.failure(error);
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        this.planPoll();
        $metrix.invalidate();
      }
    }
  }
  // Notifies only mail that arrives after this mailbox was first listed.
  private announce(email: string, messages: Message[]): void {
    const known = this.seen.get(email);
    this.seen.set(email, new Set(messages.map((message) => message.id)));
    if (!known || !this.notify || typeof Notification === "undefined") return;
    for (const message of messages.filter((item) => !known.has(item.id)).slice(0, 3)) {
      const code = codes(`${message.subject ?? ""}\n${message.preview ?? ""}`)[0];
      try {
        new Notification(
          code
            ? `${this.lang === "zh" ? "验证码" : "Code"} ${code}`
            : message.subject || "TempMail.Best",
          {
            body: message.from?.name || message.from?.address || "",
            tag: `tempmail-${message.id}`,
          },
        );
      } catch {
        // Denied notifications must not break polling.
      }
    }
  }
  async readMessage(id: string): Promise<void> {
    this.tick();
    const session = this.session;
    if (!session || this.busy || Date.now() < this.blockedUntil) return;
    this.detailAbort?.abort();
    const controller = new AbortController();
    this.detailAbort = controller;
    const generation = this.generation;
    const version = ++this.readVersion;
    this.selectedId = id;
    this.detail = null;
    this.body = "";
    this.candidateCodes = [];
    this.bodyPage = 0;
    this.detailError = "";
    this.detailLoading = true;
    $metrix.invalidate();
    try {
      const detail = await getMessage(session, id, this.lang, controller.signal);
      if (
        generation !== this.generation ||
        version !== this.readVersion ||
        controller.signal.aborted
      )
        return;
      this.tick();
      if (session !== this.session) return;
      this.detail = detail;
      this.body = messageText(detail);
      this.candidateCodes = codes(`${detail.subject || ""}\n${this.body}`);
      this.readIds.add(id);
      this.remember();
    } catch (error) {
      if (
        generation === this.generation &&
        version === this.readVersion &&
        !controller.signal.aborted
      ) {
        this.detailError = errorText(error);
        if (error instanceof ServiceError && [401, 429].includes(error.status)) {
          this.failure(error);
          this.planPoll();
        }
      }
    } finally {
      if (generation === this.generation && version === this.readVersion) {
        this.detailLoading = false;
        $metrix.invalidate();
      }
    }
  }
  async confirmAction(): Promise<void> {
    const action = this.confirm;
    this.confirm = "";
    if (!this.active || this.busy) return;
    if (action === "replace") {
      await this.create(true);
      return;
    }
    const session = this.session;
    if (action !== "delete" || !session) return;
    const generation = this.generation;
    const previousPhase = this.phase;
    this.phase = "deleting";
    this.error = "";
    $metrix.invalidate();
    try {
      await deleteMailbox(session, this.lang);
      if (generation === this.generation) this.forget("idle");
    } catch (error) {
      if (generation === this.generation) {
        this.phase = previousPhase;
        this.failure(error);
        $metrix.invalidate();
      }
    }
  }
}
export const model = new MailModel();
