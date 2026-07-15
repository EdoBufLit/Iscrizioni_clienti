import { afterEach, describe, expect, it, vi } from "vitest";
import { createMembershipPaymentCheckout, joinOrganization } from "./api";

const baseMembershipData = {
  first_name: "Ada",
  last_name: "Rossi",
  birth_date: "1990-01-01",
  birth_place: "Roma",
  birth_place_code: "H501",
  birth_place_foreign: false,
  gender: "F" as const,
  email: "ada@example.test",
  phone: "+390000000000",
  fiscal_code: "RSSDAA90A41H501Z",
  accept_statute: true,
  accepted_statute_version: "1",
  accept_privacy: true,
  membership_type: "annual" as const,
};

function mockSuccessfulFetch(payload: object) {
  const requests: RequestInit[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {});
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return requests;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("membership marketing consent payload", () => {
  it("sends an explicit false default in the non-payment signup flow", async () => {
    const requests = mockSuccessfulFetch({ status: "received" });

    await joinOrganization("associazione-test", {
      ...baseMembershipData,
      payment_method: "CASH",
    });

    const body = requests[0]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("accept_privacy")).toBe("true");
    expect((body as FormData).get("marketing_email_consent")).toBe("false");
  });

  it("sends the selected value in the checkout signup flow", async () => {
    const requests = mockSuccessfulFetch({
      payment_id: 42,
      hosted_checkout_url: "https://payments.example.test/checkout",
    });

    await createMembershipPaymentCheckout("associazione-test", {
      ...baseMembershipData,
      password: "password-sicura",
      marketing_email_consent: true,
    });

    const body = requests[0]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("accept_privacy")).toBe("true");
    expect((body as FormData).get("marketing_email_consent")).toBe("true");
  });
});
