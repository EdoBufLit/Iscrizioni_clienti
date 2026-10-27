import { useEffect, useRef, useState } from "react";
import type { OrgAdminAttendance } from "../../../lib/api";
import { checkInAttendanceMember, searchAttendanceMembers, type AttendanceMemberOption } from "../../../lib/attendance";
import { StatusChip } from "./OrgAdminPrimitives";

type CheckInResult = { created: boolean; item: OrgAdminAttendance };

export default function AttendanceMemberSearch({ onRegistered, onBusyChange }: {
  onRegistered: (result: CheckInResult) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ items: AttendanceMemberOption[]; total: number } | null>(null);
  const [selected, setSelected] = useState<AttendanceMemberOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [registered, setRegistered] = useState<CheckInResult | null>(null);
  const savingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim();

  useEffect(() => {
    if (normalizedQuery.length < 2) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void searchAttendanceMembers(normalizedQuery, controller.signal)
        .then(response => { if (!controller.signal.aborted) setResults(response); })
        .catch(error => {
          if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : "Ricerca non disponibile. Riprova.");
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [normalizedQuery, retryVersion]);

  const register = async () => {
    if (!selected || !selected.is_active || selected.already_checked_in || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    onBusyChange(true);
    setSaveError("");
    try {
      const response = await checkInAttendanceMember(selected.id);
      setRegistered(response);
      setSelected(previous => previous ? { ...previous, already_checked_in: true } : null);
      setResults(previous => previous ? {
        ...previous, items: previous.items.map(member => member.id === selected.id ? { ...member, already_checked_in: true } : member),
      } : null);
      onRegistered(response);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Impossibile registrare la presenza. Riprova.");
    } finally {
      savingRef.current = false;
      setSaving(false);
      onBusyChange(false);
    }
  };

  return (
    <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]" data-component="attendance-member-search">
      <p className="text-sm leading-6 text-slate-600">Cerca il socio e conferma il suo ingresso di oggi, anche senza tessera a portata di mano.</p>
      <div>
        <label htmlFor="attendance-member-search" className="block text-sm font-semibold text-slate-800">Cerca un socio da registrare</label>
        <input
          ref={inputRef}
          id="attendance-member-search"
          className="theme-input mt-2 min-h-[48px] w-full min-w-0 rounded-xl px-3 py-3"
          type="search"
          value={query}
          maxLength={120}
          autoComplete="off"
          placeholder="Nome, cognome, email o numero tessera"
          aria-describedby="attendance-member-search-hint"
          disabled={saving}
          onChange={event => {
            const value = event.target.value;
            if (value.trim() !== normalizedQuery) {
              setResults(null);
              setSelected(null);
              setSearchError("");
              setSaveError("");
              setRegistered(null);
              setLoading(value.trim().length >= 2);
            }
            setQuery(value);
          }}
        />
        <p id="attendance-member-search-hint" className="mt-2 text-xs leading-5 text-slate-500">Inserisci almeno 2 caratteri. La ricerca include solo i soci della tua associazione.</p>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {loading ? <p className="text-sm text-slate-500" role="status">Ricerca soci in corso...</p> : searchError ? (
          <div className="text-sm text-rose-700" role="alert">
            <p>{searchError}</p>
            <button className="btn-secondary mt-3" type="button" onClick={() => {
              setSearchError("");
              setLoading(true);
              setRetryVersion(value => value + 1);
            }}>Riprova ricerca</button>
          </div>
        ) : results ? <p className="text-sm text-slate-600">{results.total === 0 ? "Nessun socio trovato. Prova con un altro nome o numero tessera." : `${results.total} ${results.total === 1 ? "socio trovato" : "soci trovati"}. Seleziona il socio da registrare.`}</p> : null}
      </div>

      {results && results.total > results.items.length ? <p className="text-xs text-slate-500">Mostrati i primi {results.items.length} risultati. Affina la ricerca per trovare il socio.</p> : null}
      {results && results.items.length > 0 ? (
        <ul className="max-h-80 space-y-2 overflow-y-auto overscroll-y-contain p-1" aria-label="Soci trovati">
          {results.items.map(member => (
            <li key={member.id}>
              <button
                type="button"
                className={`w-full rounded-xl border p-3 text-left transition ${selected?.id === member.id ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-slate-200 bg-white hover:border-brand/50"}`}
                aria-pressed={selected?.id === member.id}
                aria-label={`Seleziona ${member.name}, tessera ${member.card_no ?? "non assegnata"}`}
                disabled={saving}
                onClick={() => { setSelected(member); setSaveError(""); setRegistered(null); }}
              >
                <span className="block break-words font-semibold text-slate-900 [overflow-wrap:anywhere]">{member.name}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{member.card_no ? `Tessera ${member.card_no}${member.card_year ? ` / ${member.card_year}` : ""}` : "Tessera non assegnata"}</span>
                {member.email ? <span className="block break-all text-xs leading-5 text-slate-500">{member.email}</span> : null}
                <span className="mt-2 flex flex-wrap gap-2">
                  <StatusChip tone={member.already_checked_in ? "info" : member.is_active ? "success" : "warning"}>{member.already_checked_in ? "Già presente oggi" : member.is_active ? "Tessera attiva" : "Tessera non attiva"}</StatusChip>
                  {selected?.id === member.id ? <span className="self-center text-xs font-semibold text-brand">Selezionato</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="break-words text-sm text-slate-700 [overflow-wrap:anywhere]">Socio selezionato: <strong>{selected.name}</strong></p>
          <p className="text-sm leading-6 text-slate-600">{selected.already_checked_in ? "Il primo ingresso di oggi è già registrato." : !selected.is_active ? "La tessera deve essere attiva per registrare la presenza." : "La presenza sarà registrata per oggi, con l'orario attuale."}</p>
          {registered ? <p className="text-sm font-semibold text-emerald-700" role="status">{registered.created ? `Presenza registrata per ${registered.item.member_name}.` : `${registered.item.member_name} è già presente oggi.`}</p> : null}
          {saveError ? <p className="text-sm text-rose-700" role="alert">{saveError}</p> : null}
          <button className="btn-primary w-full justify-center" type="button" disabled={saving || !selected.is_active || selected.already_checked_in} onClick={() => void register()}>
            {saving ? "Registrazione in corso..." : selected.already_checked_in ? "Già presente oggi" : "Registra presenza"}
          </button>
          {selected.already_checked_in ? <button className="btn-secondary w-full justify-center" type="button" onClick={() => {
            setQuery(""); setResults(null); setSelected(null); setSaveError(""); setRegistered(null); inputRef.current?.focus();
          }}>Cerca un altro socio</button> : null}
        </div>
      ) : null}
    </div>
  );
}
