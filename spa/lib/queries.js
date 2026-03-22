// Shared React Query hooks — centralized data fetching and mutation patterns.
// All screens should use these instead of calling sG() or fetch() directly.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sG } from "./storage";
import { SK } from "./constants";
import { queryKeys } from "./queryKeys";

// ── Helper: fetch with JSON error handling ──
async function jsonFetch(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Queries ──
export function useUsers()       { return useQuery({ queryKey: queryKeys.users, queryFn: () => sG(SK.USERS) }); }
export function useOrgs()        { return useQuery({ queryKey: queryKeys.orgs, queryFn: () => sG(SK.ORGS) }); }
export function useSubmissions() { return useQuery({ queryKey: queryKeys.submissions, queryFn: () => sG(SK.SUBS) }); }
export function useDisputes()    { return useQuery({ queryKey: queryKeys.disputes, queryFn: () => sG(SK.DISPUTES) }); }
export function useStories()     { return useQuery({ queryKey: queryKeys.stories, queryFn: () => sG(SK.STORIES) }); }
export function useVault()       { return useQuery({ queryKey: queryKeys.vault, queryFn: () => sG(SK.VAULT) }); }
export function useDrafts()      { return useQuery({ queryKey: queryKeys.drafts, queryFn: () => jsonFetch("/api/drafts") }); }
export function useDiRequests()  { return useQuery({ queryKey: queryKeys.diRequests, queryFn: () => jsonFetch("/api/di-requests") }); }

// ── Mutation factory ──
// Creates a useMutation hook that invalidates the specified query keys on success.
export function useInvalidatingMutation(mutationFn, invalidateKeys) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const key of invalidateKeys) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

// ── Common mutations ──

export function useSubmitVote() {
  return useInvalidatingMutation(
    ({ subId, body }) => jsonFetch(`/api/submissions/${subId}/vote`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    [queryKeys.submissions, queryKeys.users, queryKeys.jury, queryKeys.reviewQueue],
  );
}

export function useAcceptJury() {
  return useInvalidatingMutation(
    ({ assignmentId }) => jsonFetch(`/api/jury/${assignmentId}/accept`, { method: "POST" }),
    [queryKeys.submissions, queryKeys.jury, queryKeys.reviewQueue],
  );
}

export function useCreateSubmission() {
  return useInvalidatingMutation(
    (body) => jsonFetch("/api/submissions", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    [queryKeys.submissions, queryKeys.users, queryKeys.drafts],
  );
}

export function useDeleteSubmission() {
  return useInvalidatingMutation(
    (id) => jsonFetch(`/api/submissions/${id}`, { method: "DELETE" }),
    [queryKeys.submissions],
  );
}

export function useEditSubmission() {
  return useInvalidatingMutation(
    ({ id, body }) => jsonFetch(`/api/submissions/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    [queryKeys.submissions],
  );
}

export function useCreateConcession() {
  return useInvalidatingMutation(
    (body) => jsonFetch("/api/concessions", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    [queryKeys.submissions, queryKeys.disputes],
  );
}

export function useVoteDispute() {
  return useInvalidatingMutation(
    ({ disputeId, body }) => jsonFetch(`/api/disputes/${disputeId}/vote`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    [queryKeys.disputes, queryKeys.submissions, queryKeys.users],
  );
}

export function useCreateOrg() {
  return useInvalidatingMutation(
    (body) => jsonFetch("/api/orgs", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    [queryKeys.orgs, queryKeys.users],
  );
}

export function useJoinOrg() {
  return useInvalidatingMutation(
    (orgId) => jsonFetch(`/api/orgs/${orgId}/join`, { method: "POST" }),
    [queryKeys.orgs, queryKeys.users],
  );
}

export function useLeaveOrg() {
  return useInvalidatingMutation(
    (orgId) => jsonFetch(`/api/orgs/${orgId}/leave`, { method: "POST" }),
    [queryKeys.orgs, queryKeys.users],
  );
}

export function useCreateVaultEntry() {
  return useInvalidatingMutation(
    (body) => jsonFetch("/api/vault", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    [queryKeys.vault],
  );
}

export function useCreateStory() {
  return useInvalidatingMutation(
    (body) => jsonFetch("/api/stories", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    [queryKeys.stories],
  );
}

export function useCreateDraft() {
  return useInvalidatingMutation(
    (body) => jsonFetch("/api/drafts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    [queryKeys.drafts],
  );
}

export function useDeleteDraft() {
  return useInvalidatingMutation(
    (id) => jsonFetch(`/api/drafts/${id}`, { method: "DELETE" }),
    [queryKeys.drafts],
  );
}

export function useMarkNotificationsRead() {
  return useInvalidatingMutation(
    (ids) => jsonFetch("/api/users/me/notifications", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
    }),
    [queryKeys.notifications, queryKeys.users],
  );
}

export function useUpdateProfile() {
  return useInvalidatingMutation(
    ({ username, body }) => jsonFetch(`/api/users/${username}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    [queryKeys.users],
  );
}

export function useSubmitApplication() {
  return useInvalidatingMutation(
    ({ orgId, body }) => jsonFetch(`/api/orgs/${orgId}/applications`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    [queryKeys.applications, queryKeys.orgs],
  );
}

export function useReviewApplication() {
  return useInvalidatingMutation(
    ({ orgId, appId, body }) => jsonFetch(`/api/orgs/${orgId}/applications/${appId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    [queryKeys.applications, queryKeys.orgs, queryKeys.users],
  );
}

export function useDiReview() {
  return useInvalidatingMutation(
    ({ subId, body }) => jsonFetch(`/api/submissions/${subId}/di-review`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    [queryKeys.submissions, queryKeys.users, queryKeys.diRequests],
  );
}

export function useRespondDiRequest() {
  return useInvalidatingMutation(
    ({ reqId, body }) => jsonFetch(`/api/di-requests/${reqId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    [queryKeys.diRequests, queryKeys.users],
  );
}

export function useTagStory() {
  return useInvalidatingMutation(
    ({ storyId, body, method = "POST" }) => jsonFetch(`/api/stories/${storyId}/tag`, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    [queryKeys.stories],
  );
}

export function useAdminApprovePending() {
  return useInvalidatingMutation(
    () => jsonFetch("/api/admin/approve-pending", { method: "POST" }),
    [queryKeys.submissions, queryKeys.users],
  );
}
