import { useTheme } from "./ThemeProvider";

type ThemeToggleProps = {
  className?: string;
};

const ThemeToggle = ({ className = "" }: ThemeToggleProps) => {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={`theme-toggle${isDark ? " is-dark" : ""} ${className}`.trim()}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Attiva tema chiaro" : "Attiva tema scuro"}
      title={isDark ? "Passa al tema chiaro" : "Passa al tema scuro"}
    >
      <span className="theme-toggle__track" aria-hidden="true">
        <span className="theme-toggle__thumb" />
        <span className="theme-toggle__glyph theme-toggle__glyph--sun">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25M12 18.75V21M4.636 4.636l1.591 1.591M17.773 17.773l1.591 1.591M3 12h2.25M18.75 12H21M4.636 19.364l1.591-1.591M17.773 6.227l1.591-1.591M15.75 12A3.75 3.75 0 1 1 8.25 12a3.75 3.75 0 0 1 7.5 0Z" />
          </svg>
        </span>
        <span className="theme-toggle__glyph theme-toggle__glyph--moon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 0 1 11.21 3c0 .34-.03.67-.08 1A7.5 7.5 0 1 0 20 12.87c.33-.05.66-.08 1-.08Z" />
          </svg>
        </span>
      </span>
      <span className="sr-only">{isDark ? "Tema scuro attivo" : "Tema chiaro attivo"}</span>
    </button>
  );
};

export default ThemeToggle;
