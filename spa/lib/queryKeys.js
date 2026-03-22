// Centralized query key definitions for TanStack Query.
// Consistent keys ensure cache invalidation works across screens.
export const queryKeys = {
  users:          ["users"],
  user:       (u) => ["users", u],
  orgs:           ["orgs"],
  org:        (id) => ["orgs", id],
  submissions:    ["submissions"],
  submission: (id) => ["submissions", id],
  disputes:       ["disputes"],
  stories:        ["stories"],
  story:      (id) => ["stories", id],
  vault:          ["vault"],
  drafts:         ["drafts"],
  jury:           ["jury"],
  diRequests:     ["diRequests"],
  notifications:  ["notifications"],
  reviewQueue:    ["reviewQueue"],
  applications:   ["applications"],
};
