import { useTheme, type ThemePreference } from "./ThemeProvider";

type ThemeOption = {
  value: ThemePreference;
  label: string;
  icon: JSX.Element;
};

const OPTIONS: ThemeOption[] = [
  {
    value: "light",
    label: "Chiaro",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25M12 18.75V21M4.636 4.636l1.591 1.591M17.773 17.773l1.591 1.591M3 12h2.25M18.75 12H21M4.636 19.364l1.591-1.591M17.773 6.227l1.591-1.591M15.75 12A3.75 3.75 0 1 1 8.25 12a3.75 3.75 0 0 1 7.5 0Z" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Scuro",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 0 1 11.21 3c0 .34-.03.67-.08 1A7.5 7.5 0 1 0 20 12.87c.33-.05.66-.08 1-.08Z" />
      </svg>
    ),
  },
  {
    value: "system",
    label: "Sistema",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5A1.5 1.5 0 0 1 21.75 6.75v9a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5v-9a1.5 1.5 0 0 1 1.5-1.5ZM9 20.25h6M10.5 17.25v3M13.5 17.25v3" />
      </svg>
    ),
  },
];

type ThemeToggleProps = {
  className?: string;
};

const ThemeToggle = ({ className = "" }: ThemeToggleProps) => {
  const { theme, setTheme } = useTheme();

  return (
    <div className={`theme-toggle ${className}`.trim()} role="group" aria-label="Selettore tema">
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={`theme-toggle__button${active ? " is-active" : ""}`}
            onClick={() => setTheme(option.value)}
            aria-pressed={active}
            title={`Tema ${option.label.toLowerCase()}`}
          >
            <span className="theme-toggle__icon">{option.icon}</span>
            <span className="theme-toggle__text">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ThemeToggle;
