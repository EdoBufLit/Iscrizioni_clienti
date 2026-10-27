import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppHub } from "./WhatsAppHub";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), chats: vi.fn(), messages: vi.fn(), send: vi.fn(), toast: vi.fn() }));
vi.mock("../../../../lib/api", async (original) => ({
  ...await original<typeof import("../../../../lib/api")>(),
  fetchOrgAdminWhatsAppConnection: (...args: unknown[]) => mocks.connection(...args),
  fetchOrgAdminWhatsAppChats: (...args: unknown[]) => mocks.chats(...args),
  fetchOrgAdminWhatsAppMessages: (...args: unknown[]) => mocks.messages(...args),
  sendOrgAdminWhatsAppMessage: (...args: unknown[]) => mocks.send(...args),
}));
vi.mock("../../../../components/ui/ToastProvider", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
const chats = [
  { id: 1, display_name: "Alfa", external_chat_id: "391111111111@s.whatsapp.net", unread_count: 0 },
  { id: 2, display_name: "Beta", external_chat_id: "392222222222@s.whatsapp.net", unread_count: 0 },
];
const response = (id: number, text: string) => ({ chat: chats[id - 1], total: 201, items: [{
  id: id * 100, direction: "inbound", status: "received", text_body: text, created_at: "2026-10-17T10:00:00Z",
}] });

describe("WhatsApp conversation isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue({ status: "connected", updated_at: null });
    mocks.chats.mockResolvedValue({ items: chats, total: 2 });
    mocks.messages.mockImplementation((id: number) => Promise.resolve(response(id, `Storia ${id}`)));
    mocks.send.mockResolvedValue({ ok: true });
  });

  it("ignores an obsolete response and preserves a separate draft for each chat", async () => {
    render(<WhatsAppHub communicationsLocked={false} />);
    await screen.findByText("Storia 1");
    const composer = screen.getByRole("textbox", { name: /Scrivi|messaggio/i });
    fireEvent.change(composer, { target: { value: "Bozza Alfa" } });
    let resolveOlder!: (value: ReturnType<typeof response>) => void;
    mocks.messages.mockImplementation((id: number) => id === 1
      ? new Promise((resolve) => { resolveOlder = resolve; }) : Promise.resolve(response(2, "Messaggi Beta")));
    fireEvent.click(screen.getByRole("button", { name: /Alfa/ }));
    await waitFor(() => expect(resolveOlder).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /Beta/ }));
    await screen.findByText("Messaggi Beta");
    expect(composer).toHaveValue("");
    fireEvent.change(composer, { target: { value: "Bozza Beta" } });
    await act(async () => resolveOlder(response(1, "Risposta obsoleta Alfa")));
    expect(screen.queryByText("Risposta obsoleta Alfa")).not.toBeInTheDocument();
    expect(screen.getByText("Messaggi Beta")).toBeInTheDocument();
    mocks.messages.mockImplementation((id: number) => Promise.resolve(response(id, `Storia ${id}`)));
    fireEvent.click(screen.getByRole("button", { name: /Alfa/ }));
    expect(composer).toHaveValue("Bozza Alfa");
    fireEvent.click(screen.getByRole("button", { name: /Beta/ }));
    expect(composer).toHaveValue("Bozza Beta");
  });

  it("requests bounded history pages", async () => {
    render(<WhatsAppHub communicationsLocked={false} />);
    await screen.findByText("Storia 1");
    fireEvent.click(screen.getByRole("button", { name: "Messaggi precedenti" }));
    await waitFor(() => expect(mocks.messages).toHaveBeenCalledWith(1, expect.objectContaining({ limit: 100, offset: 100 })));
    fireEvent.click(screen.getByRole("button", { name: "Torna ai recenti" }));
    await waitFor(() => expect(mocks.messages).toHaveBeenLastCalledWith(1, expect.objectContaining({ limit: 100, offset: 0 })));
  });
});
