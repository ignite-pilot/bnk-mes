import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SelectDropdown from './SelectDropdown';

describe('SelectDropdown', () => {
  beforeEach(() => {
    vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
    vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('펼치면 document.body 아래에 목록 패널을 렌더한다 (모달 overflow 회피)', async () => {
    render(
      <SelectDropdown
        options={[
          { value: 1, label: '납품사A' },
          { value: 2, label: '납품사B' },
        ]}
        value=""
        onChange={() => {}}
        placeholder="선택"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /선택|▼/i }));

    const items = await screen.findAllByText(/^납품사/);
    expect(items.length).toBeGreaterThanOrEqual(2);
    const inBody = Array.from(document.body.querySelectorAll('*')).some(
      (el) => el.textContent === '납품사A' && document.body.contains(el)
    );
    expect(inBody).toBe(true);
  });
});
