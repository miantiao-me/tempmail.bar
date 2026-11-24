import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { solveChallenge } from "../src/pow.ts";

const challenge = {
  format: 1,
  token: "fixture-challenge",
  challenge: { c: 3, s: 16, d: 2 },
  expires: Date.now() + 60_000,
};

test("matches the official Cap format-1 test vector", async () => {
  const result = await solveChallenge(challenge, { signal: new AbortController().signal });
  assert.deepEqual(result, [359, 8, 94]);
});

test("stops solving canceled and expired challenges", async () => {
  await assert.rejects(solveChallenge(challenge, { signal: AbortSignal.abort() }));
  await assert.rejects(
    solveChallenge(
      { ...challenge, expires: 1 },
      { signal: new AbortController().signal, lang: "en" },
    ),
    { message: "Challenge expired or timed out" },
  );
  await assert.rejects(
    solveChallenge(
      { ...challenge, expires: 1 },
      { signal: new AbortController().signal, lang: "zh" },
    ),
    { message: "计算挑战已过期或超时，请重试" },
  );
});

test("rejects unknown formats and browser instrumentation", async () => {
  for (const extra of [
    { format: 2 },
    { instrumentation: {} },
    { challenge: { c: 0, s: 32, d: 4 } },
  ]) {
    await assert.rejects(
      solveChallenge({ ...challenge, ...extra }, { signal: new AbortController().signal }),
    );
  }
});
