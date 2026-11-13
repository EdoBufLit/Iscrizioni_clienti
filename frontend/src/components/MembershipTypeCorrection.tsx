import { useRef, useState } from "react";
import ModalShell from "./ui/ModalShell";

type Props = {
  member: { id: number; can_correct_membership_type?: boolean; card_no?: number | null; card_year?: number | null; card_number_label?: string | null };
  onCorrect: () => Promise<void>;
};

export default function MembershipTypeCorrection({ member, onCorrect }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  if (!member.can_correct_membership_type) return null;
  const close = () => { if (!busy.current) { setOpen(false); setError(""); } };
  const confirm = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try { await onCorrect(); setOpen(false); }
    catch (err) { setError(err instanceof Error ? err.message : "Impossibile correggere il tipo tessera."); }
    finally { busy.current = false; setSaving(false); }
  };
  return <>
    <button type="button" className="btn-ghost !px-3 !py-2 text-sm" onClick={() => { setError(""); setOpen(true); }}>Correggi tipo tessera</button>
    <ModalShell open={open} title="Correggi tipo tessera" onClose={close} closeDisabled={saving} closeOnEscape={!saving} closeOnOverlay={!saving}
      footer={<div className="flex flex-wrap justify-end gap-3"><button type="button" className="btn-ghost" disabled={saving} onClick={close}>Annulla</button><button type="button" className="btn-primary" disabled={saving} onClick={() => void confirm()}>{saving ? "Salvataggio…" : "Conferma annuale"}</button></div>}>
      <p className="text-sm font-semibold">Da temporanea ad annuale{member.card_no != null ? ` · #${member.card_number_label ?? member.card_no}${member.card_year ? ` / ${member.card_year}` : ""}` : ""}</p>
      <p className="mt-3 text-sm text-[var(--theme-text-muted)]">{member.card_no != null
        ? "Corregge il tipo della tessera esistente. Numero, anno, storico e pagamenti restano invariati. La validità segue l'anno già emesso."
        : "Corregge il tipo richiesto. Stato di verifica e pagamenti restano invariati; la tessera seguirà il normale iter di approvazione ed emissione."}</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
    </ModalShell>
  </>;
}
