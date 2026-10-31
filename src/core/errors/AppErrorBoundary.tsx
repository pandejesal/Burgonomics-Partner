import React, { Component, ErrorInfo, ReactNode } from 'react';
import Button from '@/components/ui/Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AppErrorBoundary] Caught error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          role="alert"
          className="flex min-h-[60vh] items-center justify-center p-6 text-center"
        >
          <div className="space-y-4 max-w-md">
            <div className="text-6xl" aria-hidden="true">😔</div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Something went wrong
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              The app ran into an unexpected error and couldn't recover automatically.
            </p>
            <Button onClick={this.handleReload} className="min-h-11 w-full">
              Reload App
            </Button>
            {import.meta.env.DEV && this.state.error && (
              <details className="text-left mt-4 p-3 text-xs bg-zinc-100 dark:bg-zinc-800 rounded">
                <summary className="cursor-pointer text-zinc-500">Error details (dev)</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words">{this.state.error.stack}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}