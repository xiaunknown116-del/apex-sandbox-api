import { describe, it, expect } from "vitest";
import { isValidEmail } from "../src/index";

describe("isValidEmail", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("accepts address with surrounding whitespace after trim rules", () => {
    expect(isValidEmail("  user@example.com  ")).toBe(true);
  });

  it("rejects missing @", () => {
    expect(isValidEmail("userexample.com")).toBe(false);
  });

  it("rejects spaces inside local or domain", () => {
    expect(isValidEmail("user name@example.com")).toBe(false);
    expect(isValidEmail("user@exam ple.com")).toBe(false);
  });

  it("rejects non-strings and empty", () => {
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail(1)).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
  });

  it("rejects domain without a dot", () => {
    expect(isValidEmail("user@localhost")).toBe(false);
  });
});
