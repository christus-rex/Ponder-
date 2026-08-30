import { describe, expect, it } from "vitest";
import { isAtLeast18, parseBirthDate } from "./age";

describe("age gate", () => {
  const today = new Date("2026-08-30T12:00:00Z");

  it("accepts a user exactly 18 years old", () => {
    expect(isAtLeast18("2008-08-30", today)).toBe(true);
  });

  it("rejects a user who turns 18 tomorrow", () => {
    expect(isAtLeast18("2008-08-31", today)).toBe(false);
  });

  it("rejects invalid dates", () => {
    expect(parseBirthDate("2008-02-31")).toBeNull();
    expect(isAtLeast18("not-a-date", today)).toBe(false);
  });
});
