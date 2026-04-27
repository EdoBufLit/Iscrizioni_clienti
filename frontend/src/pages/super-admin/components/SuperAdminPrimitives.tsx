import type { ButtonHTMLAttributes, ReactNode } from "react";

export type SuperAdminTone =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted"
  | "accent"
  | "purple";

export type SuperAdminIconName =
  | "users"
  | "user"
  | "document"
  | "documents"
  | "building"
  | "card"
  | "cards"
  | "book"
  | "check"
  | "clock"
  | "x"
  | "download"
  | "upload"
  | "plus"
  | "refresh"
  | "search"
  | "filter"
  | "settings"
  | "link"
  | "mail"
  | "shield"
  | "api"
  | "wallet"
  | "eye"
  | "trash"
  | "send"
  | "chevron"
  | "edit";

const iconPath: Record<SuperAdminIconName, ReactNode> = {
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  user: (
    <>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  document: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </>
  ),
  documents: (
    <>
      <path d="M16 2H8a2 2 0 0 0-2 2v14" />
      <path d="M8 6h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
      <path d="M10 12h6" />
      <path d="M10 16h5" />
    </>
  ),
  building: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
      <path d="M9 8h.01" />
      <path d="M15 8h.01" />
      <path d="M9 12h.01" />
      <path d="M15 12h.01" />
      <path d="M9 16h.01" />
      <path d="M15 16h.01" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h3" />
    </>
  ),
  cards: (
    <>
      <rect x="3" y="7" width="14" height="12" rx="2" />
      <path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M3 12h14" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5Z" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  x: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 0 1-15.5 6.2" />
      <path d="M3 12A9 9 0 0 1 18.5 5.8" />
      <path d="M18 2v4h4" />
      <path d="M6 22v-4H2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </>
  ),
  filter: (
    <>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54Z" />
    </>
  ),
  settings: (
    <>
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.07.07a2 2 0 1 1-2.83 2.83l-.07-.07a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1 1.64V21a2 2 0 1 1-4 0v-.1a1.8 1.8 0 0 0-1-1.64 1.8 1.8 0 0 0-2 .36l-.07.07a2 2 0 1 1-2.83-2.83l.07-.07a1.8 1.8 0 0 0 .36-2 1.8 1.8 0 0 0-1.64-1H3a2 2 0 1 1 0-4h.1a1.8 1.8 0 0 0 1.64-1 1.8 1.8 0 0 0-.36-2l-.07-.07a2 2 0 1 1 2.83-2.83l.07.07a1.8 1.8 0 0 0 2 .36 1.8 1.8 0 0 0 1-1.64V3a2 2 0 1 1 4 0v.1a1.8 1.8 0 0 0 1 1.64 1.8 1.8 0 0 0 2-.36l.07-.07a2 2 0 1 1 2.83 2.83l-.07.07a1.8 1.8 0 0 0-.36 2 1.8 1.8 0 0 0 1.64 1H21a2 2 0 1 1 0 4h-.1a1.8 1.8 0 0 0-1.5 1Z" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 1 0-7.07-7.07L11 4.93" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 1 0 7.07 7.07L13 19.07" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-5" />
    </>
  ),
  api: (
    <>
      <path d="m8 16-4-4 4-4" />
      <path d="m16 8 4 4-4 4" />
      <path d="m14 4-4 16" />
    </>
  ),
  wallet: (
    <>
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
      <path d="M16 12h6v5h-6a2.5 2.5 0 0 1 0-5Z" />
      <path d="M18 14.5h.01" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
};

const isSuperAdminIconName = (value: unknown): value is SuperAdminIconName =>
  typeof value === "string" && value in iconPath;

export function SuperAdminIcon({
  name,
  className = "h-4 w-4",
}: {
  name: SuperAdminIconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPath[name]}
    </svg>
  );
}

export function SuperAdminPageHeader({
  icon,
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  icon?: SuperAdminIconName | ReactNode;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const iconNode =
    isSuperAdminIconName(icon) ? <SuperAdminIcon name={icon} className="h-6 w-6" /> : icon;
  return (
    <header className="sa-page-header">
      <div className="sa-page-header__main">
        {iconNode ? <span className="sa-page-header__icon">{iconNode}</span> : null}
        <div className="min-w-0">
          {eyebrow ? <p className="sa-eyebrow">{eyebrow}</p> : null}
          <h1 className="sa-page-header__title">{title}</h1>
          {subtitle ? <p className="sa-page-header__subtitle">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="sa-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function SuperAdminKpiCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: SuperAdminIconName | ReactNode;
  tone?: SuperAdminTone;
}) {
  const iconNode =
    isSuperAdminIconName(icon) ? <SuperAdminIcon name={icon} className="h-5 w-5" /> : icon;
  return (
    <article className={`sa-kpi sa-kpi--${tone}`}>
      <div>
        <p className="sa-kpi__label">{label}</p>
        <div className="sa-kpi__value">{value}</div>
        {hint ? <p className="sa-kpi__hint">{hint}</p> : null}
      </div>
      {iconNode ? <span className="sa-kpi__icon">{iconNode}</span> : null}
    </article>
  );
}

export function SuperAdminStatusChip({
  children,
  tone = "default",
  dot = false,
}: {
  children: ReactNode;
  tone?: SuperAdminTone;
  dot?: boolean;
}) {
  return (
    <span className={`sa-chip sa-chip--${tone}`}>
      {dot ? <span className="sa-chip__dot" /> : null}
      {children}
    </span>
  );
}

export function SuperAdminTabs({
  items,
  active,
  onSelect,
}: {
  items: Array<{ key: string; label: string; icon?: SuperAdminIconName }>;
  active: string;
  onSelect?: (key: string) => void;
}) {
  return (
    <div className="sa-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`sa-tabs__item ${active === item.key ? "is-active" : ""}`}
          onClick={() => onSelect?.(item.key)}
          role="tab"
          aria-selected={active === item.key}
        >
          {item.icon ? <SuperAdminIcon name={item.icon} /> : null}
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function SuperAdminToolbar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`sa-toolbar ${className}`}>{children}</section>;
}

export function SuperAdminTableShell({
  children,
  title,
  subtitle,
  action,
  className = "",
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`sa-table-shell ${className}`}>
      {title || subtitle || action ? (
        <div className="sa-table-shell__header">
          <div>
            {title ? <h2 className="sa-table-shell__title">{title}</h2> : null}
            {subtitle ? <p className="sa-table-shell__subtitle">{subtitle}</p> : null}
          </div>
          {action ? <div className="sa-table-shell__action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function SuperAdminDetailPanel({
  children,
  title,
  eyebrow,
  action,
  className = "",
}: {
  children: ReactNode;
  title: ReactNode;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <aside className={`sa-detail-panel ${className}`}>
      <div className="sa-detail-panel__header">
        <div>
          {eyebrow ? <p className="sa-eyebrow">{eyebrow}</p> : null}
          <h2 className="sa-detail-panel__title">{title}</h2>
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      {children}
    </aside>
  );
}

export function SuperAdminEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="sa-empty">
      <p className="sa-empty__title">{title}</p>
      {description ? <p className="sa-empty__description">{description}</p> : null}
      {action ? <div className="sa-empty__action">{action}</div> : null}
    </div>
  );
}

export function SuperAdminProgressMeter({
  value,
  label,
  tone = "success",
}: {
  value: number;
  label?: ReactNode;
  tone?: SuperAdminTone;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="sa-progress">
      <div className="sa-progress__track">
        <span className={`sa-progress__bar sa-progress__bar--${tone}`} style={{ width: `${clamped}%` }} />
      </div>
      {label ? <span className="sa-progress__label">{label}</span> : null}
    </div>
  );
}

export function SuperAdminActionButton({
  children,
  tone = "default",
  icon,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: SuperAdminTone | "primary";
  icon?: SuperAdminIconName | ReactNode;
}) {
  const iconNode =
    isSuperAdminIconName(icon) ? <SuperAdminIcon name={icon} className="h-4 w-4" /> : icon;
  return (
    <button type="button" className={`sa-btn sa-btn--${tone} ${className}`.trim()} {...props}>
      {iconNode ? <span className="sa-btn__icon">{iconNode}</span> : null}
      {children}
    </button>
  );
}

export function SuperAdminActionRail({ children }: { children: ReactNode }) {
  return <div className="sa-action-rail">{children}</div>;
}

export function SuperAdminModalShell({
  children,
  title,
  subtitle,
  icon,
  onClose,
  footer,
  size = "lg",
  className = "",
}: {
  children: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: SuperAdminIconName | ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const iconNode =
    isSuperAdminIconName(icon) ? <SuperAdminIcon name={icon} className="h-5 w-5" /> : icon;
  return (
    <div className="sa-modal" role="dialog" aria-modal="true">
      <div className={`sa-modal__panel sa-modal__panel--${size} ${className}`}>
        <header className="sa-modal__header">
          <div className="sa-modal__heading">
            {iconNode ? <span className="sa-modal__icon">{iconNode}</span> : null}
            <div>
              <h2 className="sa-modal__title">{title}</h2>
              {subtitle ? <p className="sa-modal__subtitle">{subtitle}</p> : null}
            </div>
          </div>
          <button type="button" className="sa-icon-button" onClick={onClose} aria-label="Chiudi">
            <SuperAdminIcon name="x" />
          </button>
        </header>
        <div className="sa-modal__body">{children}</div>
        {footer ? <footer className="sa-modal__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function SuperAdminDrawerShell({
  children,
  title,
  subtitle,
  status,
  onClose,
  nav,
  footer,
}: {
  children: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  onClose: () => void;
  nav?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="sa-drawer" role="dialog" aria-modal="true">
      <button className="sa-drawer__backdrop" type="button" onClick={onClose} aria-label="Chiudi" />
      <section className="sa-drawer__panel">
        <header className="sa-drawer__header">
          <div>
            <h2 className="sa-drawer__title">{title}</h2>
            {subtitle ? <p className="sa-drawer__subtitle">{subtitle}</p> : null}
          </div>
          <div className="sa-drawer__meta">
            {status}
            <button type="button" className="sa-icon-button" onClick={onClose} aria-label="Chiudi">
              <SuperAdminIcon name="x" />
            </button>
          </div>
        </header>
        <div className="sa-drawer__content">
          {nav ? <nav className="sa-drawer__nav">{nav}</nav> : null}
          <div className="sa-drawer__body">{children}</div>
        </div>
        {footer ? <footer className="sa-drawer__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
