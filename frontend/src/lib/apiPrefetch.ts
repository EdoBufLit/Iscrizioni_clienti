import { FIRST_QUOTE_REMINDER_YEAR, romeYear } from "./quoteReminders";
import { fetchMemberBookings, fetchMemberDocuments, fetchMemberMembership, fetchMemberOrganizationStatute, fetchCardStock, fetchOrgAdminMembers, fetchOrgAdminQuotes, fetchOrgAdminMetrics, fetchOrgAdminMembershipSettings } from "./api";

/** Intent-based warming only: avoid speculative traffic on constrained connections. */
export function prefetchDashboardRoute(path: string): void {
  if (navigator.onLine === false) return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) return;
  const pathname = path.split("?")[0].replace(/\/$/, "");
  let requests: Promise<unknown>[] = [];
  if (pathname === "/dashboard") requests = [fetchMemberMembership(), import("../pages/dashboard/DashboardHome")];
  else if (pathname === "/dashboard/documenti") requests = [fetchMemberDocuments(), fetchMemberOrganizationStatute(), import("../pages/dashboard/DashboardDocuments")];
  else if (pathname === "/dashboard/prenotazioni") requests = [fetchMemberBookings(), import("../pages/dashboard/DashboardBookings")];
  else if (pathname === "/dashboard/profilo") requests = [import("../pages/dashboard/DashboardProfile")];
  else if (pathname === "/org-admin") requests = [fetchOrgAdminMetrics(), import("../pages/org-admin/OrgAdminDashboard")];
  else if (pathname === "/org-admin/soci") requests = [fetchOrgAdminMembershipSettings(), fetchOrgAdminMembers({ status: "active", order: "joined_at_desc", limit: 25, offset: 0 }), import("../pages/org-admin/OrgAdminMembers")];
  else if (pathname === "/org-admin/quote") requests = [fetchOrgAdminMembershipSettings(), fetchOrgAdminQuotes({ year: Math.max(FIRST_QUOTE_REMINDER_YEAR, romeYear()), limit: 25, offset: 0 }), import("../pages/org-admin/OrgAdminQuote")];
  else if (pathname === "/org-admin/prenotazioni") requests = [import("../pages/org-admin/OrgAdminBookings")];
  else if (pathname === "/org-admin/tessere") requests = [fetchCardStock(), fetchOrgAdminMetrics(), fetchOrgAdminMembershipSettings(), fetchOrgAdminQuotes({ year: romeYear(), limit: 1, offset: 0 }), import("../pages/org-admin/OrgAdminCards")];
  void Promise.allSettled(requests);
}
