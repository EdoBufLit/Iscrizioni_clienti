import AuditRegistry from "../../components/audit/AuditRegistry";

const OrgAdminAudit = () => (
  <div className="container-shell org-admin-mobile-page py-8">
    <AuditRegistry scope="org-admin" />
  </div>
);

export default OrgAdminAudit;
