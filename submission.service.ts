import { fetchWithAuth } from './auth.service';
import { loadCredentials } from './credentials.service';
import { ArticleAnalysis } from './claude.service';
import log from 'electron-log';

export interface SubmissionResult {
  success: boolean;
  submissionId?: string;
  status?: string;
  slug?: string;
  error?: string;
  url: string;
  type: 'correction' | 'affirmation';
}

function getBaseUrl(accountId?: string): string {
  const creds = loadCredentials(accountId);
  return creds?.taBaseUrl || 'https://trustassembly.org';
}

/**
 * Strip Claude citation tags like <cite index='1-6,17-3'>text</cite>
 * and keep only the inner text content.
 */
function stripCitations(text: string): string {
  return text
    .replace(/<cite\s+index=['"][^'"]*['"]>/gi, '')
    .replace(/<\/cite>/gi, '');
}

function truncateField(text: string, maxLength: number): string {
  const cleaned = stripCitations(text);
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength - 3) + '...';
}

export async function submitCorrection(
  articleUrl: string,
  analysis: ArticleAnalysis,
  orgIds?: string[],
  accountId?: string,
): Promise<SubmissionResult> {
  const baseUrl = getBaseUrl(accountId);

  const body: Record<string, any> = {
    submissionType: analysis.verdict,
    url: articleUrl,
    originalHeadline: stripCitations(analysis.originalHeadline),
    reasoning: truncateField(analysis.reasoning, 2000),
  };

  if (orgIds && orgIds.length > 1) {
    body.orgIds = orgIds;
  } else if (orgIds && orgIds.length === 1) {
    body.orgId = orgIds[0];
  } else {
    const creds = loadCredentials(accountId);
    if (!creds?.defaultOrgId) {
      throw new Error('No default Assembly configured. Please select one in Settings.');
    }
    body.orgId = creds.defaultOrgId;
  }

  if (analysis.verdict === 'correction' && analysis.replacement) {
    body.replacement = truncateField(analysis.replacement, 300);
  }

  if (analysis.evidence && analysis.evidence.length > 0) {
    body.evidence = analysis.evidence.slice(0, 5).map(e => ({
      description: truncateField(e.description, 500),
      url: e.url || '',
    }));
  }

  if (analysis.inlineEdits && analysis.inlineEdits.length > 0) {
    body.inlineEdits = analysis.inlineEdits.slice(0, 10).map(edit => ({
      originalText: truncateField(edit.originalText, 1000),
      correctedText: truncateField(edit.correctedText, 1000),
      explanation: truncateField(edit.explanation, 500),
    }));
  }

  try {
    log.info(`Submitting ${analysis.verdict} for: ${articleUrl} (account: ${accountId || 'default'})`);

    const response = await fetchWithAuth(`${baseUrl}/api/submissions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }, accountId);

    const data = await response.json();

    if (!response.ok) {
      log.error(`Submission failed for ${articleUrl}:`, data);
      return {
        success: false,
        error: data.error || `Submission failed with status ${response.status}`,
        url: articleUrl,
        type: analysis.verdict as 'correction' | 'affirmation',
      };
    }

    log.info(`Submitted ${analysis.verdict}: ${data.id || data.submission?.id} (${data.status || data.submission?.status})`);

    return {
      success: true,
      submissionId: data.id || data.submission?.id,
      status: data.status || data.submission?.status,
      slug: data.slug || data.submission?.slug,
      url: articleUrl,
      type: analysis.verdict as 'correction' | 'affirmation',
    };
  } catch (error: any) {
    log.error(`Submission error for ${articleUrl}:`, error);
    return {
      success: false,
      error: error.message || 'Unknown submission error',
      url: articleUrl,
      type: analysis.verdict as 'correction' | 'affirmation',
    };
  }
}

export async function submitBatch(
  submissions: Array<{ url: string; analysis: ArticleAnalysis }>,
  delayMs: number = 500,
  onProgress?: (submitted: number, total: number) => void,
  accountId?: string,
): Promise<SubmissionResult[]> {
  const results: SubmissionResult[] = [];

  for (let i = 0; i < submissions.length; i++) {
    const { url, analysis } = submissions[i];
    const result = await submitCorrection(url, analysis, undefined, accountId);
    results.push(result);
    onProgress?.(i + 1, submissions.length);

    if (i < submissions.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
