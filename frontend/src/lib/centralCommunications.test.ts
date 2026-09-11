import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "./api";
import { fetchReceivedCommunication, fetchReceivedCommunications, markCommunicationRead, previewCommunication, sendCommunication } from "./centralCommunications";

afterEach(() => vi.unstubAllGlobals());

describe("API comunicazioni centrali", () => {
  it("invia il pubblico confermato e la chiave di deduplicazione al server", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ replayed: false, item: { id: 12 } })));
    vi.stubGlobal("fetch", fetch);
    const draft = { subject: "Avviso", body: "Testo", audience: "all" as const, organization_ids: [],
      expected_organization_ids: [2, 5], idempotency_key: "test-confirmed-snapshot" };
    await sendCommunication(draft);
    expect(fetch).toHaveBeenCalledWith("/api/super-admin/communications", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
    });
  });

  it("separa lettura del dettaglio e marcatura letta, preservando la paginazione", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await fetchReceivedCommunications(3);
    await fetchReceivedCommunication(12);
    await markCommunicationRead(12);
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/org-admin/communications/inbox?page=3&page_size=15",
      "/api/org-admin/communications/inbox/12",
      "/api/org-admin/communications/inbox/12/read",
    ]);
    expect(fetch.mock.calls[1][1]).toBeUndefined();
    expect(fetch.mock.calls[2][1]).toMatchObject({ method: "POST", body: "{}" });
  });

  it("rende riconoscibile la sessione scaduta e mostra il conflitto destinatari restituito dal backend", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Le associazioni attive sono cambiate. Rivedi i destinatari." }), { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchReceivedCommunications()).rejects.toBeInstanceOf(AuthError);
    await expect(previewCommunication({ subject: "Avviso", body: "Testo", audience: "all", organization_ids: [] }))
      .rejects.toThrow("Le associazioni attive sono cambiate");
  });

  it("mostra un errore leggibile anche per risposte proxy non JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<h1>Bad gateway</h1>", { status: 502 })));
    await expect(fetchReceivedCommunications()).rejects.toThrow("Impossibile completare la richiesta. Riprova.");
  });
});
