import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MaterialWarehouse from './MaterialWarehouse';

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../context/AuthContext';

vi.mock('../../hooks/useDaumPostcode', () => ({
  useDaumPostcode: vi.fn(() => vi.fn()),
}));

describe('MaterialWarehouse', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { name: '테스트', loginId: 'test@test.com' },
    });
    global.fetch = vi.fn();
  });

  it('제목과 검색 폼을 렌더한다', async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/material-warehouses')) {
        return Promise.resolve({ ok: true, json: async () => ({ list: [], total: 0 }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ list: [] }) });
    });
    render(<MaterialWarehouse />);
    expect(screen.getByRole('heading', { name: /원자재 업체 창고 정보/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/검색/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /검색/ })).toBeInTheDocument();
  });

  it('등록·엑셀 다운로드 버튼을 보여준다', async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/material-warehouses')) {
        return Promise.resolve({ ok: true, json: async () => ({ list: [], total: 0 }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ list: [] }) });
    });
    render(<MaterialWarehouse />);
    expect(screen.getByRole('button', { name: /등록/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /엑셀 다운로드/ })).toBeInTheDocument();
  });

  it('목록 API 호출 후 테이블과 빈 메시지를 보여준다', async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/material-warehouses?')) {
        return Promise.resolve({ ok: true, json: async () => ({ list: [], total: 0 }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ list: [] }) });
    });
    render(<MaterialWarehouse />);
    await screen.findByText(/조회된 창고가 없습니다/);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /원자재 공급 업체/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /창고 이름/ })).toBeInTheDocument();
  });
});
