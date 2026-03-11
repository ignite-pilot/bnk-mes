import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const AuthContext = createContext(null);

const TOKEN_KEY = 'bnk-mes-token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(!!localStorage.getItem(TOKEN_KEY));

  const setToken = useCallback((t) => {
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
      setTokenState(t);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      setTokenState(null);
      setUser(null);
    }
  }, []);

  const fetchMe = useCallback(async () => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/member/me', {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user ?? data);
      } else {
        setToken(null);
      }
    } catch {
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, [setToken]);

  useEffect(() => {
    if (token) fetchMe();
    else setLoading(false);
  }, [token, fetchMe]);

  /** 화면 연동: ig-member 콜백에서 코드로 토큰 조회 후 호출 */
  const setAuthFromCallback = useCallback((newToken, newUser) => {
    setToken(newToken);
    setUser(newUser ?? null);
  }, [setToken]);

  const logout = useCallback(() => {
    setToken(null);
  }, [setToken]);

  const value = {
    user,
    token,
    loading,
    setAuthFromCallback,
    logout,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
