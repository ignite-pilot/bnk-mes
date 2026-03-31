import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DeliveryRequest from './DeliveryRequest';

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../context/AuthContext';

describe('DeliveryRequest', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { name: '테스트', loginId: 'test@test.com' },
    });
    global.fetch = vi.fn();
  });

  it('부분 납품 등 요청 상태가 아니어도 목록에 수정 버튼이 있다', async () => {
    global.fetch.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/delivery-requests?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            list: [
              {
                id: 1,
                supplier_id: 1,
                request_date: '2025-01-01',
                desired_date: '2025-01-10',
                status: 'partial',
                item_count: 2,
              },
            ],
            total: 1,
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ list: [] }) });
    });
    render(<DeliveryRequest />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^수정$/ })).toBeInTheDocument();
    });
  });

  it('취소된 요청 행에는 수정 버튼이 없다', async () => {
    global.fetch.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/delivery-requests?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            list: [
              {
                id: 2,
                supplier_id: 1,
                request_date: '2025-01-01',
                desired_date: '2025-01-10',
                status: 'cancelled',
                item_count: 1,
              },
            ],
            total: 1,
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ list: [] }) });
    });
    render(<DeliveryRequest />);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^수정$/ })).not.toBeInTheDocument();
    });
  });
});
