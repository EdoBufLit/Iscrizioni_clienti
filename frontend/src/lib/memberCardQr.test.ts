import { describe, expect, it } from "vitest";
import { buildMemberCardQrImageUrl } from "./memberCardQr";

describe("buildMemberCardQrImageUrl", () => {
  it("maps an absolute verification URL to the same-origin PNG endpoint", () => {
    expect(
      buildMemberCardQrImageUrl(
        "https://app.example.test/api/cards/verify/signed.token-value",
      ),
    ).toBe("/api/cards/signed.token-value/qr.png");
  });

  it("preserves the token from a relative verification URL and drops query data", () => {
    expect(
      buildMemberCardQrImageUrl("/api/cards/verify/token%2Evalue?format=json"),
    ).toBe("/api/cards/token.value/qr.png");
  });

  it("does not create a QR endpoint for empty or unrelated links", () => {
    expect(buildMemberCardQrImageUrl(null)).toBeNull();
    expect(buildMemberCardQrImageUrl("https://example.test/card/42")).toBeNull();
  });
});
