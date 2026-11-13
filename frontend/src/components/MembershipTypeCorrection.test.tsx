import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MembershipTypeCorrection from "./MembershipTypeCorrection";

describe("Correzione tipo tessera", () => {
  it("richiede conferma e impedisce doppioni mentre salva una tessera emessa", async () => {
    let resolve!: () => void;
    const onCorrect = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    render(<MembershipTypeCorrection member={{id:42,can_correct_membership_type:true,card_no:123,card_year:2026,card_number_label:"123*"}} onCorrect={onCorrect} />);
    fireEvent.click(screen.getByRole("button",{name:"Correggi tipo tessera"}));
    const dialog = screen.getByRole("dialog",{name:"Correggi tipo tessera"});
    expect(dialog).toHaveTextContent("#123* / 2026");
    expect(dialog).toHaveTextContent("Numero, anno, storico e pagamenti restano invariati");
    expect(onCorrect).not.toHaveBeenCalled();
    const confirm = within(dialog).getByRole("button",{name:"Conferma annuale"});
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(onCorrect).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("button",{name:"Annulla"})).toBeDisabled();
    await act(async () => resolve());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("spiega che una domanda pending resta da approvare e rende visibile un blocco del backend", async () => {
    const onCorrect = vi.fn().mockRejectedValue(new Error("Completa prima il checkout in corso."));
    render(<MembershipTypeCorrection member={{id:43,can_correct_membership_type:true}} onCorrect={onCorrect} />);
    fireEvent.click(screen.getByRole("button",{name:"Correggi tipo tessera"}));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Stato di verifica e pagamenti restano invariati");
    expect(dialog).not.toHaveTextContent("#undefined");
    fireEvent.click(within(dialog).getByRole("button",{name:"Conferma annuale"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Completa prima il checkout in corso.");
    expect(within(dialog).getByRole("button",{name:"Conferma annuale"})).toBeEnabled();
  });

  it("non espone la correzione quando il backend non la consente", () => {
    render(<MembershipTypeCorrection member={{id:44,can_correct_membership_type:false}} onCorrect={vi.fn()} />);
    expect(screen.queryByRole("button",{name:"Correggi tipo tessera"})).not.toBeInTheDocument();
  });
});
