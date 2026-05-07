import { clearElement } from "./domUtils";
import { expect, test } from "vitest";

test("clearElement removes children without assigning untrusted html", () => {
  const container = document.createElement("div");
  container.appendChild(document.createElement("span"));
  container.appendChild(document.createElement("strong"));

  clearElement(container);

  expect(container.childElementCount).toBe(0);
  expect(container.innerHTML).toBe("");
});
