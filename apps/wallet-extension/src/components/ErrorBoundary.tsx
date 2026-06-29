import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Veilum extension error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="onboarding-screen">
          <h1>Something went wrong</h1>
          <p className="alert-banner alert-banner--error">{this.state.error.message}</p>
          <p className="text-subtle">
            Reload the extension from chrome://extensions and try again.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
