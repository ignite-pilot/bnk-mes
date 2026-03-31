import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MaterialSupplier from './MaterialSupplier';

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../context/AuthContext';

describe('MaterialSupplier', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { name: '테스트', loginId: 'test@test.com' },
    });
    global.fetch = vi.fn();
  });

  it('제목과 검색 폼을 렌더한다', async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/material-suppliers')) {
        return Promise.resolve({ ok: true, json: async () => ({ list: [], total: 0 }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ list: [] }) });
    });
    render(<MaterialSupplier />);
    expect(screen.getByRole('heading', { name: /원자재 공급 업체/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/검색/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /검색/ })).toBeInTheDocument();
    expect(screen.queryByText(/기간\(시작\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/기간\(종료\)/)).not.toBeInTheDocument();
  });

  it('등록·엑셀 다운로드 버튼을 보여준다', async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/material-suppliers')) {
        return Promise.resolve({ ok: true, json: async () => ({ list: [], total: 0 }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ list: [] }) });
    });
    render(<MaterialSupplier />);
    expect(screen.getByRole('button', { name: /등록/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /엑셀 다운로드/ })).toBeInTheDocument();
  });

  it('목록 API 호출 후 테이블과 빈 메시지를 보여준다', async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/material-suppliers?')) {
        return Promise.resolve({ ok: true, json: async () => ({ list: [], total: 0 }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ list: [] }) });
    });
    render(<MaterialSupplier />);
    await screen.findByText(/조회된 공급 업체가 없습니다/);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /업체 명/ })).toBeInTheDocument();
  });

  it('등록 폼에서 RAW_MATERIAL_TYPE 기반 제공 원자재 종류 선택을 노출한다', async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/material-suppliers?')) {
        return Promise.resolve({ ok: true, json: async () => ({ list: [], total: 0 }) });
      }
      if (String(url).includes('/delivery-vehicles/codes/RAW_MATERIAL_TYPE')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ list: [{ value: 'FABRIC', name: '원단' }] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ list: [] }) });
    });
    render(<MaterialSupplier />);
    fireEvent.click(screen.getByRole('button', { name: /등록/ }));
    await waitFor(() => {
      expect(screen.getAllByText(/원자재 종류 선택/).length).toBeGreaterThan(0);
    });
  });
});
