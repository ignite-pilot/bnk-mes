import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

vi.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: vi.fn(),
}));

import { useAuth } from './context/AuthContext';

describe('App', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      isAuthenticated: false,
      loading: false,
      user: null,
      setAuthFromCallback: vi.fn(),
      logout: vi.fn(),
    });
  });

  it('renders layout and home when at / and authenticated', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: { name: 'Test', loginId: 'test' },
      setAuthFromCallback: vi.fn(),
      logout: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /BNK MES - 생산 관리 시스템/ })).toBeInTheDocument();
    expect(screen.getByText(/상단 메뉴에서/)).toBeInTheDocument();
  });

  it('redirects to login when at / and not authenticated', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /로그인/ })).toBeInTheDocument();
  });

  it('renders login page at /login', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /로그인/ })).toBeInTheDocument();
  });
});
