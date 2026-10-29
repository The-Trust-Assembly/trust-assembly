import AsyncStorage from '@react-native-async-storage/async-storage';
import { OWN_PENDING_SUBMISSIONS_KEY } from '../utils/constants';
import { correctionCacheKey } from '../utils/urlUtils';
import type {
  Affirmation,
  Assembly,
  Correction,
  CorrectionsResponse,
  SubmissionResult,
  TAUserSummary,
} from '../types/trustAssembly';

const PENDING_TTL = 30 * 24 * 60 * 60 * 1000;
const MAX_PENDING = 100;
const TERMINAL_STATUSES = new Set(['approved', 'consensus', 'rejected', 'consensus_rejected']);

export interface OwnPendingSubmission extends Omit<Correction, 'status'> {
  url: string;
  status: Correction['status'];
  cachedAt: number;
  isOwnSubmission: true;
}

interface SubmissionPayload {
  submissionType: 'correction' | 'affirmation';
  url: string;
  originalHeadline: string;
  replacement?: string | null;
  reasoning: string;
  author?: string | null;
  orgId?: string;
  orgIds?: string[];
  evidence?: Array<{ url: string; explanation: string }>;
  inlineEdits?: Array<{ original: string; replacement: string; reasoning?: string | null }>;
}

async function readPending(): Promise<OwnPendingSubmission[]> {
  try {
    const raw = await AsyncStorage.getItem(OWN_PENDING_SUBMISSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((item): item is OwnPendingSubmission => (
      item && typeof item.id === 'string' && typeof item.url === 'string' &&
      now - Number(item.cachedAt || 0) < PENDING_TTL
    ));
  } catch {
    return [];
  }
}

async function writePending(entries: OwnPendingSubmission[]): Promise<void> {
  await AsyncStorage.setItem(
    OWN_PENDING_SUBMISSIONS_KEY,
    JSON.stringify(entries.slice(-MAX_PENDING)),
  );
}

export async function cacheOwnSubmissionPreviews(
  payload: SubmissionPayload,
  result: SubmissionResult,
  assemblies: { joined: Assembly[]; followed: Assembly[] },
  user: TAUserSummary | null,
): Promise<void> {
  const created = result.submissions || (result.id ? [{ id: result.id }] : []);
  if (created.length === 0) return;
  const orgIds = payload.orgIds?.length ? payload.orgIds : payload.orgId ? [payload.orgId] : [];
  const orgList = [...assemblies.joined, ...assemblies.followed];
  const newIds = new Set(created.map((item) => item.id));
  const entries = (await readPending()).filter((item) => !newIds.has(item.id));
  const now = Date.now();

  created.forEach((item, index) => {
    const status = (item.status || 'pending_review') as Correction['status'];
    if (TERMINAL_STATUSES.has(status)) return;
    const orgId = orgIds[index] || orgIds[0] || '';
    const org = orgList.find((candidate) => candidate.id === orgId);
    entries.push({
      id: item.id,
      url: payload.url,
      submissionType: payload.submissionType,
      originalHeadline: payload.originalHeadline,
      replacement: payload.replacement || '',
      reasoning: payload.reasoning,
      author: payload.author || '',
      evidence: payload.evidence || [],
      inlineEdits: payload.inlineEdits || [],
      submittedBy: user?.username || 'You',
      orgId,
      orgName: org?.name || 'Your Assembly',
      status,
      trustScore: null,
      profile: { displayName: user?.displayName || user?.username || 'You' },
      isOwnSubmission: true,
      cachedAt: now,
    });
  });

  await writePending(entries);
}

export async function mergeOwnPendingForUrl(
  url: string,
  publicData: CorrectionsResponse,
): Promise<CorrectionsResponse> {
  const entries = await readPending();
  const publicIds = new Set([
    ...publicData.corrections,
    ...publicData.affirmations,
  ].map((item) => item.id));
  const retained = entries.filter((item) => !publicIds.has(item.id));
  if (retained.length !== entries.length) await writePending(retained);

  const key = correctionCacheKey(url);
  const matching = retained.filter((item) => correctionCacheKey(item.url) === key);
  const corrections = matching.filter((item) => item.submissionType !== 'affirmation') as Correction[];
  const affirmations = matching.filter((item) => item.submissionType === 'affirmation') as unknown as Affirmation[];
  return {
    ...publicData,
    corrections: [...publicData.corrections, ...corrections],
    affirmations: [...publicData.affirmations, ...affirmations],
    meta: {
      ...publicData.meta,
      totalReviews: publicData.meta.totalReviews + matching.length,
    },
  };
}

export async function getOwnPendingStorageValue(): Promise<string> {
  return JSON.stringify(await readPending());
}
