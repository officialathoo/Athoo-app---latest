import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../src/routes/broadcast.ts", import.meta.url);

test("broadcast response enrichment uses one provider query instead of N+1 lookups", async () => {
  const source = await readFile(routeUrl, "utf8");
  const start = source.indexOf("const providerIds = [...new Set(responses.map");
  const end = source.indexOf("res.json({ request: { ...request, responses: enrichedResponses } });", start);

  assert.ok(start >= 0 && end > start, "expected the batch-enrichment implementation");
  const block = source.slice(start, end);

  assert.match(block, /broadcastResponseProviderBatchSize\(\)/);
  assert.match(block, /providerIds\.slice\(start, start \+ providerBatchSize\)/);
  assert.match(block, /where\(inArray\(usersTable\.id, batchIds\)\)/);
  assert.match(block, /new Map\(providers\.map/);
  assert.doesNotMatch(block, /Promise\.all\s*\(/);
  assert.doesNotMatch(block, /responses\.map\s*\(\s*async/);
  assert.doesNotMatch(block, /db\.query\.usersTable\.findFirst/);
});
