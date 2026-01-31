import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = { children: ReactNode };
type State = { hasError: boolean };

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary caught:", error, info.componentStack);
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="surface max-w-md p-10 text-center">
          <h1 className="text-lg font-semibold text-neutral-900">
            Si è verificato un errore
          </h1>
          <p className="mt-3 text-sm leading-6 text-neutral-600">
            Qualcosa non ha funzionato come previsto. Prova a ricaricare la
            pagina o torna alla pagina principale.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => window.location.reload()}
            >
              Ricarica
            </button>
            <Link to="/" className="btn-primary">
              Torna alla home
            </Link>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
