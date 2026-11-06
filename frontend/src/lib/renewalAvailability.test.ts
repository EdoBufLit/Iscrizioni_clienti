import { expect, it } from "vitest";
import { renewalLaunchAvailable, renewalOpeningMessage } from "./renewalAvailability";
it("apre alla mezzanotte italiana e rispetta il blocco esplicito del server", () => {
  expect(renewalLaunchAvailable(undefined, new Date("2026-12-31T22:59:59.999Z"))).toBe(false);
  expect(renewalLaunchAvailable(undefined, new Date("2026-12-31T23:00:00Z"))).toBe(true);
  expect(renewalLaunchAvailable(false, new Date("2027-07-01T12:00:00Z"))).toBe(false);
  expect(renewalOpeningMessage("2026-11-01")).toContain("1 gennaio 2027");
  expect(renewalOpeningMessage("2027-11-02")).toContain("2 novembre 2027");
});
