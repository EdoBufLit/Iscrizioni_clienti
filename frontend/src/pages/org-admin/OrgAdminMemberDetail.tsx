import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

interface Document {
  id: number;
  type: string;
  filename: string;
  mime_type?: string;
  size_bytes?: number;
  download_url?: string;
  uploaded_at: string;
  status: string;
  review_notes?: string;
  reviewed_at?: string;
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

interface MemberDetail {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  fiscal_code: string;
  status: string;
  card_no?: number;
  joined_at?: string;
  documents: Document[];
  decision_notes?: string;
  decision_at?: string;
  decision_by_admin_id?: number;
}

export default function OrgAdminMemberDetail() {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewingDocId, setReviewingDocId] = useState<number | null>(null);

  // Decision state
  const [decisionNotes, setDecisionNotes] = useState("");
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  useEffect(() => {
    fetchMember();
  }, [id]);

  useEffect(() => {
      if (member?.decision_notes) {
          setDecisionNotes(member.decision_notes);
      }
  }, [member]);

  const fetchMember = async () => {
    try {
      const res = await fetch(`/api/org-admin/members/${id}`);
      if (!res.ok) throw new Error("Errore nel caricamento del socio");
      const data = await res.json();
      setMember(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (docId: number, status: "approved" | "rejected", notes: string = "") => {
    setReviewingDocId(docId);
    try {
      const res = await fetch(`/api/org-admin/documents/${docId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) throw new Error("Errore durante la revisione");

      const result = await res.json();

      // Update local state
      setMember(prev => {
        if (!prev) return null;
        return {
            ...prev,
            status: result.member_status, // Update member status if changed
            documents: prev.documents.map(d =>
                d.id === docId ? { ...d, status: result.doc_status } : d
            )
        };
      });

    } catch (err) {
      alert("Errore: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setReviewingDocId(null);
    }
  };

  const handleDecision = async (decision: "approve" | "reject") => {
    if (!confirm(`Sei sicuro di voler ${decision === "approve" ? "approvare" : "rifiutare"} questa iscrizione?`)) return;

    setIsSubmittingDecision(true);
    try {
      const res = await fetch(`/api/org-admin/members/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes: decisionNotes }),
      });
      if (!res.ok) throw new Error("Errore durante il salvataggio della decisione");

      const result = await res.json();

      // Update local state
      setMember(prev => {
        if (!prev) return null;
        return {
          ...prev,
          status: result.status,
          decision_notes: decisionNotes,
          decision_at: new Date().toISOString() // optimistic update
        };
      });
      alert("Decisione salvata con successo!");

    } catch (err) {
        alert("Errore: " + (err instanceof Error ? err.message : String(err)));
    } finally {
        setIsSubmittingDecision(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Caricamento...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!member) return <div className="p-8 text-center">Socio non trovato</div>;

  // Check if all docs are approved (ignoring rejected ones if they are not required? No, usually all must be approved)
  // Assuming all uploaded docs must be approved.
  const allDocsApproved = member.documents.length > 0 && member.documents.every(d => d.status === "approved");
  const isDecisionMade = member.status === "active" || member.status === "rejected";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/org-admin/soci" className="p-2 hover:bg-neutral-100 rounded-full text-neutral-600">
           {/* ArrowLeft */}
           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </Link>
        <h1 className="text-2xl font-bold font-display text-primary-900">
          Dettaglio Socio
        </h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="grid md:grid-cols-2 gap-6">
            <div>
                <h2 className="text-lg font-semibold mb-4">Anagrafica</h2>
                <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Nome</dt>
                        <dd className="font-medium">{member.first_name} {member.last_name}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Email</dt>
                        <dd className="font-medium">{member.email}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Codice Fiscale</dt>
                        <dd className="font-medium">{member.fiscal_code}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Telefono</dt>
                        <dd className="font-medium">{member.phone || "-"}</dd>
                    </div>
                </dl>
            </div>
            <div>
                <h2 className="text-lg font-semibold mb-4">Stato Iscrizione</h2>
                <dl className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                        <dt className="text-neutral-500">Stato</dt>
                        <dd className={`px-2 py-1 rounded-full text-xs font-medium ${
                          member.status === "active" ? "bg-green-100 text-green-700" :
                          member.status === "pending_verification" ? "bg-amber-100 text-amber-700" :
                          member.status === "rejected" ? "bg-red-100 text-red-700" :
                          "bg-neutral-100 text-neutral-700"
                        }`}>
                          {member.status === "active" ? "Attivo" :
                           member.status === "pending_verification" ? "In Verifica" :
                           member.status === "rejected" ? "Respinto" : member.status}
                        </dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Tessera N.</dt>
                        <dd className="font-mono font-medium">{member.card_no || "Non assegnata"}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Data Iscrizione</dt>
                        <dd className="font-medium">
                            {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : "-"}
                        </dd>
                    </div>
                </dl>
            </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-100">
            <h2 className="text-lg font-semibold">Documenti Caricati</h2>
        </div>
        <div className="divide-y divide-neutral-100">
            {member.documents.length === 0 ? (
                <div className="p-6 text-center text-neutral-500 text-sm">Nessun documento caricato.</div>
            ) : (
                member.documents.map(doc => (
                    <div key={doc.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-neutral-50 rounded text-neutral-500">
                                {/* FileText */}
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <div>
                                <h3 className="font-medium text-sm text-neutral-900">{doc.type === 'identity' ? 'Documento Identità' : doc.type === 'fiscal_code' ? 'Codice Fiscale' : doc.type}</h3>
                                <p className="text-xs text-neutral-500">
                                  {doc.filename}
                                  {doc.size_bytes ? ` (${formatBytes(doc.size_bytes)})` : ''}
                                </p>
                                <p className="text-xs text-neutral-400 mt-1">Caricato il {new Date(doc.uploaded_at).toLocaleDateString()}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                             {/* Download Button */}
                             <a
                                href={doc.download_url || `/api/org-admin/documents/${doc.id}`}
                                className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg flex items-center gap-1 text-sm font-medium transition-colors"
                                title="Scarica"
                             >
                                {/* Download */}
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                <span className="hidden md:inline">Scarica</span>
                             </a>

                             {/* Review Actions */}
                             <div className="flex items-center gap-2">
                                {doc.status === "uploaded" || doc.status === "pending" || doc.status === "rejected" ? (
                                    <>
                                        <button
                                            onClick={() => handleReview(doc.id, "approved")}
                                            disabled={reviewingDocId === doc.id || isDecisionMade}
                                            className="px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {/* Check */}
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            Approva
                                        </button>
                                        {doc.status !== "rejected" && (
                                            <button
                                                onClick={() => handleReview(doc.id, "rejected")}
                                                disabled={reviewingDocId === doc.id || isDecisionMade}
                                                className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {/* X */}
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                Rifiuta
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <span className="px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-sm font-medium flex items-center gap-1">
                                        {/* Check */}
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                        Approvato
                                    </span>
                                )}
                             </div>
                        </div>
                    </div>
                ))
            )}
        </div>
      </div>

      {/* Final Decision Section */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Decisione Iscrizione</h2>

          {!allDocsApproved && !isDecisionMade && (
              <div className="bg-amber-50 text-amber-800 p-4 rounded-lg text-sm mb-4 border border-amber-100 flex gap-2">
                 <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                 <p>Non è possibile approvare l'iscrizione finché tutti i documenti non sono stati approvati.</p>
              </div>
          )}

          <div className="space-y-4">
              <div>
                  <label htmlFor="decisionNotes" className="block text-sm font-medium text-neutral-700 mb-1">
                      Note decisione (opzionale)
                  </label>
                  <textarea
                      id="decisionNotes"
                      rows={3}
                      className="w-full rounded-md border border-neutral-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm p-2"
                      placeholder="Inserisci eventuali note per l'approvazione o il rifiuto..."
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                      disabled={isDecisionMade || isSubmittingDecision}
                  />
              </div>

              {isDecisionMade ? (
                  <div className={`p-4 rounded-lg border ${member.status === 'active' ? 'bg-green-50 border-green-100 text-green-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                      <p className="font-medium">
                          Decisione presa: {member.status === 'active' ? 'Approvata' : 'Rifiutata'}
                      </p>
                      {member.decision_at && (
                          <p className="text-sm mt-1 opacity-80">
                              Data: {new Date(member.decision_at).toLocaleString()}
                          </p>
                      )}
                      {member.decision_notes && (
                          <p className="text-sm mt-2 pt-2 border-t border-black/10">
                              Note: {member.decision_notes}
                          </p>
                      )}
                  </div>
              ) : (
                  <div className="flex gap-4">
                      <button
                          onClick={() => handleDecision("approve")}
                          disabled={!allDocsApproved || isSubmittingDecision}
                          className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                      >
                          Approva Iscrizione
                      </button>
                      <button
                          onClick={() => handleDecision("reject")}
                          disabled={isSubmittingDecision}
                          className="flex-1 bg-white text-red-600 border border-red-200 px-4 py-2 rounded-lg font-medium hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                      >
                          Rigetta Iscrizione
                      </button>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
}
