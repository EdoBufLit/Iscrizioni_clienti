import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import SandboxedEmailPreview from "./SandboxedEmailPreview";

test("renders email html in a fully sandboxed iframe", () => {
  render(
    <SandboxedEmailPreview
      title="Anteprima email"
      html={'<script>window.top.location="https://evil.example"</script><p>Ciao</p>'}
    />,
  );

  const frame = screen.getByTitle("Anteprima email");
  expect(frame.getAttribute("sandbox")).toBe("");
  expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
  expect(frame.getAttribute("srcdoc")).toContain("<script>");
});
