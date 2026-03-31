import { Router } from 'express';
import multer from 'multer';
import fetch from 'node-fetch';
import xlsx from 'xlsx';
import { getOpenAiApiKey } from '../lib/chat-config.js';
import { CHAT_SYSTEM_PROMPT } from '../lib/chat-system-prompt.js';
import { parseAssistantAction } from '../lib/chat-parse.js';
import { executeChatOp } from '../lib/chat-execute.js';
import logger from '../lib/logger.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

function getChatContext(req) {
  try {
    const raw = req.body?.chatContext;
    if (typeof raw === 'string') {
      const o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : {};
    }
    if (raw && typeof raw === 'object') return raw;
  } catch {
    return {};
  }
  return {};
}

function isImageType(type) {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(String(type || '').toLowerCase());
}

function isFinishedProductBatchIntent(text) {
  const t = String(text || '');
  return /완제품/.test(t) && /(일괄|배치)/.test(t) && /(등록|업로드|추가)/.test(t);
}

function normalizeRow(obj) {
  const get = (...keys) => {
    for (const k of keys) {
      if (obj[k] != null && String(obj[k]).trim() !== '') return String(obj[k]).trim();
    }
    return '';
  };
  return {
    code: get('code', '코드', '완제품코드', '완제품 코드'),
    affiliateName: get('affiliateName', 'affiliate_name', '납품사연계업체', '납품사 연계 업체', '연계업체', '연계 업체'),
    carCompany: get('carCompany', 'car_company', '완성차회사', '완성차 회사'),
    vehicleCode: get('vehicleCode', 'vehicle_code', '차량코드', '차량 코드'),
    vehicleName: get('vehicleName', 'vehicle_name', '차량이름', '차량 이름'),
    partCode: get('partCode', 'part_code', '부위코드', '부위 코드'),
    partName: get('partName', 'part_name', '부위이름', '부위 이름'),
    colorCode: get('colorCode', 'color_code', '색상코드', '색상 코드'),
    colorName: get('colorName', 'color_name', '색상이름', '색상 이름'),
    thickness: get('thickness', '두께'),
    width: get('width', '폭'),
    twoWidth: get('twoWidth', 'two_width', '두폭'),
    length: get('length', '길이'),
    ratio: get('ratio', '배율'),
  };
}

function parseTextCsvRows(text) {
  const src = String(text || '').trim();
  if (!src) return [];
  const lines = src.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map((v) => v.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((v) => v.trim());
    const row = {};
    header.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return normalizeRow(row);
  });
}

function parseUploadedFinishedProductItems(file) {
  const name = String(file?.originalname || '').toLowerCase();
  const mime = String(file?.mimetype || '').toLowerCase();
  if (mime.includes('sheet') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = xlsx.read(file.buffer, { type: 'buffer' });
    const first = wb.SheetNames[0];
    if (!first) return [];
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[first], { defval: '' });
    return rows.map((r) => normalizeRow(r));
  }
  const text = Buffer.from(file.buffer).toString('utf-8');
  return parseTextCsvRows(text);
}

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const apiKey = await getOpenAiApiKey();
    if (!apiKey) {
      return res.json({
        content:
          'ChatGPT 연동이 설정되지 않았습니다. 서버 환경에 OPENAI_API_KEY를 직접 두거나, AWS Secrets Manager 시크릿 ID를 OPENAI_SECRET_ID로 지정해 주세요. (Secrets Manager 사용 시 해당 리전의 AWS 자격 증명과 secretsmanager:GetSecretValue 권한이 필요합니다. 시크릿 값은 평문 API 키이거나 JSON의 OPENAI_API_KEY 필드일 수 있습니다.)',
        action: null,
        executed: null,
      });
    }

    let messages = [];
    if (req.is('multipart/form-data')) {
      const raw = req.body?.messages;
      if (!raw) return res.status(400).json({ error: 'messages가 필요합니다.' });
      try {
        messages = JSON.parse(raw);
      } catch {
        return res.status(400).json({ error: 'messages 형식이 올바르지 않습니다.' });
      }
    } else {
      messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages 배열이 필요합니다.' });
    }

    const chatContext = getChatContext(req);
    const updatedBy =
      chatContext.updatedBy != null && String(chatContext.updatedBy).trim() !== ''
        ? String(chatContext.updatedBy).trim()
        : '';

    const file = req.file || null;
    if (file) {
      const last = messages[messages.length - 1];
      const userText = String(last?.content ?? '');
      if (!isImageType(file.mimetype) && isFinishedProductBatchIntent(userText)) {
        const items = parseUploadedFinishedProductItems(file).filter(
          (r) =>
            r.code ||
            r.affiliateName ||
            r.carCompany ||
            r.vehicleCode ||
            r.partCode ||
            r.colorCode ||
            r.thickness ||
            r.width ||
            r.twoWidth ||
            r.length ||
            r.ratio
        );
        if (items.length === 0) {
          return res.json({
            content: '파일에서 등록할 행을 찾지 못했습니다. 헤더 포함 CSV/XLSX 형식인지 확인해 주세요.',
            action: { type: 'navigate', path: '/delivery/product' },
            executed: { ok: false, error: '빈 파일 또는 파싱 실패' },
          });
        }
        const executed = await executeChatOp('batch_create_finished_products', { updatedBy, params: { items } });
        const content = executed.ok
          ? `${file.originalname} 파일 기준으로 일괄 등록을 처리했습니다.\n\n${executed.message}`
          : `일괄 등록에 실패했습니다: ${executed.error}`;
        return res.json({
          content,
          action: executed.ok ? { type: 'navigate', path: '/delivery/product' } : null,
          executed,
        });
      }
      if (isImageType(file.mimetype)) {
        const base64 = Buffer.from(file.buffer).toString('base64');
        const dataUrl = `data:${file.mimetype};base64,${base64}`;
        last.content = [
          { type: 'text', text: userText || '이 이미지를 참고해 주세요.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ];
      } else {
        last.content = userText ? `${userText} (첨부: ${file.originalname})` : `(파일 첨부: ${file.originalname})`;
      }
    }

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: CHAT_SYSTEM_PROMPT },
          ...messages.map((m) => ({ role: m.role || 'user', content: m.content })),
        ],
        max_tokens: 1200,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error('chat: OpenAI request failed', { status: response.status, errText });
      return res.json({
        content: `ChatGPT 요청 실패 (${response.status}). 잠시 후 다시 시도해 주세요.`,
        action: null,
        executed: null,
      });
    }

    const data = await response.json();
    const rawContent = data?.choices?.[0]?.message?.content?.trim() || '응답을 생성하지 못했습니다.';
    const parsed = parseAssistantAction(rawContent);
    let { action, cleanContent } = parsed;
    let executed = null;

    if (action?.type === 'execute') {
      executed = await executeChatOp(action.op, { updatedBy, params: action.params || {} });
      const suffix = executed.ok ? `\n\n${executed.message}` : `\n\n처리하지 못했습니다: ${executed.error}`;
      cleanContent = `${cleanContent}${suffix}`;
      if (executed.ok && action.op === 'purge_delivery_requests') {
        action = { type: 'navigate', path: '/delivery/inbound' };
      } else if (executed.ok && action.op === 'batch_create_finished_products') {
        action = { type: 'navigate', path: '/delivery/product' };
      } else if (executed.ok && action.op === 'purge_finished_products') {
        action = { type: 'navigate', path: '/delivery/product' };
      } else {
        action = null;
      }
    }

    return res.json({ content: cleanContent, action, executed });
  } catch (err) {
    logger.error('chat: unexpected error', { error: err.message });
    return res.status(500).json({
      content: '채팅 처리 중 오류가 발생했습니다.',
      action: null,
      executed: null,
    });
  }
});

export default router;

