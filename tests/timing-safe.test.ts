import { describe, it, expect } from "vitest";
import { timingSafeEqualString } from "../src/index";

describe("timingSafeEqualString", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqualString("secret-token", "secret-token")).toBe(true);
  });

  it("returns false for different same-length strings", () => {
    expect(timingSafeEqualString("secret-token", "secret-tokeN")).toBe(false);
  });

  it("returns false for different lengths (no early structural leak in API)", () => {
    expect(timingSafeEqualString("short", "longer-secret")).toBe(false);
    expect(timingSafeEqualString("longer-secret", "short")).toBe(false);
  });

  it("returns false for empty vs non-empty", () => {
    expect(timingSafeEqualString("", "x")).toBe(false);
    expect(timingSafeEqualString("x", "")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(timingSafeEqualString("", "")).toBe(true);
  });
});
