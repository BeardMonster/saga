import { Component, type ErrorInfo, type ReactNode } from "react";

// Catches a crash while drawing part of the screen and shows a message
// instead of letting the whole page go blank.
export default class RenderGuard extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}]`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="space-y-2 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">
        <p className="font-medium">Something went wrong showing {this.props.label}.</p>
        <p className="break-words text-xs">{this.state.error.message}</p>
        <button type="button" onClick={() => this.setState({ error: null })} className="min-h-11 text-sm font-medium underline">
          Try again
        </button>
      </div>
    );
  }
}
