import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[ErrorBoundary]",
      error.name,
      error.message,
      info.componentStack,
    );
  }

  private handleRetry = () => {
    // Full page reload to guarantee clean state
    window.location.reload();
  };

  private handleGoHome = () => {
    // Use full navigation (not SPA) so error state is fully cleared
    window.location.href = "/";
  };

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
          {import.meta.env.DEV && this.state.error && (
            <p className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700 text-left font-mono break-all">
              {this.state.error.name}: {this.state.error.message}
            </p>
          )}
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              className="btn-ghost"
              onClick={this.handleRetry}
            >
              Ricarica
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={this.handleGoHome}
            >
              Torna alla home
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
