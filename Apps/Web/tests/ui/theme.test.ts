import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalStyles = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

describe("Finora cross-platform light-blue theme", () => {
  it("uses a light blue-tinted canvas, blue brand, and matching focus and chart colors", () => {
    expect(globalStyles).toContain("--background: 205 45% 98%;");
    expect(globalStyles).toContain("--surface-muted: 205 35% 96%;");
    expect(globalStyles).toContain("--primary: 207 80% 43%;");
    expect(globalStyles).toContain("--primary-foreground: 0 0% 100%;");
    expect(globalStyles).toContain("--ring: 207 80% 43%;");
    expect(globalStyles).toContain("--chart-1: 207 80% 43%;");
  });
});
