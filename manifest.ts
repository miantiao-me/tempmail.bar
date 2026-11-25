import { languageInput, type BarManifest } from "./src/shared/manifest.ts";
import { brandIconUri } from "./src/theme.ts";

const manifest: BarManifest = {
  id: "tempmail",
  title: "TempMail.Best",
  version: "0.1.0",
  minAppVersion: "0.3.0",
  category: "utilities",
  icon: brandIconUri(),
  description: "Create a temporary inbox, read incoming mail, and copy verification codes.",
  locales: {
    "zh-Hans": {
      title: "TempMail.Best",
      description: "创建临时收件箱、阅读来信并一键复制验证码。",
    },
  },
  material: "solid",
  refresh: "0",
  openMode: "window",
  windowStyle: "standard",
  homepage: "https://github.com/miantiao-me/tempmail.bar",
  license: "Apache-2.0",
  permissions: { network: ["https://tempmail.best"] },
  inputs: [
    languageInput,
    {
      name: "mailboxToken",
      type: "secret",
      label: "Mailbox session (managed)",
      help: "Managed automatically; no manual token needed",
      zh: { label: "邮箱会话（自动管理）", help: "由创建流程自动保存，无需手动填写" },
    },
    {
      name: "notify",
      type: "bool",
      label: "New mail alerts",
      default: true,
      help: "Alert on new mail with the detected code",
      zh: { label: "新邮件通知", help: "收到新邮件时提醒，识别出的验证码直接显示在通知里" },
    },
  ],
  apis: ["app", "shell", "clipboard", "localStorage", "crypto", "auth", "notification"],
  docs: `Create a 10-minute or 1-hour temporary inbox from your menu bar — receive-only, with no API key required.

How to use
1. Pick 10 minutes or 1 hour and click Create inbox.
2. Copy the address; incoming messages appear automatically (refreshes every 15s while open, 60s when closed).
3. Copy detected verification codes in one click from the top banner or new-mail notifications.

Privacy & limits
- Messages are rendered as plain text with no remote images or scripts.
- Session credentials stay in your OS Keychain; message bodies stay in memory only.
- Polling stops automatically when the inbox expires.`,
  docsLocales: {
    "zh-Hans": `从菜单栏一键创建 10 分钟或 1 小时临时邮箱，只收件，无需 API Key。

使用方式
1. 选择 10 分钟或 1 小时，点击「创建邮箱」。
2. 复制地址即可收信，展开窗口每 15 秒刷新、收起每 60 秒刷新。
3. 识别出的验证码会置顶显示，也可在新邮件通知中直接查看并一键复制。

安全与限制
- 来信转为原生纯文本显示，不执行脚本，不加载外部图片。
- 邮箱会话安全保存在系统钥匙串中，邮件正文仅驻留内存。
- 到期后自动停止轮询，删除或换新前均需二次确认。`,
  },
};

export default manifest;
