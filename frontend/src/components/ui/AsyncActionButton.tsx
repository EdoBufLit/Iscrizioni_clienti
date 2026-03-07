import { type ButtonHTMLAttributes, type ReactNode } from "react";

export type AsyncActionState = "idle" | "loading" | "success" | "error";

type AsyncActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  state?: AsyncActionState;
  idleLabel: string;
  loadingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  icon?: ReactNode;
};

const Spinner = () => (
  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
    <path className="opacity-75" fill="currentColor" d="M22 12a10 10 0 0 0-10-10v3a7 7 0 0 1 7 7h3Z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const ErrorIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008v.008H12v-.008Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
  </svg>
);

const AsyncActionButton = ({
  state = "idle",
  idleLabel,
  loadingLabel = "Salvataggio...",
  successLabel = "Completato",
  errorLabel = "Riprova",
  icon,
  className = "",
  disabled,
  type = "button",
  ...rest
}: AsyncActionButtonProps) => {
  const label =
    state === "loading"
      ? loadingLabel
      : state === "success"
        ? successLabel
        : state === "error"
          ? errorLabel
          : idleLabel;

  const stateIcon =
    state === "loading"
      ? <Spinner />
      : state === "success"
        ? <CheckIcon />
        : state === "error"
          ? <ErrorIcon />
          : icon;

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      disabled={disabled || state === "loading"}
      {...rest}
    >
      {stateIcon}
      <span>{label}</span>
    </button>
  );
};

export default AsyncActionButton;
