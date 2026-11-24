import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import mail from "../src/index.ts";
import { click, find, host, requestURL, settled, text } from "./helpers.ts";

host();
const copied: string[] = [];
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    clipboard: {
      writeText: async (value: string) => {
        copied.push(value);
      },
    },
  },
});

test("copies a long address and pages or copies the entire message body", async () => {
  const email = "a000000" + "a".repeat(32) + "@chuan.info";
  const session = {
    email,
    token: "fixture-mailbox-token",
    lifetime: "10m",
    expiresAt: Date.now() + 600_000,
  };
  Object.assign($metrix, { secret: () => JSON.stringify(session) });
  const body = "验证码：123456\n" + "长正文".repeat(6000) + "正文结束";
  const summary = {
    id: "long",
    from: { name: "Example", address: "sender@example.com" },
    to: email,
    subject: "长邮件",
    preview: "验证码",
    date: new Date().toISOString(),
  };
  const urls: string[] = [];
  globalThis.fetch = async (url) => {
    urls.push(requestURL(url));
    return Response.json(
      requestURL(url).endsWith("/messages")
        ? [summary]
        : { ...summary, text: body, html: "<img src='https://invalid.example/tracker'>" },
    );
  };
  await mail.scheduled({ inputs: { lang: "zh" } });
  click(find(mail.render({ inputs: { lang: "zh" } }).panel, "复制邮箱地址"));
  await settled();
  assert.equal(copied.at(-1), email);
  click(find(mail.render({ inputs: { lang: "zh" } }).panel, "长邮件"));
  await settled();
  const opened = mail.render({ inputs: { lang: "zh" } }).panel;
  const selectedTw = find(opened, "长邮件").props?.tw;
  assert.ok(typeof selectedTw === "string" && selectedTw.includes("bg-surfacePressed"));
  assert.doesNotMatch(text(opened), /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  click(find(opened, "下一页"));
  assert.match(text(mail.render({ inputs: { lang: "zh" } }).panel), /正文结束/);
  click(find(mail.render({ inputs: { lang: "zh" } }).panel, "复制正文"));
  await settled();
  assert.equal(copied.at(-1), body);
  assert.equal(urls.length, 2);
});

test("shows the latest verification code without opening the message", async () => {
  // Same mailbox as the previous test; the model keeps its restored session.
  const session = {
    email: "a000000" + "a".repeat(32) + "@chuan.info",
    token: "fixture-mailbox-token",
    lifetime: "10m",
    expiresAt: Date.now() + 600_000,
  };
  Object.assign($metrix, { secret: () => JSON.stringify(session) });
  const urls: string[] = [];
  globalThis.fetch = async (url) => {
    urls.push(requestURL(url));
    return Response.json([
      {
        id: "otp",
        from: { address: "noreply@example.com" },
        to: session.email,
        subject: "Your verification code is 482913",
        preview: "Use it within 10 minutes",
        date: new Date().toISOString(),
      },
    ]);
  };
  await mail.scheduled({ inputs: { lang: "zh" } });
  const panel = mail.render({ inputs: { lang: "zh" } }).panel;
  assert.match(text(panel), /482913/);
  assert.ok(urls.every((url) => url.endsWith("/messages")));
  click(find(panel, "复制验证码 482913"));
  await settled();
  assert.equal(copied.at(-1), "482913");
});
