import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createOrgAdminCardReplenishment,
  fetchSuperAdminRechargeCredits,
  patchSuperAdminRechargeCreditAccounting,
} from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("card replenishment API", () => {
  it("sends the idempotency key and immutable quantity snapshot", async () => {
    let capturedInput: RequestInfo | URL | undefined;
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedInput = input;
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true, created: true, item: { id: 17 } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }));

    await createOrgAdminCardReplenishment(
      { requested_cards: 250, requested_year: 2027, notes: "Lotto estivo" },
      "cards-request-12345678",
    );

    expect(capturedInput).toBe("/api/org-admin/cards/replenishments");
    expect(capturedInit?.method).toBe("POST");
    expect(new Headers(capturedInit?.headers).get("Idempotency-Key")).toBe("cards-request-12345678");
    expect(JSON.parse(String(capturedInit?.body))).toEqual({
      requested_cards: 250,
      requested_year: 2027,
      notes: "Lotto estivo",
    });
  });

  it("surfaces the dedicated-numbering block reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ detail: "La numerazione dedicata non consente il rifornimento automatico" }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    )));

    await expect(
      createOrgAdminCardReplenishment({ requested_cards: 50 }, "cards-request-dedicated"),
    ).rejects.toThrow("numerazione dedicata");
  });

  it("uses the protected Super Admin accounting endpoint and preserves filters", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify({
        ok: true,
        item: { id: 19 },
        items: [],
        total: 0,
        summary: { total: 0, unpaid: 0, paid: 0, outstanding_cents: 0, paid_cents: 0 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const controller = new AbortController();
    await fetchSuperAdminRechargeCredits({ billing_status: "unpaid", scope: "whatsapp", org_id: 7, q: "Club Roma", limit: 100, offset: 100, signal: controller.signal });
    await patchSuperAdminRechargeCreditAccounting(19, {
      billing_status: "paid",
      payment_reference: "BON-19",
    });

    expect(calls[0]?.input).toContain("billing_status=unpaid");
    expect(calls[0]?.input).toContain("scope=whatsapp");
    expect(calls[0]?.input).toContain("org_id=7");
    expect(calls[0]?.input).toContain("offset=100");
    expect(calls[0]?.input).toContain("limit=100");
    expect(calls[0]?.init?.signal).toBe(controller.signal);
    expect(calls[0]?.input).toContain("q=Club+Roma");
    expect(calls[1]?.input).toBe("/api/super-admin/recharge-credits/19/accounting");
    expect(calls[1]?.init?.method).toBe("PATCH");
    expect(JSON.parse(String(calls[1]?.init?.body))).toMatchObject({
      billing_status: "paid",
      payment_reference: "BON-19",
    });
  });
});
