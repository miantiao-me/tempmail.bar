import assert from "node:assert/strict";
import { afterEach, test, vi } from "vite-plus/test";

afterEach(() => vi.useRealTimers());
import { MailModel } from "../src/state.ts";
import { messageText, codes } from "../src/api.ts";
import { host, requestURL } from "./helpers.ts";

const email = "fixture@chuan.info";
const session = () => ({
  email,
  token: "mailbox-bearer-fixture",
  expiresAt: Date.now() + 60_000,
  lifetime: "10m",
});
const summary = {
  id: "message-1",
  from: { name: "Example", address: "sender@example.com" },
  to: email,
  subject: "验证邮件",
  preview: "验证码",
  date: "2026-11-10T00:00:00Z",
};
function setup(saved = "") {
  host();
  let secret = saved;
  let failSave = false;
  Object.assign($metrix, {
    secret: () => secret,
    setSecret: async (_name: string, value: string) => {
      if (failSave) throw new Error("keychain unavailable");
      secret = value;
    },
    deleteSecret: async () => {
      secret = "";
    },
  });
  const model = new MailModel();
  model.restore();
  model.activate();
  return {
    model,
    secret: () => secret,
    failSave: (value: boolean) => {
      failSave = value;
    },
  };
}
test("coalesces inbox creation, reuses the solution on retry, and stores the bearer in secrets", async () => {
  const env = setup();
  const bodies: string[] = [];
  let challenges = 0;
  globalThis.fetch = async (url, init) => {
    const path = new URL(requestURL(url)).pathname;
    if (path.endsWith("domains"))
      return Response.json({ domains: ["chuan.info"], defaultDomain: "chuan.info" });
    if (path.endsWith("challenge")) {
      challenges++;
      return Response.json({
        success: true,
        token: "fixture-challenge",
        email,
        expires: Date.now() + 60_000,
        challenge: { c: 1, s: 16, d: 2 },
      });
    }
    if (path.endsWith("redeem")) {
      assert.ok(init && typeof init.body === "string");
      bodies.push(init.body);
      return bodies.length === 1
        ? new Response("{}", { status: 503, headers: { "Retry-After": "0" } })
        : Response.json({ success: true, ...session(), expires: 1 });
    }
    assert.fail(`Unexpected request ${path}`);
  };
  await Promise.all([env.model.create(), env.model.create()]);
  assert.equal(challenges, 1);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.deepEqual(JSON.parse(bodies[0]!), { token: "fixture-challenge", solutions: [359] });
  assert.equal(env.model.session?.email, email);
  assert.equal(env.model.phase, "ready");
  assert.equal(JSON.parse(env.secret()).token, "mailbox-bearer-fixture");
  assert.ok(
    !String(localStorage.getItem("tempmail:mailbox:v1")).includes("mailbox-bearer-fixture"),
  );
});
test("retains a new inbox after a save failure so it can retry without creating another", async () => {
  const env = setup();
  env.failSave(true);
  let creates = 0;
  globalThis.fetch = async (url) => {
    if (requestURL(url).endsWith("domains"))
      return Response.json({ domains: ["chuan.info"], defaultDomain: "chuan.info" });
    if (requestURL(url).endsWith("challenge")) {
      creates++;
      return Response.json({
        success: true,
        token: "fixture-challenge",
        email,
        expires: Date.now() + 60_000,
        challenge: { c: 1, s: 16, d: 1 },
      });
    }
    return Response.json({ success: true, ...session() });
  };
  await env.model.create();
  assert.equal(env.model.phase, "save-error");
  assert.equal(env.model.session?.email, email);
  env.failSave(false);
  await env.model.retrySave();
  assert.equal(env.model.phase, "ready");
  assert.equal(creates, 1);
});
test("fetches bodies separately, shows plain text, and marks read after opening", async () => {
  const { model } = setup(JSON.stringify(session()));
  const urls: string[] = [];
  globalThis.fetch = async (url, init) => {
    urls.push(requestURL(url));
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer mailbox-bearer-fixture");
    return Response.json(
      requestURL(url).endsWith("/messages")
        ? [summary]
        : {
            ...summary,
            text: "验证码：123456",
            html: "<script>fetch('https://evil.example')</script>",
          },
    );
  };
  await model.refresh();
  assert.equal(model.unread, 1);
  await model.readMessage("message-1");
  assert.equal(model.unread, 0);
  assert.equal(model.body, "验证码：123456");
  assert.deepEqual(codes(model.body), ["123456"]);
  assert.equal(urls.length, 2);
  assert.equal(
    messageText({
      html: "<style>bad</style><script>bad</script><p>One &amp; two</p><p>Next</p>",
      text: null,
    }),
    "One & two\nNext",
  );
});
test("keeps the inbox after a message 404 and requires confirmation before deletion", async () => {
  const { model } = setup(JSON.stringify(session()));
  let deletes = 0;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "DELETE") {
      deletes++;
      return new Response(null, { status: 204 });
    }
    return new Response("{}", { status: 404 });
  };
  await model.readMessage("gone");
  assert.ok(model.detailError);
  assert.equal(model.session?.email, email);
  model.confirm = "delete";
  model.confirm = "";
  assert.equal(deletes, 0);
  model.confirm = "delete";
  await model.confirmAction();
  assert.equal(deletes, 1);
  assert.equal(model.session, null);
});
test("stops polling at expiry and ignores stale responses", async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
  const { model } = setup(JSON.stringify(session()));
  let release!: (response: Response) => void;
  globalThis.fetch = async () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = model.refresh();
  vi.advanceTimersByTime(61_000);
  model.tick();
  release(Response.json([summary]));
  await pending;
  assert.equal(model.session, null);
  assert.equal(model.phase, "expired");
  assert.equal(model.messages.length, 0);
});

test("keeps the current inbox and polling after a replacement hits a rate limit", async () => {
  const { model } = setup(JSON.stringify(session()));
  const schedules: (number | null)[] = [];
  Object.assign($metrix, {
    schedule: (delay: number | null) => {
      schedules.push(delay);
    },
  });
  globalThis.fetch = async (url) =>
    requestURL(url).endsWith("domains")
      ? Response.json({ domains: ["chuan.info"], defaultDomain: "chuan.info" })
      : new Response("{}", { status: 429, headers: { "Retry-After": "120" } });
  await model.create(true);
  assert.equal(model.session?.email, email);
  assert.equal(model.phase, "ready");
  assert.equal(schedules.at(-1), 60_000);
  globalThis.fetch = async () => Response.json([summary]);
  await model.refresh();
  assert.equal(model.messages.length, 1);
});

test("finishes deleting the old secret before saving the new session for restart", async () => {
  host();
  let secret = JSON.stringify({ ...session(), expiresAt: 1 });
  let release!: () => void;
  Object.assign($metrix, {
    secret: () => secret,
    deleteSecret: async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      secret = "";
    },
    setSecret: async (_key: string, value: string) => {
      secret = value;
    },
  });
  const model = new MailModel();
  model.restore();
  model.activate();
  await new Promise((resolve) => setImmediate(resolve));
  model.session = {
    email: "new@chuan.info",
    token: "new-fixture-token",
    expiresAt: Date.now() + 60_000,
    lifetime: "10m",
  };
  model.phase = "save-error";
  const save = model.retrySave();
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await save;
  await new Promise((resolve) => setImmediate(resolve));
  const restored = new MailModel();
  restored.restore();
  assert.equal(restored.session?.email, "new@chuan.info");
});

test("allows saving again after deleting an unsaved inbox fails", async () => {
  const env = setup();
  env.failSave(true);
  env.model.session = {
    email,
    token: "pending-fixture-token",
    expiresAt: Date.now() + 60_000,
    lifetime: "10m",
  };
  env.model.phase = "save-error";
  globalThis.fetch = async () => {
    throw new Error("network unavailable");
  };
  env.model.confirm = "delete";
  await env.model.confirmAction();
  assert.equal(env.model.phase, "save-error");
  env.failSave(false);
  await env.model.retrySave();
  assert.equal(env.model.phase, "ready");
  assert.equal(JSON.parse(env.secret()).token, "pending-fixture-token");
});

test("preserves verification links and renders messages as plain text", () => {
  const html =
    '<p>请<a href="https://verify.example/activate?token=abc&amp;next=%2F">验证邮箱</a></p><img src="https://tracker.example/x"><script>bad()</script>';
  for (const value of [
    messageText({ html, text: null }),
    messageText({ html, text: "请验证邮箱" }),
  ]) {
    assert.ok(value.includes("https://verify.example/activate?token=abc&next=%2F"));
    assert.ok(!value.includes("tracker.example"));
    assert.ok(!value.includes("bad()"));
  }
});

test("notifies only for mail arriving after the first list and includes the code", async () => {
  const { MailModel } = await import("../src/state.ts");
  const model = new MailModel();
  const sent: string[] = [];
  Object.assign(globalThis, {
    Notification: class {
      constructor(title: string) {
        sent.push(title);
      }
    },
  });
  const announce = (
    model as unknown as { announce(email: string, list: unknown[]): void }
  ).announce.bind(model);
  const message = (id: string, subject: string) => ({
    id,
    subject,
    preview: "",
    from: { name: "Bot" },
    date: "",
    to: "a@b",
  });
  announce("a@b", [message("1", "Welcome")]);
  announce("a@b", [message("2", "Your code is 482913"), message("1", "Welcome")]);
  assert.deepEqual(sent, ["验证码 482913"]);
});
