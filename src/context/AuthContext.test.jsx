import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

function TestConsumer() {
  const { user, isAuthenticated, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="user">{user?.loginId ?? 'none'}</span>
      <button type="button" onClick={() => login('u1', 'p1')}>Login</button>
      <button type="button" onClick={logout}>Logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('provides unauthenticated state initially', () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  it('login calls fetch and updates state on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 't1', user: { loginId: 'u1', name: 'User' } }),
    });
    globalThis.fetch = mockFetch;
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    const loginButton = screen.getByText('Login');
    await act(async () => {
      loginButton.click();
    });
    await waitFor(
      () => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        expect(screen.getByTestId('user')).toHaveTextContent('u1');
      },
      { timeout: 2000 }
    );
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/member/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ loginId: 'u1', password: 'p1' }),
      })
    );
  });
});
