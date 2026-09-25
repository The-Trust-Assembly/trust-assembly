/**
 * Trust Assembly Mobile App — Auth Context
 * Manages auth state across the app (port of popup.js currentUser logic)
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  login as apiLogin,
  logout as apiLogout,
  getStoredUser,
  getMe,
  setAuthInvalidatedListener,
} from '../api/trustAssemblyApi';
import type { TAUser, TAUserSummary } from '../types/trustAssembly';

interface AuthContextType {
  user: TAUserSummary | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<TAUserSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for stored session on mount
  const refresh = async () => {
    setIsLoading(true);
    let stored: TAUserSummary | null = null;
    try {
      stored = await getStoredUser();
      if (stored) {
        // Verify session is still valid
        const verified = await getMe();
        if (verified) {
          setUser({
            username: verified.username,
            displayName: verified.displayName || verified.display_name,
            id: verified.id,
          });
        } else {
          // Token expired
          await apiLogout();
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch {
      // A temporary network failure should not destroy an otherwise valid
      // local session. Authenticated requests will invalidate it on a 401.
      setUser(stored);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setAuthInvalidatedListener(() => setUser(null));
    refresh();
    return () => setAuthInvalidatedListener(null);
  }, []);

  const doLogin = async (username: string, password: string): Promise<boolean> => {
    const result = await apiLogin(username, password);
    if (result) {
      setUser({
        username: result.username,
        displayName: result.displayName,
        id: result.id,
      });
      return true;
    }
    return false;
  };

  const doLogout = async () => {
    await apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login: doLogin, logout: doLogout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
