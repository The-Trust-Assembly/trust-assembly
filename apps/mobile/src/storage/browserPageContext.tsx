import React, { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

export interface BrowserPage {
  url: string;
  title: string;
  authors: string[];
  contentType: string;
}

interface BrowserPageContextValue {
  page: BrowserPage;
  updatePage: (page: BrowserPage) => void;
}

const BrowserPageContext = createContext<BrowserPageContextValue | undefined>(undefined);

export function BrowserPageProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<BrowserPage>({ url: '', title: '', authors: [], contentType: 'article' });
  const updatePage = useCallback((nextPage: BrowserPage) => {
    setPage((current) => (
      current.url === nextPage.url &&
      current.title === nextPage.title &&
      current.contentType === nextPage.contentType &&
      current.authors.join('\u0000') === nextPage.authors.join('\u0000')
        ? current
        : nextPage
    ));
  }, []);
  const value = useMemo(() => ({ page, updatePage }), [page, updatePage]);

  return (
    <BrowserPageContext.Provider value={value}>
      {children}
    </BrowserPageContext.Provider>
  );
}

export function useBrowserPage(): BrowserPageContextValue {
  const context = useContext(BrowserPageContext);
  if (!context) throw new Error('useBrowserPage must be used within BrowserPageProvider');
  return context;
}
