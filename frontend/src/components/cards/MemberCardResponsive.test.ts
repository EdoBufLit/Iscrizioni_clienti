// @ts-expect-error Vitest runs in Node; the browser tsconfig intentionally omits Node types.
import { readFileSync } from "node:fs";
// @ts-expect-error Vitest runs in Node; the browser tsconfig intentionally omits Node types.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readStylesheet = (relativeUrl: string) =>
  readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), "utf8");

describe("member card responsive styles", () => {
  it("keeps the mobile QR inside the bounded back artwork", () => {
    const css = readStylesheet("../../index.css");
    const start = css.indexOf(".member-card-flip {");
    const end = css.indexOf(".referral-wheel-wrap {", start);
    const memberCardCss = css.slice(start, end);

    expect(memberCardCss).toContain(
      ".member-card-face-back > span.relative.flex",
    );
    expect(memberCardCss).toContain("grid-template-columns: auto minmax(0, 1fr)");
    expect(memberCardCss).toContain("@media (max-width: 47.999rem)");
    expect(memberCardCss).toContain("width: clamp(6rem, 31vw, 7rem)");
    expect(memberCardCss).toContain("display: none");
  });
});

describe("theme toggle geometry", () => {
  it("uses explicit bounded dimensions for the track and thumb", () => {
    const css = readStylesheet("../../theme.css");
    const start = css.indexOf(".theme-toggle {");
    const end = css.indexOf(".auth-route-main {", start);
    const toggleCss = css.slice(start, end);

    expect(toggleCss).toContain("height: 2.75rem");
    expect(toggleCss).toContain("min-width: 3.75rem");
    expect(toggleCss).toContain("height: 2.25rem");
    expect(toggleCss).toContain("transform: translateY(-50%)");
    expect(toggleCss).toContain("transform: translate(1.375rem, -50%)");
  });
});
