import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MaterialInfo from './MaterialInfo';

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../context/AuthContext';

describe('MaterialInfo', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { name: '테스트', loginId: 'test@test.com' },
    });
    global.fetch = vi.fn();
  });

  it('제목과 검색 폼을 렌더한다', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ list: [], total: 0 }),
    });
    render(<MaterialInfo />);
    expect(screen.getByRole('heading', { name: /원자재 정보/ })).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText(/검색/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /검색/ })).toBeInTheDocument();
  });

  it('등록·엑셀 다운로드 버튼을 보여준다', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ list: [], total: 0 }),
    });
    render(<MaterialInfo />);
    expect(screen.getByRole('button', { name: /등록/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /엑셀 다운로드/ })).toBeInTheDocument();
  });

  it('목록 API 호출 후 테이블과 빈 메시지를 보여준다', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ list: [], total: 0 }),
    });
    render(<MaterialInfo />);
    await screen.findByText(/조회된 원자재가 없습니다/);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /원자재 종류/ })).toBeInTheDocument();
  });

  it('목록에서 두께·폭·길이는 mm 단위로 표기된다 (20.0000 → 20mm)', async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/types')) {
        return Promise.resolve({ ok: true, json: async () => ({ list: [] }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          list: [
            {
              id: 1,
              kind: '상지',
              name: '판재',
              thickness: 20.0,
              width: 100.0,
              length: 1000.0,
            },
          ],
          total: 1,
        }),
      });
    });
    render(<MaterialInfo />);
    await screen.findByText(/판재/);
    expect(screen.getByText('20mm')).toBeInTheDocument();
    expect(screen.getByText('100mm')).toBeInTheDocument();
    expect(screen.getByText('1000mm')).toBeInTheDocument();
  });

  it('목록 조회가 타임아웃(AbortError)이면 로딩을 해제하고 안내 메시지를 보여준다', async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/types')) {
        return Promise.resolve({ ok: true, json: async () => ({ list: [] }) });
      }
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });
    render(<MaterialInfo />);
    expect(screen.getByText(/조회 중/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/응답이 지연되고 있습니다/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/조회 중/)).not.toBeInTheDocument();
  });
});
