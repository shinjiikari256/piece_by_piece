import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import pkg from "../../../package.json" with { type: "json" };

const notices = readFileSync(path.resolve(__dirname, "../public/licenses.txt"), "utf8");

describe("уведомления о лицензиях", () => {
  it("в licenses.txt есть все клиентские зависимости (иначе: pnpm generate:licenses)", () => {
    const server = ["@hono/node-server", "@node-rs/argon2", "drizzle-orm", "hono", "postgres"];
    const missing = Object.keys(pkg.dependencies).filter((d) => !server.includes(d) && !notices.includes(`\n${d} `));
    expect(missing).toEqual([]);
  });

  it("серверные пакеты игрокам не раздаются", () => {
    expect(notices).not.toContain("\ndrizzle-orm ");
  });
});
