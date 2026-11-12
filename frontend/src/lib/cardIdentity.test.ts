import { describe, expect, it } from "vitest";
import { displayCardNumber } from "./cardIdentity";

describe("Riferimento tessera", () => {
  it("distingue la cartacea eccezionale dal numero digitale identico", () => {
    expect(displayCardNumber({ card_no: 28696, card_namespace: "digital" })).toBe("28696");
    expect(displayCardNumber({ card_no: 28696, card_namespace: "paper_exception" })).toBe("28696*");
    expect(displayCardNumber({ card_no: 28696, card_number_label: "28696*" })).toBe("28696*");
  });
  it("conserva i numeri digitali esistenti e le tessere senza numero", () => {
    expect(displayCardNumber({ card_number: 27635 })).toBe("27635");
    expect(displayCardNumber({ card_no: null })).toBeNull();
  });
});
