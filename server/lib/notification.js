/**
 * ig-notification 연동 (원자재 입고 요청 시 담당자 이메일 발송)
 * - https://ig-notification.ig-pilot.com 사용
 * - SMTP: AWS Secrets Manager "prod/ignite-pilot/smtp-naver" (ig-notification 쪽 설정)
 */
import fetch from 'node-fetch';
import logger from './logger.js';

const NOTIFICATION_URL = process.env.IG_NOTIFICATION_URL || 'https://ig-notification.ig-pilot.com';

/**
 * 입고 관련 이메일 발송 (ig-notification API 호출)
 * @param {string} toEmail - 수신 이메일
 * @param {string} subject - 제목
 * @param {string} body - 본문 (텍스트 또는 HTML)
 * @returns {Promise<boolean>} 발송 성공 여부
 */
export async function sendInboundEmail(toEmail, subject, body) {
  if (!toEmail || !String(toEmail).trim()) {
    logger.warn('notification: skip send, no toEmail');
    return false;
  }
  const url = `${NOTIFICATION_URL}/api/send`;
  const payload = {
    to: String(toEmail).trim(),
    subject: subject || '[BNK-MES] 원자재 입고 알림',
    text: body || '',
    body: body || '', // 일부 API 스펙 호환
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.error('notification: send failed', { status: res.status, url, body: text });
      return false;
    }
    logger.info('notification: email sent', { to: toEmail, subject });
    return true;
  } catch (err) {
    logger.error('notification: send error', { url, error: err.message });
    return false;
  }
}
