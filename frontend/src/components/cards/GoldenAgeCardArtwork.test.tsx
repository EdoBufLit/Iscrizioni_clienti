import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberCardPreview } from "./MemberCardPreview";

const data = {
  fullName: "Giulia Rossi", organizationName: "Golden Age Club",
  clubDisplayName: "Golden Age Club - Speakeasy",
  organizationLogoUrl: "/static/card-logos/golden-age-20260921.png",
  cardNumber: 12345, cardYear: 2026, cardStatus: "attiva",
  verificationUrl: "/api/cards/verify/demo.token", membershipTypeLabel: "Annuale",
};

describe("Golden Age membership card", () => {
  it.each(["oasi-2", "golden-age-club"])("keeps the full mark and flip verification for %s", (slug) => {
    const { container } = render(<MemberCardPreview cardData={{ ...data, organizationSlug: slug }} />);
    const logo = container.querySelector('[data-card-logo="golden-age"]');
    expect(logo).toHaveAttribute("href", data.organizationLogoUrl);
    expect(logo).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
    expect(container.querySelectorAll('[data-card-logo="golden-age"]')).toHaveLength(1);
    expect(screen.getByText(/intestata a Giulia Rossi/)).toBeInTheDocument();
    const flip = screen.getByRole("button", { name: "Mostra il retro e il codice QR della tessera" });
    fireEvent.click(flip);
    expect(flip).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector('image[href="/api/cards/demo.token/qr.png"]')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Verifica online/ })).toHaveAttribute("href", data.verificationUrl);
  });

  it("does not show an expired membership as active", () => {
    render(<MemberCardPreview cardData={{ ...data, organizationSlug: "oasi-2", cardStatus: "expired" }} />);
    expect(screen.getByText("NON ATTIVA")).toBeInTheDocument();
    expect(screen.queryByText("ATTIVA")).not.toBeInTheDocument();
  });

  it("preserves the existing artwork for other associations", () => {
    const { container } = render(<MemberCardPreview cardData={{ ...data, organizationSlug: "another-club" }} />);
    expect(container.querySelector(".golden-age-card-front")).toBeNull();
    expect(screen.getByAltText("Logo associazione")).toHaveAttribute("src", data.organizationLogoUrl);
  });
});
