import { Component } from 'react';
import { ShieldAlert } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground select-none">
          <ShieldAlert className="h-12 w-12 text-red-500 mb-3" />
          <h3 className="text-lg font-bold text-foreground mb-1">Something went wrong</h3>
          <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn-primary text-xs h-9 px-4"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
