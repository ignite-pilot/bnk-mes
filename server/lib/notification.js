/**
 * ig-notification 연동 (원자재 입고 요청 시 담당자 이메일 발송)
 * - API: https://github.com/ignite-pilot/ig-notification
 * - POST /api/v1/email/send (multipart/form-data), SMTP 정보 필수
 * - SMTP: AWS Secrets Manager "prod/ignite-pilot/smtp-naver" 참고 (env로 오버라이드 가능)
 */
import fetch from 'node-fetch';
import FormData from 'form-data';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import logger from './logger.js';

const NOTIFICATION_BASE_URL = process.env.IG_NOTIFICATION_URL || 'https://ig-notification.ig-pilot.com';
const SEND_PATH = '/api/v1/email/send';
const SMTP_SECRET_ID = process.env.IG_NOTIFICATION_SMTP_SECRET_ID || 'prod/ignite-pilot/smtp-naver';
const NOTIFICATION_API_KEY = process.env.IG_NOTIFICATION_API_KEY || '';

/** @type {Promise<{ sender_email: string, smtp_host: string, smtp_port: string, smtp_username: string, smtp_password: string } | null>} */
let smtpConfigPromise = null;

/**
 * SMTP 설정 조회: env 우선, 없으면 AWS Secrets Manager "prod/ignite-pilot/smtp-naver" 사용 (캐시)
 * @returns {Promise<{ sender_email: string, smtp_host: string, smtp_port: string, smtp_username: string, smtp_password: string } | null>}
 */
async function getSmtpConfig() {
  const fromEnv = {
    sender_email: process.env.IG_NOTIFICATION_SENDER_EMAIL || '',
    smtp_host: process.env.IG_NOTIFICATION_SMTP_HOST || '',
    smtp_port: process.env.IG_NOTIFICATION_SMTP_PORT || '',
    smtp_username: process.env.IG_NOTIFICATION_SMTP_USERNAME || '',
    smtp_password: process.env.IG_NOTIFICATION_SMTP_PASSWORD || '',
  };
  if (fromEnv.sender_email && fromEnv.smtp_host && fromEnv.smtp_port) {
    return fromEnv;
  }
  if (!smtpConfigPromise) {
    smtpConfigPromise = fetchSmtpFromSecretsManager();
  }
  const fromSecret = await smtpConfigPromise;
  if (fromSecret) {
    return {
      sender_email: fromEnv.sender_email || fromSecret.sender_email,
      smtp_host: fromEnv.smtp_host || fromSecret.smtp_host,
      smtp_port: fromEnv.smtp_port || fromSecret.smtp_port,
      smtp_username: fromEnv.smtp_username || fromSecret.smtp_username,
      smtp_password: fromEnv.smtp_password || fromSecret.smtp_password,
    };
  }
  return fromEnv.sender_email && fromEnv.smtp_host && fromEnv.smtp_port ? fromEnv : null;
}

/**
 * @returns {Promise<{ sender_email: string, smtp_host: string, smtp_port: string, smtp_username: string, smtp_password: string } | null>}
 */
async function fetchSmtpFromSecretsManager() {
  try {
    const client = new SecretsManagerClient({});
    const res = await client.send(new GetSecretValueCommand({ SecretId: SMTP_SECRET_ID }));
    const raw = res.SecretString;
    if (!raw) return null;
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const keys = Object.keys(data || {});
    const sender_email = data.sender_email ?? data.SENDER_EMAIL ?? data.SENDER ?? data.from ?? data.sender ?? data.email ?? '';
    const smtp_host = data.smtp_host ?? data.SMTP_HOST ?? data.SMTP_SERVER ?? data.host ?? data.HOST ?? '';
    const smtp_port = String(data.smtp_port ?? data.SMTP_PORT ?? data.port ?? data.PORT ?? 587);
    const smtp_username = data.smtp_username ?? data.SMTP_USERNAME ?? data.SMTP_USER ?? data.username ?? data.user ?? '';
    const smtp_password = data.smtp_password ?? data.SMTP_PASSWORD ?? data.APP_PASSWORD ?? data.password ?? '';
    if (!sender_email || !smtp_host || !smtp_port) {
      logger.warn('notification: SMTP secret missing required fields', {
        secretId: SMTP_SECRET_ID,
        secretKeys: keys,
        hint: '필요: sender_email(또는 from), smtp_host(또는 host), smtp_port(또는 port)',
      });
      return null;
    }
    return { sender_email, smtp_host, smtp_port, smtp_username, smtp_password };
  } catch (err) {
    logger.warn('notification: failed to load SMTP from Secrets Manager', { secretId: SMTP_SECRET_ID, error: err.message });
    return null;
  }
}

/**
 * 입고 관련 이메일 발송 (ig-notification API 호출)
 * @param {string} toEmail - 수신 이메일
 * @param {string} subject - 제목
 * @param {string} body - 본문 (텍스트 또는 HTML)
 * @returns {Promise<{ ok: boolean, reason?: string }>} 발송 결과 (ok, 실패 시 reason)
 */
export async function sendInboundEmail(toEmail, subject, body) {
  if (!toEmail || !String(toEmail).trim()) {
    logger.warn('notification: skip send, no toEmail');
    return { ok: false, reason: 'no_to_email' };
  }
  const smtp = await getSmtpConfig();
  if (!smtp || !smtp.sender_email || !smtp.smtp_host || !smtp.smtp_port) {
    logger.warn('notification: skip send, SMTP not configured (env or AWS Secrets Manager "' + SMTP_SECRET_ID + '")');
    return { ok: false, reason: 'smtp_not_configured' };
  }
  const base = NOTIFICATION_BASE_URL.replace(/\/$/, '');
  const url = `${base}${SEND_PATH}`;
  const form = new FormData();
  form.append('recipient_emails', JSON.stringify([String(toEmail).trim()]));
  form.append('sender_email', smtp.sender_email);
  form.append('smtp_host', smtp.smtp_host);
  form.append('smtp_port', String(smtp.smtp_port));
  if (smtp.smtp_username) form.append('smtp_username', smtp.smtp_username);
  if (smtp.smtp_password) form.append('smtp_password', smtp.smtp_password);
  form.append('use_ssl', 'true');
  form.append('verify_ssl', 'true');
  form.append('subject', subject || '[BNK-MES] 원자재 입고 알림');
  form.append('body', body || '');
  const headers = { ...form.getHeaders() };
  if (NOTIFICATION_API_KEY) headers['Authorization'] = `Bearer ${NOTIFICATION_API_KEY}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: form,
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      logger.error('notification: send failed', { status: res.status, url, responseBody: text?.slice(0, 200) });
      return { ok: false, reason: `api_${res.status}`, detail: text?.slice(0, 200) };
    }
    logger.info('notification: email sent', { to: toEmail, subject });
    return { ok: true };
  } catch (err) {
    logger.error('notification: send error', { url, error: err.message });
    return { ok: false, reason: 'network_error', detail: err.message };
  }
}
