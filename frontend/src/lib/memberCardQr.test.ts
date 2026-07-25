import { describe, expect, it } from "vitest";
import {
  buildMemberCardQrImageUrl,
  extractMemberCardVerificationToken,
} from "./memberCardQr";

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

describe("extractMemberCardVerificationToken", () => {
  it("extracts the token from verification and public card URLs", () => {
    expect(
      extractMemberCardVerificationToken(
        "https://app.example.test/api/cards/verify/signed.token-value?format=json",
      ),
    ).toBe("signed.token-value");
    expect(
      extractMemberCardVerificationToken(
        "https://app.example.test/associazioni/club/tessera?card_token=signed.token-value",
      ),
    ).toBe("signed.token-value");
  });

  it("accepts a raw signed token as a scanner fallback", () => {
    const token = `payload.${"a".repeat(64)}`;
    expect(extractMemberCardVerificationToken(token)).toBe(token);
  });

  it("rejects unrelated URLs", () => {
    expect(extractMemberCardVerificationToken("https://example.test/card/42")).toBeNull();
  });
});
