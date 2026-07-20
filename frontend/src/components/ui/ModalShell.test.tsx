import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";

import ModalShell from "./ModalShell";

const Harness = () => {
  const [open, setOpen] = useState(false);
  const initialFocusRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Apri finestra</button>
      <ModalShell
        open={open}
        title="Conferma operazione"
        onClose={() => setOpen(false)}
        initialFocusRef={initialFocusRef}
      >
        <button ref={initialFocusRef} type="button">Azione iniziale</button>
      </ModalShell>
    </>
  );
};

describe("ModalShell accessibility", () => {
  it("sposta il focus nel dialog, gestisce Escape e lo restituisce al trigger", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Apri finestra" });

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Conferma operazione" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(screen.getByRole("button", { name: "Azione iniziale" })).toHaveFocus());

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
