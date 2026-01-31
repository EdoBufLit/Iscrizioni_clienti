import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

interface Document {
  id: number;
  type: string;
  filename: string;
  uploaded_at: string;
  status: string;
  review_notes?: string;
  reviewed_at?: string;
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
}

export default function OrgAdminMemberDetail() {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewingDocId, setReviewingDocId] = useState<number | null>(null);

  useEffect(() => {
    fetchMember();
  }, [id]);

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

  if (loading) return <div className="p-8 text-center">Caricamento...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!member) return <div className="p-8 text-center">Socio non trovato</div>;

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
                        <dd className="font-medium font-mono">{member.card_no || "Non assegnata"}</dd>
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
                                <p className="text-xs text-neutral-500">{doc.filename}</p>
                                <p className="text-xs text-neutral-400 mt-1">Caricato il {new Date(doc.uploaded_at).toLocaleDateString()}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                             {/* Download Button */}
                             <a
                                href={`/api/org-admin/documents/${doc.id}`}
                                className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg flex items-center gap-1 text-sm font-medium transition-colors"
                                title="Scarica"
                             >
                                {/* Download */}
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                <span className="hidden md:inline">Scarica</span>
                             </a>

                             {/* Review Actions */}
                             <div className="flex items-center gap-2">
                                {doc.status === "uploaded" || doc.status === "rejected" ? (
                                    <>
                                        <button
                                            onClick={() => handleReview(doc.id, "approved")}
                                            disabled={reviewingDocId === doc.id}
                                            className="px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors"
                                        >
                                            {/* Check */}
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            Approva
                                        </button>
                                        {doc.status !== "rejected" && (
                                            <button
                                                onClick={() => handleReview(doc.id, "rejected")}
                                                disabled={reviewingDocId === doc.id}
                                                className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors"
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
    </div>
  );
}
