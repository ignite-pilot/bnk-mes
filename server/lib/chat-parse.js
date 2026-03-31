/**
 * ChatGPT 응답 텍스트에서 JSON 액션(navigate / execute) 추출
 */
export function parseAssistantAction(text) {
  const raw = String(text || '');
  let clean = raw.replace(/```json\s*|\s*```/g, '').trim();
  const idx = clean.indexOf('{');
  if (idx === -1) {
    return { action: null, cleanContent: raw };
  }
  let depth = 0;
  let end = -1;
  for (let i = idx; i < clean.length; i += 1) {
    const c = clean[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) {
    return { action: null, cleanContent: raw };
  }
  const jsonStr = clean.slice(idx, end + 1);
  let rest = `${clean.slice(0, idx)}${clean.slice(end + 1)}`.replace(/\n\n+/g, '\n').trim();
  try {
    const obj = JSON.parse(jsonStr);
    if (obj.action === 'navigate' && typeof obj.path === 'string' && obj.path.startsWith('/')) {
      return {
        action: { type: 'navigate', path: obj.path },
        cleanContent: rest || '이동합니다.',
      };
    }
    if (obj.action === 'execute' && typeof obj.op === 'string') {
      return {
        action: { type: 'execute', op: obj.op, params: obj.params && typeof obj.params === 'object' ? obj.params : {} },
        cleanContent: rest || '처리했습니다.',
      };
    }
  } catch {
    return { action: null, cleanContent: raw };
  }
  return { action: null, cleanContent: raw };
}
