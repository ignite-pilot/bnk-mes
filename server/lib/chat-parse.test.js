import { describe, it, expect } from '@jest/globals';
import { parseAssistantAction } from './chat-parse.js';

describe('parseAssistantAction', () => {
  it('navigate JSON을 파싱한다', () => {
    const { action, cleanContent } = parseAssistantAction(
      '{"action":"navigate","path":"/delivery/inbound"} 납품 화면으로 갑니다.'
    );
    expect(action).toEqual({ type: 'navigate', path: '/delivery/inbound' });
    expect(cleanContent).toMatch(/납품/);
  });

  it('execute JSON을 파싱한다', () => {
    const { action } = parseAssistantAction('{"action":"execute","op":"purge_delivery_requests"}');
    expect(action).toEqual({ type: 'execute', op: 'purge_delivery_requests', params: {} });
  });

  it('JSON이 없으면 action null', () => {
    const { action } = parseAssistantAction('안녕하세요');
    expect(action).toBeNull();
  });
});
