import React, { useState, useEffect } from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export const ErrorBoundary: React.FC<ErrorBoundaryProps> = ({ children }) => {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true);
      setError(event.error);
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    let errorMessage = 'Something went wrong.';
    try {
      const parsed = JSON.parse(error?.message || '');
      if (parsed.error) {
        errorMessage = `Firestore Error: ${parsed.error} (${parsed.operationType} on ${parsed.path})`;
      }
    } catch {
      errorMessage = error?.message || errorMessage;
    }

    return (
      <div className="min-h-dvh flex items-center justify-center p-4 bg-gray-50 dark:bg-zinc-950">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-xl border border-red-100 dark:border-red-900/30">
          <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">Application Error</h2>
          <p className="text-gray-600 dark:text-zinc-400 mb-6 font-mono text-sm break-words">
            {errorMessage}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors"
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
