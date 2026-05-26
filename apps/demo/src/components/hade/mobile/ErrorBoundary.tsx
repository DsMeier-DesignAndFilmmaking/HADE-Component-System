"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** Component name — included in console.error for fast triage. */
  name: string;
  children: ReactNode;
  /**
   * Called when the user presses "Try again".
   * If omitted the boundary resets its own error state, re-attempting the render.
   * Pass a parent setter (e.g. `() => setOpen(false)`) for sheets so the
   * recovery action safely closes them instead of re-rendering a broken tree.
   */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[HADE ErrorBoundary: ${this.props.name}]`, error, info.componentStack);
  }

  private handleReset = () => {
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      this.setState({ error: null });
    }
  };

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-surface px-5 py-8"
        >
          <p className="text-sm font-medium text-ink/70">Something went wrong</p>
          <button
            type="button"
            onClick={this.handleReset}
            className="h-9 rounded-xl border border-line px-4 text-sm font-medium text-ink/60 transition-colors active:bg-line/20"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
