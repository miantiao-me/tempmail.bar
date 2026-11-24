import { T, ago, h, Icon, t, when, type Child, type IconName, type VNode } from "./shared/kit.ts";
import { copyText } from "./shared/service.ts";
import { codes, textPage, type Lifetime, type Message } from "./api.ts";
import { model as m, type Phase } from "./state.ts";
import {
  brandMark,
  MAIL_ACCENT,
  MAIL_ACCENT_BORDER,
  MAIL_ACCENT_MUTED,
  MAIL_DESTRUCTIVE,
  MAIL_WARNING,
} from "./theme.ts";

const label = (zh: string, en: string) => t(m.lang, zh, en);
const PAGE = 16_000;

function iconButton(
  name: IconName,
  onClick: () => void,
  options: { tooltip?: string; disabled?: boolean } = {},
): VNode {
  const disabled = options.disabled ?? false;
  return h(
    "ButtonBase",
    {
      width: 28,
      height: 28,
      center: true,
      radius: 7,
      label: options.tooltip ?? name,
      disabled,
      tooltip: options.tooltip,
      tw: `shrink-0 ${disabled ? "opacity-30" : "cursor-pointer hover:bg-surfaceHover active:bg-surfacePressed focus-visible:bg-surfacePressed"}`,
      ...(disabled ? {} : { onClick }),
    },
    Icon(name, 14, "textMuted"),
  );
}

function durations(): VNode {
  return h("Segmented", {
    value: m.lifetime,
    disabled: m.busy,
    items: [
      { label: label("10 分钟", "10 minutes"), value: "10m" },
      { label: label("1 小时", "1 hour"), value: "1h" },
    ],
    onChange: (value: Lifetime) => {
      if (!m.busy) {
        m.lifetime = value;
        $metrix.invalidate();
      }
    },
  });
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

const STAGES: Partial<Record<Phase, [string, string]>> = {
  preparing: ["准备中…", "Preparing…"],
  computing: ["正在完成官方计算挑战…", "Solving the official challenge…"],
  creating: ["正在创建邮箱…", "Creating inbox…"],
  saving: ["正在保存会话…", "Saving session…"],
  deleting: ["正在删除…", "Deleting…"],
};

function ttlRatio(): number {
  if (!m.session) return 0;
  const total = m.session.lifetime === "1h" ? 3600 : 600;
  return Math.max(0, Math.min(1, m.remaining / total));
}

function ttlColor(ratio: number): string {
  if (ratio < 0.15) return MAIL_DESTRUCTIVE;
  if (ratio < 0.3) return MAIL_WARNING;
  return MAIL_ACCENT;
}

function status(): { text: string; colorClass: string } {
  const stage = STAGES[m.phase];
  if (stage) return { text: label(...stage), colorClass: `text-[${MAIL_ACCENT}]` };
  if (m.error) return { text: m.error, colorClass: `text-[${MAIL_WARNING}]` };
  if (m.phase === "expired")
    return { text: label("邮箱已到期", "Inbox expired"), colorClass: `text-[${MAIL_WARNING}]` };
  if (!m.session)
    return {
      text: label("限时邮箱 · 只收件", "Temporary · receive only"),
      colorClass: "text-textMuted",
    };
  const ratio = ttlRatio();
  const colorClass =
    ratio < 0.15
      ? `text-[${MAIL_DESTRUCTIVE}]`
      : ratio < 0.3
        ? `text-[${MAIL_WARNING}]`
        : "text-textMuted";
  return {
    text: `${label(`剩 ${clock(m.remaining)}`, `${clock(m.remaining)} left`)}${m.unread ? label(` · ${m.unread} 封未读`, ` · ${m.unread} unread`) : ""}`,
    colorClass,
  };
}

// The newest message's code, read from its subject and preview without fetching the body.
function latestCode(): { code: string; message: Message } | null {
  const message = m.messages[0];
  if (!message) return null;
  const code = codes(`${message.subject ?? ""}\n${message.preview ?? ""}`)[0];
  return code ? { code, message } : null;
}

function topHeader(): VNode {
  const st = status();
  return h(
    "Row",
    { tw: "items-center gap-2.5 px-4 pt-3 pb-2.5 shrink-0" },
    brandMark(28),
    h(
      "Column",
      { tw: "flex-1 min-w-0 gap-0.5" },
      T("TempMail.Best", { tw: "text-[14.5px] font-semibold leading-tight truncate text-text" }),
      T(st.text, { tw: `text-[11.5px] tabular-nums truncate ${st.colorClass}` }),
    ),
    iconButton("refresh", () => void m.refresh(), {
      tooltip: label("刷新收件箱", "Refresh inbox"),
      disabled: !m.session || m.loading || m.busy,
    }),
    iconButton(
      "trash",
      () => {
        m.confirm = "delete";
        $metrix.invalidate();
      },
      { tooltip: label("删除邮箱", "Delete inbox"), disabled: !m.session || m.busy || !m.active },
    ),
    iconButton("external", () => $metrix.openURL("https://tempmail.best"), {
      tooltip: label("打开官网", "Open website"),
    }),
  );
}

// Signature Disposable Address Capsule matching tempmail.best/DESIGN.md.
function capsule(): VNode {
  const session = m.session!;
  const ratio = ttlRatio();
  const barColor = ttlColor(ratio);
  const found = latestCode();
  const copyLabel = label("复制邮箱地址", "Copy email address");
  return h(
    "Column",
    { tw: "px-4 pb-3 gap-2.5 shrink-0" },
    h(
      "ButtonBase",
      {
        label: copyLabel,
        tooltip: copyLabel,
        radius: 10,
        tw: "flex-row items-center gap-3 px-3.5 py-2 w-full min-w-0 rounded-xl bg-surface border border-border cursor-pointer hover:bg-surfaceHover active:bg-surfacePressed",
        onClick: () => void copyText(session.email, m.lang),
      },
      T(session.email, {
        tw: "flex-1 min-w-0 font-mono text-[14.5px] font-medium truncate text-text",
        tooltip: session.email,
      }),
      h(
        "Box",
        {
          width: 28,
          height: 28,
          radius: 7,
          background: MAIL_ACCENT,
          center: true,
          tw: "shrink-0",
        },
        Icon("copy", 14, "#ffffff"),
      ),
    ),
    h(
      "Box",
      { height: 4, radius: 2, background: "border", fillWidth: true },
      h("Box", {
        absolute: true,
        top: 0,
        left: 0,
        height: 4,
        radius: 2,
        widthPercent: Math.max(0, Math.min(100, ratio * 100)),
        background: barColor,
      }),
    ),
    found
      ? h(
          "Row",
          {
            background: MAIL_ACCENT_MUTED,
            borderWidth: 1,
            borderColor: MAIL_ACCENT_BORDER,
            radius: 10,
            tw: "items-center gap-3 px-3.5 py-2 min-w-0",
          },
          Icon("key", 14, MAIL_ACCENT),
          T(found.code, {
            tw: `font-mono text-[20px] font-semibold tabular-nums shrink-0 text-[${MAIL_ACCENT}]`,
          }),
          T(
            `${found.message.from?.name || found.message.from?.address || "—"} · ${ago(Date.parse(found.message.date), m.lang)}`,
            { tw: "flex-1 min-w-0 text-[11px] truncate text-textMuted" },
          ),
          h(
            "ButtonBase",
            {
              label: `${label("复制验证码", "Copy code")} ${found.code}`,
              background: MAIL_ACCENT,
              radius: 7,
              tw: "px-3 py-1.5 shrink-0 cursor-pointer",
              onClick: () => void copyText(found.code, m.lang),
            },
            T(label("复制", "Copy"), {
              tw: "text-[11.5px] font-semibold text-[#ffffff]",
            }),
          ),
        )
      : null,
  );
}

function messageRow(message: Message): VNode {
  const unread = !m.readIds.has(message.id);
  const selected = m.selectedId === message.id;
  return h(
    "ButtonBase",
    {
      key: message.id,
      label: message.subject || label("无主题", "No subject"),
      fontWeight: 400,
      tw: `flex-row items-center gap-3 px-4 py-2.5 min-w-0 cursor-pointer ${selected ? "bg-surfacePressed" : "hover:bg-surfaceHover active:bg-surfacePressed"}`,
      onClick: () => void m.readMessage(message.id),
    },
    h(
      "Column",
      { tw: "flex-1 min-w-0 gap-0.5" },
      h(
        "Row",
        { tw: "items-center gap-1.5" },
        unread
          ? h("Box", { width: 6, height: 6, radius: 3, background: MAIL_ACCENT, tw: "shrink-0" })
          : null,
        T(message.from?.name || message.from?.address || "—", {
          tw: "flex-1 text-[11px] truncate text-textMuted",
        }),
        T(ago(Date.parse(message.date), m.lang), {
          tw: "text-[11px] shrink-0 text-textMuted",
        }),
      ),
      T(message.subject || label("无主题", "No subject"), {
        tw: `text-[12.5px] truncate text-text ${unread ? "font-semibold" : "font-medium"}`,
      }),
      T(message.preview, { tw: "text-[11px] line-clamp-2 text-textMuted" }),
    ),
  );
}

function formatDate(raw: string): string {
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? when(ts, m.lang) : raw;
}

function reader(): VNode {
  if (!m.detail)
    return h(
      "Column",
      { tw: "flex-1 items-center justify-center" },
      T(
        m.detailError ||
          (m.detailLoading
            ? label("读取中…", "Loading…")
            : label("选择邮件查看正文", "Select a message")),
        { tw: `text-[12px] ${m.detailError ? `text-[${MAIL_WARNING}]` : "text-textMuted"}` },
      ),
    );
  const pages = Math.ceil(m.body.length / PAGE);
  return h(
    "Column",
    { tw: "flex-1 min-w-0 min-h-0 gap-2.5 px-4 pt-3" },
    h(
      "Row",
      { tw: "items-start gap-2 shrink-0" },
      h(
        "Column",
        { tw: "flex-1 min-w-0 gap-0.5" },
        T(m.detail.subject || label("无主题", "No subject"), {
          tw: "text-[15px] font-semibold leading-snug text-text",
        }),
        T(
          `${m.detail.from?.address || m.detail.from?.name || "—"} · ${formatDate(m.detail.date)}`,
          {
            tw: "text-[11px] truncate text-textMuted",
          },
        ),
      ),
      iconButton("copy", () => void copyText(m.body, m.lang), {
        tooltip: label("复制正文", "Copy message"),
      }),
    ),
    m.candidateCodes.length
      ? h(
          "Row",
          { tw: "gap-2 shrink-0" },
          ...m.candidateCodes.map((code) =>
            h(
              "ButtonBase",
              {
                key: code,
                label: `${label("复制验证码", "Copy code")} ${code}`,
                background: MAIL_ACCENT_MUTED,
                borderWidth: 1,
                borderColor: MAIL_ACCENT_BORDER,
                radius: 7,
                tw: "px-2.5 py-1 shrink-0 cursor-pointer",
                onClick: () => void copyText(code, m.lang),
              },
              T(code, { tw: `font-mono text-[12px] font-semibold text-[${MAIL_ACCENT}]` }),
            ),
          ),
        )
      : null,
    m.detailError ? T(m.detailError, { tw: `text-[11px] shrink-0 text-[${MAIL_WARNING}]` }) : null,
    h(
      "Scroll",
      { tw: "flex-1 min-h-0" },
      T(textPage(m.body, m.bodyPage) || label("空正文", "Empty message"), {
        wrap: true,
        tw: "text-[13px] leading-relaxed text-text",
      }),
    ),
    pages > 1
      ? h(
          "Row",
          { tw: "items-center gap-2 pb-2.5 shrink-0" },
          iconButton(
            "prev",
            () => {
              m.bodyPage--;
              $metrix.invalidate();
            },
            { tooltip: label("上一页", "Previous page"), disabled: m.bodyPage === 0 },
          ),
          T(`${m.bodyPage + 1} / ${pages}`, {
            tw: "flex-1 text-center text-[11px] text-textMuted",
          }),
          iconButton(
            "next",
            () => {
              m.bodyPage++;
              $metrix.invalidate();
            },
            {
              tooltip: label("下一页", "Next page"),
              disabled: (m.bodyPage + 1) * PAGE >= m.body.length,
            },
          ),
        )
      : null,
  );
}

function inbox(narrow: boolean): VNode {
  return h(
    "Row",
    { tw: "flex-1 min-h-0 items-stretch" },
    h(
      "Column",
      { width: narrow ? 220 : 260, tw: "min-h-0 shrink-0 bg-surface" },
      h(
        "Scroll",
        { tw: "flex-1 min-h-0" },
        h(
          "Column",
          { tw: "pb-2" },
          ...(m.messages.length
            ? m.messages.map(messageRow)
            : [
                T(
                  m.loading
                    ? label("读取中…", "Loading…")
                    : label(
                        "等待来信，收到后会自动出现",
                        "Waiting for mail; it appears here automatically",
                      ),
                  {
                    tw: "px-4 py-10 text-[12px] text-center text-textMuted",
                  },
                ),
              ]),
        ),
      ),
    ),
    h("Box", { tw: "w-px shrink-0 bg-border" }),
    reader(),
  );
}

function empty(): VNode {
  const stage = STAGES[m.phase];
  const createDisabled = !m.active || m.busy;
  const createLabel = label("创建邮箱", "Create inbox");
  return h(
    "Column",
    { tw: "flex-1 min-h-0 items-center justify-center gap-5 px-8 pb-6" },
    h(
      "Column",
      { tw: "items-center justify-center gap-2.5" },
      brandMark(40),
      T(
        m.phase === "expired"
          ? label("邮箱已到期", "Inbox expired")
          : label("需要一个临时邮箱？", "Need a throwaway address?"),
        { tw: "text-[15px] font-semibold text-center text-text" },
      ),
      T(
        label(
          "地址在有效期内只收件，验证码会显示在最上方，到期后自动停止。",
          "The address only receives mail; codes appear at the top. It stops when it expires.",
        ),
        { tw: "text-[12px] text-center leading-snug text-textMuted" },
      ),
    ),
    h(
      "Row",
      { tw: "items-center gap-3" },
      durations(),
      stage
        ? ["preparing", "computing"].includes(m.phase)
          ? h("Button", { text: label("取消", "Cancel"), onClick: () => m.cancelCreate() })
          : null
        : h(
            "ButtonBase",
            {
              label: createLabel,
              background: "text",
              radius: 8,
              disabled: createDisabled,
              tw: `px-4 py-2 shrink-0 ${createDisabled ? "opacity-40" : "cursor-pointer"}`,
              ...(createDisabled ? {} : { onClick: () => void m.create() }),
            },
            T(createLabel, { tw: "text-[12.5px] font-semibold text-background" }),
          ),
    ),
    m.phase === "computing"
      ? h(
          "Box",
          { width: 240, height: 4, radius: 2, background: "border" },
          h("Box", {
            absolute: true,
            top: 0,
            left: 0,
            height: 4,
            radius: 2,
            widthPercent: Math.max(0, Math.min(100, m.progress * 100)),
            background: MAIL_ACCENT,
          }),
        )
      : null,
  );
}

export function view(width = 720): VNode {
  const content: Child[] = [
    topHeader(),
    m.phase === "save-error"
      ? h(
          "Row",
          { tw: "px-4 pb-2" },
          h("Button", {
            text: label("重试保存会话", "Retry saving session"),
            onClick: () => void m.retrySave(),
          }),
        )
      : null,
    ...(m.session
      ? [
          capsule(),
          h("Box", { tw: "w-full h-px bg-border shrink-0" }),
          inbox(width < 650),
          h("Box", { tw: "w-full h-px bg-border shrink-0" }),
          h(
            "Row",
            { tw: "items-center gap-3 px-4 py-2 shrink-0 bg-surface" },
            durations(),
            h("Spacer"),
            h("Button", {
              text: label("换新邮箱", "New inbox"),
              disabled: m.busy || m.phase === "save-error" || !m.active,
              onClick: () => {
                m.confirm = "replace";
                $metrix.invalidate();
              },
            }),
          ),
        ]
      : [h("Box", { tw: "w-full h-px bg-border shrink-0" }), empty()]),
    h("AlertDialog", {
      open: Boolean(m.confirm),
      title:
        m.confirm === "replace"
          ? label("换新邮箱？", "Replace inbox?")
          : label("删除当前邮箱？", "Delete inbox?"),
      message: label(
        "当前地址与邮件将无法继续使用。",
        "The current address and messages will no longer be available.",
      ),
      buttons: [
        label("取消", "Cancel"),
        m.confirm === "replace" ? label("换新", "Replace") : label("删除", "Delete"),
      ],
      onAction: (index: number) => {
        if (index === 1) void m.confirmAction();
        else {
          m.confirm = "";
          $metrix.invalidate();
        }
      },
      onDismiss: () => {
        m.confirm = "";
        $metrix.invalidate();
      },
    }),
  ];

  return h(
    "Column",
    {
      preferredWidth: 720,
      preferredHeight: 560,
      safeArea: true,
      tw: "size-full min-w-0 min-h-0 bg-background text-text",
    },
    ...content,
  );
}
