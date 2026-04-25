import type { ReactNode } from "react";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "muted";

const toneClasses: Record<Tone, string> = {
  default: "border-slate-200 bg-white text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  muted: "border-slate-200 bg-slate-50 text-slate-600",
};

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  breadcrumbs,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}) {
  return (
    <header className="org-page-header">
      <div className="min-w-0">
        {breadcrumbs ? <div className="org-page-header__breadcrumbs">{breadcrumbs}</div> : null}
        {eyebrow ? <p className="org-eyebrow">{eyebrow}</p> : null}
        <h1 className="org-page-header__title">{title}</h1>
        {subtitle ? <p className="org-page-header__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="org-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function SectionPanel({
  children,
  className = "",
  title,
  eyebrow,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`org-section-panel ${className}`}>
      {title || eyebrow || action ? (
        <div className="org-section-panel__header">
          <div>
            {eyebrow ? <p className="org-eyebrow">{eyebrow}</p> : null}
            {title ? <h2 className="org-section-panel__title">{title}</h2> : null}
          </div>
          {action ? <div>{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <div className={`org-kpi-card org-kpi-card--${tone}`}>
      <div className="org-kpi-card__body">
        <span className="org-kpi-card__label">{label}</span>
        <span className="org-kpi-card__value">{value}</span>
        {hint ? <span className="org-kpi-card__hint">{hint}</span> : null}
      </div>
      {icon ? <span className="org-kpi-card__icon">{icon}</span> : null}
    </div>
  );
}

export function StatusChip({ children, tone = "default" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`org-status-chip ${toneClasses[tone]}`}>{children}</span>;
}

export function ActionCard({
  title,
  description,
  icon,
  cta,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  cta?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="org-action-card" onClick={onClick} disabled={disabled}>
      {icon ? <span className="org-action-card__icon">{icon}</span> : null}
      <span className="org-action-card__content">
        <span className="org-action-card__title">{title}</span>
        <span className="org-action-card__description">{description}</span>
        {cta ? <span className="org-action-card__cta">{cta}</span> : null}
      </span>
      <span className="org-action-card__arrow">-&gt;</span>
    </button>
  );
}

export function Stepper({
  steps,
  active,
  onSelect,
}: {
  steps: Array<{ key: string; label: string; hint?: string }>;
  active: string;
  onSelect?: (key: string) => void;
}) {
  const activeIndex = Math.max(0, steps.findIndex((step) => step.key === active));
  return (
    <div className="org-stepper" style={{ ["--steps" as string]: String(steps.length) }}>
      {steps.map((step, index) => {
        const isActive = index === activeIndex;
        const isComplete = index < activeIndex;
        return (
          <button
            key={step.key}
            type="button"
            className={`org-stepper__item ${isActive ? "is-active" : ""} ${isComplete ? "is-complete" : ""}`}
            onClick={() => onSelect?.(step.key)}
            disabled={!onSelect}
          >
            <span className="org-stepper__dot">{index + 1}</span>
            <span className="org-stepper__copy">
              <span className="org-stepper__label">{step.label}</span>
              {step.hint ? <span className="org-stepper__hint">{step.hint}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function DetailPanel({
  title,
  eyebrow,
  children,
  action,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <aside className={`org-detail-panel ${className}`}>
      <div className="org-detail-panel__header">
        <div>
          {eyebrow ? <p className="org-eyebrow">{eyebrow}</p> : null}
          <h2 className="org-detail-panel__title">{title}</h2>
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      {children}
    </aside>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="org-empty-state">
      <p className="org-empty-state__title">{title}</p>
      {description ? <p className="org-empty-state__description">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
