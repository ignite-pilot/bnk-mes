import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlaceholderPage from './PlaceholderPage';

describe('PlaceholderPage', () => {
  it('renders given title', () => {
    render(<PlaceholderPage title="원자재 정보" />);
    expect(screen.getByRole('heading', { name: '원자재 정보' })).toBeInTheDocument();
    expect(screen.getByText('이 화면은 준비 중입니다.')).toBeInTheDocument();
  });
});
