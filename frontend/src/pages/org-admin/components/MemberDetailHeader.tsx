import { useRef, type KeyboardEvent } from "react";
import type { OrgAdminMemberDetail } from "../../../lib/api";
import { displayMemberName, formatMemberDate, lifecycleMeta } from "./memberDetailPresentation";

export type MemberDetailTab = "profile" | "payments" | "documents" | "activity";
const tabs: Array<{ id: MemberDetailTab; label: string }> = [
  { id: "profile", label: "Profilo" }, { id: "payments", label: "Pagamenti" },
  { id: "documents", label: "Documenti e note" }, { id: "activity", label: "Attività" },
];
export function DetailIcon({ name }: { name: "phone" | "email" | "card" | "edit" }) {
  const paths = {
    phone: "M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.1-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .3 2 .7 2.9a2 2 0 01-.5 2.1L8 10a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.5c.9.4 1.9.6 2.9.7a2 2 0 011.7 2z",
    email: "M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm-2 2l10 7L22 6",
    card: "M3 4h18a1 1 0 011 1v14a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1zM2 9h20M6 15h4",
    edit: "M16 3a2.1 2.1 0 013 3L8 17l-4 1 1-4L16 3zM13 6l3 3M20 14v6H4v-2",
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export default function MemberDetailHeader({ member, activeTab, onTabChange, onEdit, onShowCard }: {
  member: OrgAdminMemberDetail; activeTab: MemberDetailTab; onTabChange: (tab: MemberDetailTab) => void; onEdit: () => void; onShowCard: () => void;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const name = displayMemberName(member.first_name, member.last_name);
  const status = lifecycleMeta(member.status);
  const cardNumber = member.card_number ?? member.card_no;
  const phone = member.phone?.replace(/[^\d+]/g, "");
  const handleTabKey = (event: KeyboardEvent, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault(); onTabChange(tabs[next].id); tabRefs.current[next]?.focus();
  };
  return <>
    <section className="member-detail-hero" aria-label="Sintesi socio">
      <div className="member-detail-identity">
        <div className="member-detail-avatar" aria-hidden="true">{[member.first_name, member.last_name].map(part => part.trim()[0]?.toLocaleUpperCase("it-IT")).join("")}</div>
        <div className="min-w-0">
          <h1>{name || "Socio"}</h1>
          <div className="member-detail-status"><span className={`member-detail-badge ${status.tone}`}>{status.label}</span><span>{cardNumber != null ? `#${cardNumber}${member.card_year ? ` / ${member.card_year}` : ""}` : "Tessera da assegnare"}</span></div>
          {member.valid_until && <p className="member-detail-expiry">Scadenza {formatMemberDate(member.valid_until)}</p>}
        </div>
      </div>
      <div className="member-detail-quick-actions">
        {phone ? <a href={`tel:${phone}`} className="member-detail-quick"><span><DetailIcon name="phone" /></span>Chiama</a> : <button className="member-detail-quick" disabled title="Telefono non presente"><span><DetailIcon name="phone" /></span>Chiama</button>}
        {member.email ? <a href={`mailto:${member.email}`} className="member-detail-quick"><span><DetailIcon name="email" /></span>Email</a> : <button className="member-detail-quick" disabled title="Email non presente"><span><DetailIcon name="email" /></span>Email</button>}
        <button type="button" className="member-detail-quick" onClick={onShowCard}><span><DetailIcon name="card" /></span>Tessera</button>
        <button type="button" className="member-detail-quick" onClick={onEdit}><span><DetailIcon name="edit" /></span>Modifica</button>
      </div>
    </section>
    <div className="member-detail-tabs" role="tablist" aria-label="Sezioni del socio">
      {tabs.map((tab, index) => <button type="button" key={tab.id} ref={node => { tabRefs.current[index] = node; }} role="tab" id={`member-tab-${tab.id}`} aria-selected={activeTab === tab.id} aria-controls={`member-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => onTabChange(tab.id)} onKeyDown={event => handleTabKey(event, index)}>{tab.label}</button>)}
    </div>
  </>;
}
