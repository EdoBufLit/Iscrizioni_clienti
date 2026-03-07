import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

type IconName =
  | "home"
  | "user"
  | "docs"
  | "logout"
  | "users"
  | "cards"
  | "more"
  | "building"
  | "chart"
  | "shield"
  | "book"
  | "globe";

type MobileDashboardNavItem = {
  key: string;
  label: string;
  icon: IconName;
  to?: string;
  onSelect?: () => void | Promise<void>;
  activeMatch?: string[];
  exact?: boolean;
  tone?: "default" | "danger";
};

type MobileDashboardNavProps = {
  items: MobileDashboardNavItem[];
  moreItems?: MobileDashboardNavItem[];
  moreLabel?: string;
  moreTitle?: string;
  moreContent?: ReactNode;
};

const iconClassName = "h-[1.15rem] w-[1.15rem]";

const matchesPath = (pathname: string, item: MobileDashboardNavItem) => {
  const matchers = item.activeMatch?.length ? item.activeMatch : item.to ? [item.to] : [];
  if (matchers.length === 0) return false;
  return matchers.some((matcher) => {
    if (!matcher) return false;
    if (item.exact) return pathname === matcher;
    return pathname === matcher || pathname.startsWith(`${matcher}/`);
  });
};

const NavIcon = ({ icon }: { icon: IconName }) => {
  switch (icon) {
    case "user":
      return (
        <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        </svg>
      );
    case "docs":
      return (
        <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      );
    case "logout":
      return (
        <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m-3 0 3-3m0 0-3-3m3 3H9" />
        </svg>
      );
    case "users":
      return (
        <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a8.965 8.965 0 0 0 3-1.272A8.97 8.97 0 0 0 18 15.75M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 11.25a8.966 8.966 0 0 1-18 0A8.966 8.966 0 0 1 12 9a8.966 8.966 0 0 1 9 9Z" />
        </svg>
      );
    case "cards":
      return (
        <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5M6 15h2.25m2.25 0h3.75m-8.625 4.125h12.75A2.625 2.625 0 0 0 21 16.5v-9A2.625 2.625 0 0 0 18.375 4.875H5.625A2.625 2.625 0 0 0 3 7.5v9a2.625 2.625 0 0 0 2.625 2.625Z" />
        </svg>
      );
    case "more":
      return (
        <svg className={iconClassName} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="19" cy="12" r="1.9" />
        </svg>
      );
    case "building":
      return (
        <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M5.25 21V6.75A1.5 1.5 0 0 1 6.75 5.25h10.5a1.5 1.5 0 0 1 1.5 1.5V21M9 9h.008v.008H9V9Zm0 3h.008v.008H9V12Zm0 3h.008v.008H9V15Zm6-6h.008v.008H15V9Zm0 3h.008v.008H15V12Zm0 3h.008v.008H15V15Z" />
        </svg>
      );
    case "chart":
      return (
        <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7.5 15.75V12m4.5 3.75V8.25m4.5 7.5V5.25" />
        </svg>
      );
    case "shield":
      return (
        <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7.5 3v5.25c0 4.338-3.015 8.218-7.5 9.75-4.485-1.532-7.5-5.412-7.5-9.75V6L12 3Z" />
        </svg>
      );
    case "book":
      return (
        <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75v10.5m0-10.5c-1.932-1.45-4.526-2.25-7.125-2.25A1.875 1.875 0 0 0 3 6.375v11.25c0 .621.504 1.125 1.125 1.125 2.6 0 5.193.8 7.125 2.25m0-14.25c1.932-1.45 4.525-2.25 7.125-2.25A1.875 1.875 0 0 1 21 6.375v11.25c0 .621-.504 1.125-1.125 1.125-2.6 0-5.193.8-7.125 2.25" />
        </svg>
      );
    case "globe":
      return (
        <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m-8.25 9h16.5" />
        </svg>
      );
    case "home":
    default:
      return (
        <svg className={iconClassName} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12 11.204 3.045a1.125 1.125 0 0 1 1.592 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
        </svg>
      );
  }
};

const MobileDashboardNav = ({
  items,
  moreItems = [],
  moreLabel = "Altro",
  moreTitle = "Altre azioni",
  moreContent,
}: MobileDashboardNavProps) => {
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const hasMore = moreItems.length > 0;
  const moreActive = useMemo(
    () => moreItems.some((item) => matchesPath(location.pathname, item)),
    [location.pathname, moreItems],
  );

  useEffect(() => {
    setSheetOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!sheetOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [sheetOpen]);

  const renderAction = (item: MobileDashboardNavItem, mode: "bar" | "sheet") => {
    const isActive = matchesPath(location.pathname, item);
    const danger = item.tone === "danger";
    const baseClass =
      mode === "bar"
        ? `mobile-dashboard-nav__item ${isActive ? "mobile-dashboard-nav__item--active" : ""} ${danger ? "mobile-dashboard-nav__item--danger" : ""}`
        : `mobile-dashboard-sheet__action ${danger ? "mobile-dashboard-sheet__action--danger" : ""}`;
    const content = (
      <>
        <span className={mode === "bar" ? "mobile-dashboard-nav__icon" : "mobile-dashboard-sheet__icon"}>
          <NavIcon icon={item.icon} />
        </span>
        <span className={mode === "bar" ? "mobile-dashboard-nav__label" : "mobile-dashboard-sheet__label"}>
          {item.label}
        </span>
      </>
    );

    if (item.to) {
      return (
        <Link key={item.key} to={item.to} className={baseClass}>
          {content}
        </Link>
      );
    }

    return (
      <button
        key={item.key}
        type="button"
        onClick={() => {
          setSheetOpen(false);
          void item.onSelect?.();
        }}
        className={baseClass}
      >
        {content}
      </button>
    );
  };

  return (
    <>
      <div className="mobile-dashboard-nav md:hidden" aria-label="Navigazione dashboard mobile">
        <div className="mobile-dashboard-nav__shell">
          {items.map((item) => renderAction(item, "bar"))}
          {hasMore && (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className={`mobile-dashboard-nav__item ${sheetOpen || moreActive ? "mobile-dashboard-nav__item--active" : ""}`}
            >
              <span className="mobile-dashboard-nav__icon">
                <NavIcon icon="more" />
              </span>
              <span className="mobile-dashboard-nav__label">{moreLabel}</span>
            </button>
          )}
        </div>
      </div>

      {hasMore && sheetOpen && (
        <div className="mobile-dashboard-sheet md:hidden" role="dialog" aria-modal="true" aria-label={moreTitle}>
          <button
            type="button"
            className="mobile-dashboard-sheet__backdrop"
            aria-label="Chiudi menu"
            onClick={() => setSheetOpen(false)}
          />
          <div className="mobile-dashboard-sheet__panel">
            <div className="mobile-dashboard-sheet__handle" />
            <div className="mobile-dashboard-sheet__header">
              <div>
                <p className="mobile-dashboard-sheet__eyebrow">Dashboard mobile</p>
                <h3 className="mobile-dashboard-sheet__title">{moreTitle}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="mobile-dashboard-sheet__close"
                aria-label="Chiudi menu"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" d="M5 5L15 15" />
                  <path strokeLinecap="round" d="M15 5L5 15" />
                </svg>
              </button>
            </div>
            <div className="mobile-dashboard-sheet__grid">
              {moreItems.map((item) => renderAction(item, "sheet"))}
            </div>
            {moreContent ? <div className="mt-3">{moreContent}</div> : null}
          </div>
        </div>
      )}
    </>
  );
};

export type { MobileDashboardNavItem };
export default MobileDashboardNav;
