import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const DEFAULT_SECRET_ID = 'prod/ignite-pilot/chatgpt';

function extractKeyFromSecretString(secretString) {
  if (!secretString || typeof secretString !== 'string') return '';
  const trimmed = secretString.trim();
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      const percusKey = String(parsed['percus-personal-key'] || '').trim();
      if (percusKey) return percusKey;
      const openAiKey = String(parsed.OPENAI_API_KEY || '').trim();
      if (openAiKey) return openAiKey;
    }
  } catch {
    // plain string secret
  }

  return trimmed;
}

export async function getOpenAiApiKey() {
  const envKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (envKey) return envKey;

  const secretId = String(process.env.OPENAI_SECRET_ID || DEFAULT_SECRET_ID).trim();
  const client = new SecretsManagerClient({});
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  const key = extractKeyFromSecretString(response?.SecretString || '');
  if (!key) throw new Error('OPENAI API key not found in Secrets Manager.');
  return key;
}
