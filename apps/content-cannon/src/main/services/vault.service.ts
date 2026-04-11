import { fetchWithAuth } from './auth.service';
import { loadCredentials } from './credentials.service';
import log from 'electron-log';

function getBaseUrl(accountId?: string): string {
  const creds = loadCredentials(accountId);
  return creds?.taBaseUrl || 'https://trustassembly.org';
}

/**
 * Strip Claude citation tags like <cite index='1-6,17-3'>text</cite>
 */
function stripCitations(text: string | undefined): string | undefined {
  if (!text) return text;
  return text
    .replace(/<cite\s+index=['"][^'"]*['"]>/gi, '')
    .replace(/<\/cite>/gi, '');
}

export interface VaultEntry {
  type: 'vault' | 'argument' | 'belief' | 'translation';
  assertion?: string;
  evidence?: string;
  content?: string;
  original?: string;
  translated?: string;
  translationType?: 'clarity' | 'propaganda' | 'euphemism' | 'satirical';
  submissionId?: string;
}

export interface VaultResult {
  success: boolean;
  entryId?: string;
  error?: string;
  type: string;
}

export async function createVaultEntry(
  entry: VaultEntry,
  orgIds: string | string[],
  accountId?: string,
): Promise<VaultResult> {
  const baseUrl = getBaseUrl(accountId);

  const body: Record<string, any> = {
    type: entry.type,
  };

  if (Array.isArray(orgIds) && orgIds.length > 1) {
    body.orgIds = orgIds;
  } else {
    body.orgId = Array.isArray(orgIds) ? orgIds[0] : orgIds;
  }

  if (entry.type === 'vault') {
    body.assertion = stripCitations(entry.assertion);
    body.evidence = stripCitations(entry.evidence);
  } else if (entry.type === 'argument' || entry.type === 'belief') {
    body.content = stripCitations(entry.content);
  } else if (entry.type === 'translation') {
    body.original = stripCitations(entry.original);
    body.translated = stripCitations(entry.translated);
    body.translationType = entry.translationType;
  }

  if (entry.submissionId) {
    body.submissionId = entry.submissionId;
  }

  try {
    log.info(`Creating vault entry (${entry.type}): ${JSON.stringify(body).substring(0, 200)}`);

    const response = await fetchWithAuth(`${baseUrl}/api/vault`, {
      method: 'POST',
      body: JSON.stringify(body),
    }, accountId);

    const data = await response.json();

    if (!response.ok) {
      log.error(`Vault creation failed:`, data);
      return {
        success: false,
        error: data.error || `Vault creation failed with status ${response.status}`,
        type: entry.type,
      };
    }

    const entryId = data.id || data.entry?.id || data.entries?.[0]?.id;
    log.info(`Vault entry created: ${entryId} (${entry.type})`);

    return {
      success: true,
      entryId,
      type: entry.type,
    };
  } catch (error: any) {
    log.error(`Vault entry error:`, error);
    return {
      success: false,
      error: error.message || 'Unknown vault error',
      type: entry.type,
    };
  }
}
