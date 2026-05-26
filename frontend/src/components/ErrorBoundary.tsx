import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null; resetKey: number };

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Pick<State, "hasError" | "error"> {
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
    if (window.location.pathname.startsWith("/forms/")) {
      void this.clearPublicFormCaches().finally(() => window.location.reload());
      return;
    }
    window.location.reload();
  };

  private clearPublicFormCaches = async () => {
    if (!("serviceWorker" in navigator)) return;
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) {
        const cacheNames = await window.caches.keys();
        await Promise.all(
          cacheNames
            .filter((name) => name.startsWith("assonam-") || name.includes("workbox"))
            .map((name) => window.caches.delete(name)),
        );
      }
    } catch {
      // The retry still reloads the page even if cache cleanup is unavailable.
    }
  };

  private handleSoftReset = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      resetKey: prev.resetKey + 1,
    }));
  };

  private handleGoHome = () => {
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    this.handleSoftReset();
  };

  render() {
    if (!this.state.hasError) {
      return <div key={this.state.resetKey}>{this.props.children}</div>;
    }

    const isPublicFormRoute = window.location.pathname.startsWith("/forms/");

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
            {!isPublicFormRoute && (
              <button
                type="button"
                className="btn-primary"
                onClick={this.handleGoHome}
              >
                Torna alla home
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
