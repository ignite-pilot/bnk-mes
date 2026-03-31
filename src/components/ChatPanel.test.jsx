import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ChatPanel from './ChatPanel';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: '테스트', loginId: 'tester' }, token: 't' }),
}));

const CHAT_STORAGE_KEY = 'bnk-mes-chat-messages';

describe('ChatPanel', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    vi.restoreAllMocks();
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: '테스트 응답', action: null }),
    }));
    localStorage.removeItem(CHAT_STORAGE_KEY);
  });

  it('채팅 열기 버튼을 렌더링한다', () => {
    render(
      <MemoryRouter>
        <ChatPanel />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: '채팅 열기' })).toBeInTheDocument();
  });

  it('메시지 전송 시 사용자/응답 메시지를 표시한다', async () => {
    render(
      <MemoryRouter>
        <ChatPanel />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: '채팅 열기' }));
    fireEvent.change(screen.getByPlaceholderText(/메시지를 입력해주세요/), { target: { value: '원자재 목록 보여줘' } });
    fireEvent.click(screen.getByRole('button', { name: '전송' }));

    await waitFor(() => expect(screen.getByText('원자재 목록 보여줘')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('테스트 응답')).toBeInTheDocument());
  });

  it('응답 action이 navigate면 라우팅을 호출한다', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: '이동합니다.',
        action: { type: 'navigate', path: '/material/info' },
      }),
    }));
    render(
      <MemoryRouter>
        <ChatPanel />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: '채팅 열기' }));
    fireEvent.change(screen.getByPlaceholderText(/메시지를 입력해주세요/), { target: { value: '원자재 정보 가줘' } });
    fireEvent.click(screen.getByRole('button', { name: '전송' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/material/info'));
  });

  it('전송 시 chatContext에 수정자 정보를 포함한다', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(
      <MemoryRouter>
        <ChatPanel />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: '채팅 열기' }));
    fireEvent.change(screen.getByPlaceholderText(/메시지를 입력해주세요/), { target: { value: '안녕' } });
    fireEvent.click(screen.getByRole('button', { name: '전송' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.chatContext).toEqual({ updatedBy: '테스트' });
    });
  });
});

