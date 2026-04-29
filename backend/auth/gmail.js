import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = join(__dir, '../.gmail-tokens.json');

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback'
  );
}

export function getStoredTokens() {
  if (!existsSync(TOKENS_PATH)) return null;
  try { return JSON.parse(readFileSync(TOKENS_PATH, 'utf8')); }
  catch { return null; }
}

export function storeTokens(tokens) {
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

export async function getAuthorizedClient() {
  const tokens = getStoredTokens();
  if (!tokens) throw new Error('Gmail not connected. Visit /api/auth/google to connect.');
  const client = getOAuthClient();
  client.setCredentials(tokens);
  client.on('tokens', (fresh) => storeTokens({ ...getStoredTokens(), ...fresh }));
  return client;
}
