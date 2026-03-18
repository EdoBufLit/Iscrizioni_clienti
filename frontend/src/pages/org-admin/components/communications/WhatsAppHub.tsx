import { useEffect, useMemo, useState } from "react";
import {
  AuthError,
  connectOrgAdminWhatsApp,
  disconnectOrgAdminWhatsApp,
  fetchOrgAdminWhatsAppChats,
  fetchOrgAdminWhatsAppConnection,
  fetchOrgAdminWhatsAppContacts,
  fetchOrgAdminWhatsAppMessages,
  fetchOrgAdminWhatsAppQr,
  openOrgAdminWhatsAppDraftChat,
  sendOrgAdminWhatsAppMessage,
  startOrgAdminWhatsAppChat,
  type OrgAdminWhatsAppChat,
  type OrgAdminWhatsAppContact,
  type OrgAdminWhatsAppConnection,
  type OrgAdminWhatsAppMessage,
} from "../../../../lib/api";
import { useToast } from "../../../../components/ui/ToastProvider";
import Skeleton from "../../../../components/ui/Skeleton";

type WhatsAppHubProps = {
  communicationsLocked: boolean;
};

const statusCopy: Record<OrgAdminWhatsAppConnection["status"], { label: string; tone: string }> = {
  not_connected: {
    label: "Non connesso",
    tone: "border-neutral-200 bg-neutral-100 text-neutral-700",
  },
  qr_required: {
    label: "QR richiesto",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
  },
  connected: {
    label: "Connesso",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  error: {
    label: "Errore",
    tone: "border-rose-200 bg-rose-50 text-rose-800",
  },
};

function emptyConnection(): OrgAdminWhatsAppConnection {
  return {
    status: "not_connected",
    phone_number: null,
    profile_name: null,
    has_qr: false,
    qr_code: null,
    last_error: null,
    updated_at: null,
  };
}

function formatDateTime(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WhatsAppHub({ communicationsLocked }: WhatsAppHubProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [threadLoading, setThreadLoading] = useState(false);
  const [connection, setConnection] = useState<OrgAdminWhatsAppConnection>(emptyConnection());
  const [chats, setChats] = useState<OrgAdminWhatsAppChat[]>([]);
  const [contacts, setContacts] = useState<OrgAdminWhatsAppContact[]>([]);
  const [messages, setMessages] = useState<OrgAdminWhatsAppMessage[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [composerText, setComposerText] = useState("");
  const [newChatNumber, setNewChatNumber] = useState("");
  const [newChatName, setNewChatName] = useState("");
  const [newChatText, setNewChatText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  async function loadConnection(options?: { preferQr?: boolean }) {
    const next = options?.preferQr ? await fetchOrgAdminWhatsAppQr() : await fetchOrgAdminWhatsAppConnection();
    setConnection(next);
    return next;
  }

  async function loadChats() {
    const response = await fetchOrgAdminWhatsAppChats();
    setChats(response.items);
    return response.items;
  }

  async function loadContacts(options?: { connected?: boolean }) {
    const isConnected = options?.connected ?? connection.status === "connected";
    if (!isConnected) {
      setContacts([]);
      return [];
    }
    const response = await fetchOrgAdminWhatsAppContacts();
    setContacts(response.items);
    return response.items;
  }

  async function loadMessages(chatId: number, options?: { silent?: boolean }) {
    if (!options?.silent) {
      setThreadLoading(true);
    }
    try {
      const response = await fetchOrgAdminWhatsAppMessages(chatId);
      setMessages(response.items);
      setChats((prev) =>
        prev.map((chat) => (chat.id === response.chat.id ? { ...chat, ...response.chat, unread_count: 0 } : chat)),
      );
    } finally {
      if (!options?.silent) {
        setThreadLoading(false);
      }
    }
  }

  async function loadInitial() {
    setError(null);
    try {
      const [nextConnection, nextChats] = await Promise.all([loadConnection(), loadChats()]);
      if (nextConnection.status === "connected") {
        await loadContacts({ connected: true });
      } else {
        setContacts([]);
      }
      if (nextConnection.status === "qr_required" && !nextConnection.has_qr) {
        await loadConnection({ preferQr: true });
      }
      if (nextChats.length > 0) {
        const initialChatId = selectedChatId && nextChats.some((chat) => chat.id === selectedChatId)
          ? selectedChatId
          : nextChats[0].id;
        setSelectedChatId(initialChatId);
        await loadMessages(initialChatId);
      } else {
        setSelectedChatId(null);
        setMessages([]);
      }
    } catch (err) {
      if (err instanceof AuthError) {
        window.location.href = "/org-admin/login";
        return;
      }
      setError(err instanceof Error ? err.message : "Errore caricamento WhatsApp.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    if (!selectedChatId && chats.length > 0) {
      setSelectedChatId(chats[0].id);
      void loadMessages(chats[0].id);
      return;
    }
    if (selectedChatId && !chats.some((chat) => chat.id === selectedChatId)) {
      const fallbackChat = chats[0] ?? null;
      setSelectedChatId(fallbackChat?.id ?? null);
      if (fallbackChat) {
        void loadMessages(fallbackChat.id);
      } else {
        setMessages([]);
      }
    }
  }, [chats, selectedChatId]);

  useEffect(() => {
    if (connection.status !== "qr_required") {
      return undefined;
    }
    const interval = window.setInterval(() => {
      void loadConnection({ preferQr: true }).catch(() => undefined);
      void loadChats().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [connection.status]);

  useEffect(() => {
    if (connection.status !== "connected") {
      return undefined;
    }
    const interval = window.setInterval(() => {
      void loadConnection().catch(() => undefined);
      void loadChats().catch(() => undefined);
      if (selectedChatId) {
        void loadMessages(selectedChatId, { silent: true }).catch(() => undefined);
      }
    }, 4000);
    return () => window.clearInterval(interval);
  }, [connection.status, selectedChatId]);

  useEffect(() => {
    if (connection.status !== "connected") {
      return undefined;
    }
    void loadContacts({ connected: true }).catch(() => undefined);
    const interval = window.setInterval(() => {
      void loadContacts({ connected: true }).catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [connection.status]);

  async function handleConnect() {
    setBusy("connect");
    setError(null);
    try {
      const response = await connectOrgAdminWhatsApp();
      setConnection(response.connection);
      if (response.connection.status === "qr_required") {
        const qrState = await loadConnection({ preferQr: true });
        setConnection(qrState);
      }
      await loadChats();
      if (response.connection.status === "connected") {
        await loadContacts({ connected: true });
      }
      showToast({
        title: "WhatsApp",
        message: "Connessione avviata. Scansiona il QR se richiesto.",
        tone: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore avvio connessione WhatsApp.";
      setError(message);
      showToast({ title: "WhatsApp", message, tone: "error" });
    } finally {
      setBusy("");
    }
  }

  async function handleDisconnect() {
    setBusy("disconnect");
    setError(null);
    try {
      const response = await disconnectOrgAdminWhatsApp();
      setConnection(response.connection);
      setContacts([]);
      setMessages([]);
      showToast({
        title: "WhatsApp",
        message: "Connessione disconnessa.",
        tone: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore disconnessione WhatsApp.";
      setError(message);
      showToast({ title: "WhatsApp", message, tone: "error" });
    } finally {
      setBusy("");
    }
  }

  async function handleSendMessage() {
    if (!selectedChatId || !composerText.trim()) {
      return;
    }
    setBusy("send");
    setError(null);
    try {
      await sendOrgAdminWhatsAppMessage(selectedChatId, composerText.trim());
      setComposerText("");
      await loadChats();
      await loadMessages(selectedChatId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore invio messaggio WhatsApp.";
      setError(message);
      showToast({ title: "WhatsApp", message, tone: "error" });
    } finally {
      setBusy("");
    }
  }

  async function handleStartChat() {
    if (!newChatNumber.trim() || !newChatText.trim()) {
      return;
    }
    setBusy("start-chat");
    setError(null);
    try {
      const response = await startOrgAdminWhatsAppChat({
        number: newChatNumber.trim(),
        text: newChatText.trim(),
        display_name: newChatName.trim() || undefined,
      });
      const nextChats = await loadChats();
      const nextChatId = nextChats.find((chat) => chat.id === response.chat.id)?.id ?? response.chat.id;
      setSelectedChatId(nextChatId);
      await loadMessages(nextChatId);
      setNewChatNumber("");
      setNewChatName("");
      setNewChatText("");
      showToast({
        title: "WhatsApp",
        message: "Prima conversazione avviata con successo.",
        tone: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore avvio nuova chat WhatsApp.";
      setError(message);
      showToast({ title: "WhatsApp", message, tone: "error" });
    } finally {
      setBusy("");
    }
  }

  async function handleOpenDraftChat(input: { number: string; displayName?: string | null }) {
    const trimmedNumber = input.number.trim();
    if (!trimmedNumber) {
      return;
    }
    setBusy("open-chat");
    setError(null);
    try {
      const response = await openOrgAdminWhatsAppDraftChat({
        number: trimmedNumber,
        display_name: input.displayName?.trim() || undefined,
      });
      const nextChats = await loadChats();
      const nextChatId = nextChats.find((chat) => chat.id === response.chat.id)?.id ?? response.chat.id;
      setSelectedChatId(nextChatId);
      await loadMessages(nextChatId);
      showToast({
        title: "WhatsApp",
        message: "Chat pronta. Puoi scrivere dal composer principale.",
        tone: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore apertura chat WhatsApp.";
      setError(message);
      showToast({ title: "WhatsApp", message, tone: "error" });
    } finally {
      setBusy("");
    }
  }

  function handleSelectContact(contact: OrgAdminWhatsAppContact) {
    const existingChat = chats.find((chat) => chat.external_chat_id === contact.remote_jid);
    setNewChatNumber(contact.phone_number ?? "");
    setNewChatName(contact.display_name);
    if (existingChat) {
      setSelectedChatId(existingChat.id);
      void loadMessages(existingChat.id);
      return;
    }
    if (contact.phone_number) {
      void handleOpenDraftChat({ number: contact.phone_number, displayName: contact.display_name });
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-[1.75rem]" />
        <Skeleton className="h-[34rem] w-full rounded-[1.75rem]" />
      </div>
    );
  }

  const statusUi = statusCopy[connection.status];

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-brand">
                Sperimentale
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusUi.tone}`}>
                {statusUi.label}
              </span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-neutral-900">WhatsApp associazione</h3>
              <p className="mt-1 text-sm text-neutral-600">
                Connection per test interni via Evolution Lite. ASSONAM resta la fonte dati per inbox e thread.
              </p>
            </div>
            <div className="grid gap-2 text-sm text-neutral-600 md:grid-cols-3">
              <div className="rounded-[1rem] border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">Numero</p>
                <p className="mt-1 font-medium text-neutral-900">{connection.phone_number ?? "Non disponibile"}</p>
              </div>
              <div className="rounded-[1rem] border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">Profilo</p>
                <p className="mt-1 font-medium text-neutral-900">{connection.profile_name ?? "Non disponibile"}</p>
              </div>
              <div className="rounded-[1rem] border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">Ultimo update</p>
                <p className="mt-1 font-medium text-neutral-900">{connection.updated_at ? formatDateTime(connection.updated_at) : "Mai"}</p>
              </div>
            </div>
            {error ? (
              <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {error}
              </div>
            ) : null}
            {connection.last_error ? (
              <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {connection.last_error}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-[1.2rem] border border-brand bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleConnect()}
              disabled={communicationsLocked || busy === "connect" || busy === "disconnect"}
            >
              {connection.status === "connected" ? "Riconnetti" : "Connetti"}
            </button>
            <button
              type="button"
              className="rounded-[1.2rem] border border-neutral-200 bg-white px-5 py-3 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleDisconnect()}
              disabled={communicationsLocked || busy === "connect" || busy === "disconnect"}
            >
              Disconnetti
            </button>
          </div>
        </div>

        {connection.status === "qr_required" ? (
          <div className="mt-5 rounded-[1.5rem] border border-amber-200 bg-amber-50/60 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-amber-900">Scansiona il QR dal telefono associativo</p>
                <p className="mt-1 text-sm text-amber-800">
                  Il polling resta attivo solo in questa fase. Se il QR scade, usa di nuovo "Connetti".
                </p>
              </div>
              {connection.qr_code && connection.qr_code.startsWith("data:image") ? (
                <img
                  src={connection.qr_code}
                  alt="QR WhatsApp"
                  className="h-52 w-52 rounded-[1.25rem] border border-amber-200 bg-white p-3 shadow-sm"
                />
              ) : connection.qr_code ? (
                <div className="max-w-full rounded-[1rem] border border-amber-200 bg-white px-4 py-3 text-xs text-amber-900">
                  <code className="break-all">{connection.qr_code}</code>
                </div>
              ) : (
                <div className="rounded-[1rem] border border-amber-200 bg-white px-4 py-3 text-sm text-amber-900">
                  QR in aggiornamento...
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-5 xl:grid-cols-[22rem,minmax(0,1fr)]">
        <div className="rounded-[1.75rem] border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-5 py-4">
            <p className="text-sm font-semibold text-neutral-900">Chat monitorate</p>
            <p className="mt-1 text-xs text-neutral-500">Puoi avviare una nuova conversazione oppure leggere quelle sincronizzate via webhook.</p>
          </div>
          <div className="border-b border-neutral-200 p-3">
            <div className="rounded-[1.3rem] border border-neutral-200 bg-neutral-50 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Nuova chat</p>
                  <p className="mt-1 text-xs text-neutral-500">Apri la chat da un numero o da un contatto recente, poi rispondi dal composer principale.</p>
                </div>
                <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-500">
                  Solo testo
                </span>
              </div>
              <div className="mt-4 space-y-3">
                <input
                  type="tel"
                  inputMode="tel"
                  value={newChatNumber}
                  onChange={(event) => setNewChatNumber(event.target.value)}
                  placeholder="+39 340 1234567"
                  className="w-full rounded-[1rem] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:cursor-not-allowed disabled:bg-neutral-100"
                  disabled={
                    communicationsLocked ||
                    connection.status !== "connected" ||
                    busy === "open-chat" ||
                    busy === "start-chat"
                  }
                />
                <input
                  type="text"
                  value={newChatName}
                  onChange={(event) => setNewChatName(event.target.value)}
                  placeholder="Nome contatto opzionale"
                  className="w-full rounded-[1rem] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:cursor-not-allowed disabled:bg-neutral-100"
                  disabled={
                    communicationsLocked ||
                    connection.status !== "connected" ||
                    busy === "open-chat" ||
                    busy === "start-chat"
                  }
                />
                <textarea
                  value={newChatText}
                  onChange={(event) => setNewChatText(event.target.value)}
                  rows={3}
                  maxLength={4096}
                  placeholder={
                    communicationsLocked
                      ? "Modulo Comunicazioni non attivo."
                      : connection.status === "connected"
                        ? "Scrivi il primo messaggio di testo..."
                        : "Connetti prima WhatsApp per iniziare una chat."
                  }
                  className="w-full rounded-[1rem] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:cursor-not-allowed disabled:bg-neutral-100"
                  disabled={
                    communicationsLocked ||
                    connection.status !== "connected" ||
                    busy === "open-chat" ||
                    busy === "start-chat"
                  }
                />
                <button
                  type="button"
                  className="w-full rounded-[1rem] border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    communicationsLocked ||
                    connection.status !== "connected" ||
                    !newChatNumber.trim() ||
                    busy === "open-chat" ||
                    busy === "start-chat"
                  }
                  onClick={() =>
                    void handleOpenDraftChat({
                      number: newChatNumber,
                      displayName: newChatName,
                    })
                  }
                >
                  Apri chat
                </button>
                <button
                  type="button"
                  className="w-full rounded-[1rem] border border-brand bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    communicationsLocked ||
                    connection.status !== "connected" ||
                    !newChatNumber.trim() ||
                    !newChatText.trim() ||
                    busy === "open-chat" ||
                    busy === "start-chat"
                  }
                  onClick={() => void handleStartChat()}
                >
                  Avvia conversazione
                </button>
              </div>
            </div>
          </div>
          <div className="border-b border-neutral-200 p-3">
            <div className="rounded-[1.3rem] border border-neutral-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Contatti recenti</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Recuperati da Evolution Lite per evitare inserimento manuale completo.
                  </p>
                </div>
                <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold text-neutral-500">
                  {contacts.length}
                </span>
              </div>
              <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
                {contacts.length === 0 ? (
                  <div className="rounded-[1rem] border border-dashed border-neutral-200 px-3 py-4 text-xs text-neutral-500">
                    Nessun contatto disponibile ancora. Dopo la riconnessione o i primi scambi, Evolution popolerà questa lista.
                  </div>
                ) : (
                  contacts.map((contact) => (
                    <button
                      key={contact.remote_jid}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-[1rem] border border-neutral-200 px-3 py-3 text-left transition hover:border-neutral-300 hover:bg-neutral-50"
                      onClick={() => handleSelectContact(contact)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-900">{contact.display_name}</p>
                        <p className="mt-1 truncate text-xs text-neutral-500">
                          {contact.phone_number ?? contact.remote_jid}
                        </p>
                      </div>
                      <span className="text-[11px] text-neutral-400">
                        {contact.updated_at ? formatDateTime(contact.updated_at) : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="max-h-[32rem] overflow-y-auto p-3">
            {chats.length === 0 ? (
              <div className="rounded-[1.3rem] border border-dashed border-neutral-200 px-4 py-6 text-sm text-neutral-500">
                Nessuna chat sincronizzata per ora. Apri una chat dai contatti recenti oppure creane una dal box qui sopra.
              </div>
            ) : (
              <div className="space-y-2">
                {chats.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    className={`w-full rounded-[1.2rem] border px-4 py-3 text-left transition ${
                      selectedChatId === chat.id
                        ? "border-brand bg-brand/5"
                        : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
                    }`}
                    onClick={() => {
                      setSelectedChatId(chat.id);
                      void loadMessages(chat.id);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-900">{chat.display_name}</p>
                        <p className="mt-1 truncate text-xs text-neutral-500">{chat.external_chat_id}</p>
                      </div>
                      {chat.unread_count > 0 ? (
                        <span className="rounded-full bg-brand px-2 py-1 text-[11px] font-bold text-white">{chat.unread_count}</span>
                      ) : null}
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-neutral-600">{chat.last_message_text ?? "Nessun contenuto testuale."}</p>
                    <p className="mt-2 text-xs text-neutral-400">{chat.last_message_at ? formatDateTime(chat.last_message_at) : "Nessun timestamp"}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-5 py-4">
            <p className="text-sm font-semibold text-neutral-900">{selectedChat?.display_name ?? "Inbox WhatsApp"}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {selectedChat ? selectedChat.external_chat_id : "Seleziona una chat per leggere il thread e rispondere con solo testo."}
            </p>
          </div>

          <div className="flex min-h-[32rem] flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
              {threadLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-3/4 rounded-[1.2rem]" />
                  <Skeleton className="ml-auto h-16 w-2/3 rounded-[1.2rem]" />
                </div>
              ) : !selectedChat ? (
                <div className="rounded-[1.4rem] border border-dashed border-neutral-200 px-5 py-8 text-sm text-neutral-500">
                  Seleziona una conversazione dalla colonna sinistra oppure avviane una nuova.
                </div>
              ) : messages.length === 0 ? (
                <div className="rounded-[1.4rem] border border-dashed border-neutral-200 px-5 py-8 text-sm text-neutral-500">
                  Nessun messaggio sincronizzato ancora in questo thread.
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[82%] rounded-[1.35rem] px-4 py-3 text-sm shadow-sm ${
                      message.direction === "outbound"
                        ? "ml-auto bg-brand text-white"
                        : "bg-neutral-100 text-neutral-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{message.text_body ?? "(solo metadati)"}</p>
                    <div className={`mt-2 flex flex-wrap items-center gap-2 text-[11px] ${
                      message.direction === "outbound" ? "text-white/75" : "text-neutral-500"
                    }`}>
                      <span>{formatDateTime(message.created_at || message.sent_at)}</span>
                      <span>{message.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-neutral-200 px-5 py-4">
              <div className="flex flex-col gap-3">
                <textarea
                  value={composerText}
                  onChange={(event) => setComposerText(event.target.value)}
                  rows={4}
                  maxLength={4096}
                  placeholder={
                    communicationsLocked
                      ? "Modulo Comunicazioni non attivo."
                      : selectedChat
                        ? "Scrivi un messaggio di testo..."
                        : "Apri o crea prima una chat."
                  }
                  className="w-full rounded-[1.2rem] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:cursor-not-allowed disabled:bg-neutral-50"
                  disabled={!selectedChat || communicationsLocked || connection.status !== "connected"}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-neutral-500">
                    Solo testo. Niente media, allegati o invii bulk in questa fase.
                  </p>
                  <button
                    type="button"
                    className="rounded-[1.2rem] border border-brand bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      !selectedChat ||
                      !composerText.trim() ||
                      communicationsLocked ||
                      connection.status !== "connected" ||
                      busy === "send"
                    }
                    onClick={() => void handleSendMessage()}
                  >
                    Invia testo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
