import { describe, it, expect } from "vitest";
import { isTokenRenewalDue } from "../domain/tokenRenewal";

const d = (iso: string) => new Date(`${iso}T12:00:00`);

describe("isTokenRenewalDue", () => {
  it("is not due before June 1, whatever the saved date", () => {
    expect(isTokenRenewalDue("2025-09-01", d("2026-05-31"))).toBe(false);
    expect(isTokenRenewalDue(null, d("2026-01-15"))).toBe(false);
  });

  it("is due on/after June 1 when the token predates this year's cutoff", () => {
    expect(isTokenRenewalDue("2025-09-01", d("2026-06-01"))).toBe(true);
    expect(isTokenRenewalDue("2026-05-31", d("2026-06-10"))).toBe(true);
    expect(isTokenRenewalDue(null, d("2026-06-01"))).toBe(true);
  });

  it("clears once renewed on/after this year's cutoff", () => {
    expect(isTokenRenewalDue("2026-06-01", d("2026-06-01"))).toBe(false);
    expect(isTokenRenewalDue("2026-06-05", d("2026-06-20"))).toBe(false);
  });
});
