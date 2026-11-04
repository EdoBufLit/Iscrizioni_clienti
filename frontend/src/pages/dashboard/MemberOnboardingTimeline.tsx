import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMemberDocuments, type MemberDocumentsResponse, type MemberProfile } from "../../lib/api";
import "./MemberOnboardingTimeline.css";

export default function MemberOnboardingTimeline({ user }: { user: MemberProfile }) {
  const [documents, setDocuments] = useState<MemberDocumentsResponse | null>(null);
  useEffect(() => {
    let active = true;
    setDocuments(null);
    void fetchMemberDocuments().then(value => { if (active) setDocuments(value); }).catch(() => {});
    return () => { active = false; };
  }, [user.id]);
  if (!["pending_docs", "pending_verification", "pending_cards"].includes(user.status)) return null;
  const missing = documents?.required_types.filter(type => {
    const latest = documents.items.filter(item => item.type === type).sort((a, b) => (Date.parse(b.uploaded_at || "") || 0) - (Date.parse(a.uploaded_at || "") || 0) || b.id - a.id)[0];
    return !latest || ["missing", "rejected"].includes(latest.status);
  });
  const uploaded = documents ? !missing?.length : user.status !== "pending_docs";
  const needsUpload = Boolean(missing?.length);
  return <MembershipProgress uploaded={uploaded} approved={user.status === "pending_cards"} needsUpload={needsUpload}
    action={<Link to="/dashboard/documenti" className="member-home__timeline-cta">{needsUpload ? "Carica i documenti richiesti" : "Gestisci documenti"} →</Link>} />;
}

export function MembershipProgress({ uploaded, approved, needsUpload, active = false, documentsRequired = true, action }: {
  uploaded: boolean; approved: boolean; needsUpload: boolean; active?: boolean; documentsRequired?: boolean; action?: ReactNode;
}) {
  return <section className="surface member-home__timeline" aria-labelledby="member-onboarding-timeline-title">
    <div className="member-home__timeline-header"><h2 id="member-onboarding-timeline-title">Stato attivazione iscrizione</h2>{action}</div>
    <ol className="member-home__timeline-steps">
      <li className="is-done"><span className="member-home__timeline-dot" aria-hidden="true">✓</span><div><strong>1. Dati inviati</strong><p>La richiesta di iscrizione è stata registrata.</p></div></li>
      <li className={uploaded ? "is-done" : "is-current"} aria-current={!uploaded ? "step" : undefined}><span className="member-home__timeline-dot" aria-hidden="true">{uploaded ? "✓" : "2"}</span><div><strong>2. Documenti caricati</strong><p>{!documentsRequired ? "Nessun documento obbligatorio richiesto." : needsUpload ? "Manca un documento o è richiesta una nuova versione. Caricalo per proseguire." : uploaded ? "Documentazione ricevuta dall'associazione." : "Controlla nella sezione Documenti gli allegati richiesti e il loro stato."}</p></div></li>
      <li className={active ? "is-done" : uploaded ? "is-current" : ""} aria-current={uploaded && !active ? "step" : undefined}><span className="member-home__timeline-dot" aria-hidden="true">{active ? "✓" : "3"}</span><div><strong>3. Approvazione del circolo</strong><p>{active ? "Iscrizione attiva: puoi accedere alla tua area socio." : approved ? "Iscrizione approvata: in attesa dell'emissione della tessera." : "La segreteria verificherà l'iscrizione e attiverà la tessera e il QR."}</p></div></li>
    </ol>
  </section>;
}
