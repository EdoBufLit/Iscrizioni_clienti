import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useOrgAdmin } from "../OrgAdminLayout";
import { useToast } from "../../../components/ui/ToastProvider";

export const CAMPAIGN_SEGMENT_KEY = "org-admin-campaign-segment";
export type CampaignSegment = { orgId: number; adminId: number; createdAt: number; ids: number[]; title: string };

export default function CampaignSegmentActions({ source, query, loadPage }: { source: "soci" | "quote"; query: string; loadPage: (offset: number) => Promise<{ ids: number[]; total: number }> }) {
  const { admin } = useOrgAdmin();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => { generation.current += 1; setBusy(false); return () => { generation.current += 1; }; }, [query, admin?.org_id, admin?.id]);
  const [busy, setBusy] = useState(false);
  const storageKey = `org-admin-segment:${admin?.org_id}:${admin?.id}:${source}`;
  const [saved, setSaved] = useState(() => { try { return localStorage.getItem(storageKey) || ""; } catch { return ""; } });
  const save = () => { try { localStorage.setItem(storageKey, query); setSaved(query); showToast({ tone: "success", message: "Filtri del segmento salvati su questo dispositivo." }); } catch { showToast({ tone: "error", message: "Impossibile salvare il segmento su questo dispositivo." }); } };
  async function start() {
    if (!admin || lock.current) return;
    lock.current = true; setBusy(true);
    const version = generation.current;
    try {
      const ids = new Set<number>();
      let offset = 0;
      for (;;) {
        const page = await loadPage(offset);
        if (version !== generation.current) return;
        if (page.total > 10000) throw new Error("Il segmento supera 10.000 soci. Restringi i filtri prima di creare la campagna.");
        page.ids.forEach(id => ids.add(id));
        offset += page.ids.length;
        if (offset >= page.total) break;
        if (!page.ids.length) throw new Error("Il segmento è cambiato durante il caricamento. Riprova.");
      }
      if (!ids.size) throw new Error("Nessun socio corrisponde ai filtri selezionati.");
      const payload: CampaignSegment = { orgId: admin.org_id, adminId: admin.id, createdAt: Date.now(), ids: [...ids], title: source === "quote" ? "Campagna quote e rinnovi" : "Campagna da segmento soci" };
      sessionStorage.setItem(CAMPAIGN_SEGMENT_KEY, JSON.stringify(payload));
      navigate("/org-admin/comunicazioni?tab=campagne&segment=selected");
    } catch (error) { if (version === generation.current) showToast({ tone: "error", message: error instanceof Error ? error.message : "Impossibile preparare il segmento." }); }
    finally { lock.current = false; if (version === generation.current) setBusy(false); }
  }
  return <details className="my-2 min-w-0"><summary className="cursor-pointer text-sm font-semibold py-2">Segmenti e campagne</summary><div className="flex flex-wrap items-center gap-2 py-2">
    <button type="button" className="btn-secondary" onClick={save}>Salva segmento</button>
    {saved && <Link reloadDocument className="btn-secondary" to={`/org-admin/${source}?${saved}`}>Riapri segmento salvato</Link>}
    <button type="button" className="btn-secondary" disabled={busy || !admin} onClick={() => void start()}>{busy ? "Preparo destinatari…" : "Crea campagna dai filtri"}</button>
  </div></details>;
}
