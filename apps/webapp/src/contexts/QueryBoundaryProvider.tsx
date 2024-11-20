import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { ReactNode, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";

export default function QueryBoundaryProvider({ children }: { children: ReactNode }) {

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          fallbackRender={({ error, resetErrorBoundary }) => (
            <div>
              There was an error!{' '}
              <button onClick={() => resetErrorBoundary()}>Try again</button>
              <pre style={{ whiteSpace: 'normal' }}>{error.message}</pre>
            </div>
          )}
          onReset={reset}
        >
          <Suspense fallback={<h1>Loading...</h1>}>
            {children}
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  )
}