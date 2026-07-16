import test from "node:test";
import assert from "node:assert/strict";
import { readRepo } from "./helpers/repo.ts";

test("admin sidebar only uses supported imported icon for inactive accounts", () => {
  const sidebar = readRepo("admin-panel/src/components/layout/Sidebar.tsx");
  assert.doesNotMatch(sidebar, /UserRoundClock/);
  assert.match(sidebar, /label: "Inactive Accounts", icon: History/);
});
