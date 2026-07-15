import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Privacy, { PRIVACY_NOTICE_VERSION } from "./Privacy";

describe("Privacy", () => {
  it("separates optional promotional consent from membership services", () => {
    const { container } = render(
      <MemoryRouter>
        <Privacy />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/il rifiuto o la revoca non producono conseguenze sull'iscrizione/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/non autorizza la comunicazione dei dati a partner/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/revoca delle comunicazioni promozionali/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(PRIVACY_NOTICE_VERSION))).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Ã|Â|â|ðŸ|�/);
  });
});
