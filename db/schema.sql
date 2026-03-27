-- ============================================================
-- TRUST ASSEMBLY v5 — PostgreSQL Schema
-- ============================================================
-- Designed for Vercel Postgres (PostgreSQL 16+)
-- All IDs are UUIDs. All timestamps are timestamptz.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE submission_type AS ENUM ('correction', 'affirmation');

CREATE TYPE submission_status AS ENUM (
  'pending_jury',        -- queued, assembly < 5 members
  'di_pending',          -- awaiting DI partner pre-approval
  'pending_review',      -- jury drawn, awaiting votes
  'approved',            -- in-group jury approved
  'rejected',            -- in-group jury rejected
  'cross_review',        -- promoted to cross-group jury
  'consensus',           -- cross-group approved
  'consensus_rejected',  -- cross-group rejected
  'disputed',            -- under active dispute
  'upheld',              -- dispute upheld (submission invalidated)
  'dismissed'            -- dispute dismissed (submission stands)
);

CREATE TYPE dispute_status AS ENUM (
  'pending_review',
  'upheld',
  'dismissed'
);

CREATE TYPE concession_status AS ENUM (
  'pending_review',
  'approved',
  'rejected'
);

CREATE TYPE vault_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE enrollment_mode AS ENUM ('tribal', 'open', 'sponsor');

CREATE TYPE application_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE translation_type AS ENUM ('clarity', 'propaganda', 'euphemism', 'satirical');

CREATE TYPE di_request_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE jury_role AS ENUM ('in_group', 'cross_group', 'dispute', 'concession');

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(30) UNIQUE NOT NULL CHECK (username = lower(username) AND length(username) >= 3),
  display_name  VARCHAR(100) NOT NULL,
  real_name     VARCHAR(200),
  email         VARCHAR(320) NOT NULL,  -- not unique: DIs may share partner's email
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,

  -- Demographics
  gender        VARCHAR(50) DEFAULT 'Undisclosed',
  age           VARCHAR(20) DEFAULT 'Undisclosed',
  country       VARCHAR(100),
  state         VARCHAR(100),
  political_affiliation VARCHAR(100),
  bio           VARCHAR(500),

  -- Digital Intelligence
  is_di         BOOLEAN NOT NULL DEFAULT FALSE,
  di_partner_id UUID REFERENCES users(id),
  di_approved   BOOLEAN NOT NULL DEFAULT FALSE,

  -- Reputation (denormalized for fast reads, updated by triggers/app logic)
  total_wins      INTEGER NOT NULL DEFAULT 0,
  total_losses    INTEGER NOT NULL DEFAULT 0,
  current_streak  INTEGER NOT NULL DEFAULT 0,
  dispute_wins    INTEGER NOT NULL DEFAULT 0,
  dispute_losses  INTEGER NOT NULL DEFAULT 0,
  deliberate_lies INTEGER NOT NULL DEFAULT 0,
  last_deception_finding TIMESTAMPTZ,

  -- Admin flag
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,

  -- Primary assembly
  primary_org_id UUID,

  -- Profile
  avatar        TEXT,          -- base64 data URL for profile picture (max ~200KB)

  -- Timestamps
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash       TEXT
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_di_partner ON users(di_partner_id) WHERE di_partner_id IS NOT NULL;

-- ============================================================
-- ORGANIZATIONS / ASSEMBLIES
-- ============================================================

CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(200) UNIQUE NOT NULL,
  description     TEXT,
  charter         TEXT,
  is_general_public BOOLEAN NOT NULL DEFAULT FALSE,

  -- Enrollment rules (computed from member count, but stored for reference)
  enrollment_mode enrollment_mode NOT NULL DEFAULT 'tribal',
  sponsors_required INTEGER NOT NULL DEFAULT 0,

  -- Cross-group reputation (denormalized)
  cross_group_deception_findings INTEGER NOT NULL DEFAULT 0,
  cassandra_wins INTEGER NOT NULL DEFAULT 0,

  avatar          TEXT,         -- base64 data URL for assembly picture (square, max ~200KB)
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orgs_name ON organizations(name);

-- Now we can add the FK for users.primary_org_id
ALTER TABLE users ADD CONSTRAINT fk_users_primary_org
  FOREIGN KEY (primary_org_id) REFERENCES organizations(id);

-- ============================================================
-- ORGANIZATION MEMBERS
-- ============================================================

CREATE TABLE organization_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_founder BOOLEAN NOT NULL DEFAULT FALSE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at    TIMESTAMPTZ,

  -- Per-assembly streak tracking
  assembly_streak INTEGER NOT NULL DEFAULT 0,

  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_org ON organization_members(org_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_active ON organization_members(org_id) WHERE is_active = TRUE;

-- Track join/leave history for audit and re-join tracking
CREATE TABLE organization_member_history (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action    VARCHAR(10) NOT NULL CHECK (action IN ('joined', 'left', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_member_history_org ON organization_member_history(org_id);
CREATE INDEX idx_member_history_user ON organization_member_history(user_id);

-- ============================================================
-- MEMBERSHIP APPLICATIONS
-- ============================================================

CREATE TABLE membership_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  reason          TEXT,
  link            TEXT,
  mode            enrollment_mode NOT NULL,
  sponsors_needed INTEGER NOT NULL DEFAULT 0,
  founder_approved BOOLEAN,
  status          application_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE application_sponsors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES membership_applications(id) ON DELETE CASCADE,
  sponsor_id     UUID NOT NULL REFERENCES users(id),
  sponsored_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(application_id, sponsor_id)
);

-- ============================================================
-- SUBMISSIONS (Corrections & Affirmations)
-- ============================================================

CREATE TABLE submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_type   submission_type NOT NULL,
  status            submission_status NOT NULL DEFAULT 'pending_jury',

  -- Content
  url               TEXT NOT NULL,
  normalized_url    TEXT,  -- URL after normalization (strip www, tracking params, etc.)
  original_headline VARCHAR(500) NOT NULL,
  replacement       VARCHAR(500),  -- null for affirmations
  reasoning         TEXT NOT NULL,
  author            VARCHAR(200),
  body_text         TEXT CHECK (length(body_text) <= 100000),  -- article body text captured at submission time for preview

  -- Origin
  submitted_by      UUID NOT NULL REFERENCES users(id),
  org_id            UUID NOT NULL REFERENCES organizations(id),
  trusted_skip      BOOLEAN NOT NULL DEFAULT FALSE,

  -- DI fields
  is_di             BOOLEAN NOT NULL DEFAULT FALSE,
  di_partner_id     UUID REFERENCES users(id),

  -- Jury metadata
  jury_seed         BIGINT,
  jury_seats        INTEGER,
  internal_jury_size INTEGER,

  -- Cross-group jury metadata
  cross_group_jury_size INTEGER,
  cross_group_seed  INTEGER,

  -- Deception finding
  deliberate_lie_finding BOOLEAN NOT NULL DEFAULT FALSE,
  survival_count    INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX idx_submissions_org ON submissions(org_id);
CREATE INDEX idx_submissions_user ON submissions(submitted_by);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_created ON submissions(created_at DESC);
CREATE INDEX idx_submissions_url ON submissions(url);
CREATE INDEX idx_submissions_author ON submissions(author) WHERE author IS NOT NULL;

-- ============================================================
-- SUBMISSION EVIDENCE
-- ============================================================

CREATE TABLE submission_evidence (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  explanation   TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_sub_evidence_sub ON submission_evidence(submission_id);

-- ============================================================
-- SUBMISSION INLINE EDITS
-- ============================================================

CREATE TABLE submission_inline_edits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  replacement_text TEXT NOT NULL,
  reasoning     TEXT,
  approved      BOOLEAN,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- JURY ASSIGNMENTS
-- ============================================================

CREATE TABLE jury_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  dispute_id    UUID,  -- FK added after disputes table
  concession_id UUID,  -- FK added after concessions table
  user_id       UUID NOT NULL REFERENCES users(id),
  role          jury_role NOT NULL,

  -- Pool vs seated
  in_pool       BOOLEAN NOT NULL DEFAULT TRUE,
  accepted      BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_at   TIMESTAMPTZ,

  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(submission_id, dispute_id, concession_id, user_id, role)
);

CREATE INDEX idx_jury_submission ON jury_assignments(submission_id) WHERE submission_id IS NOT NULL;
CREATE INDEX idx_jury_user ON jury_assignments(user_id);

-- ============================================================
-- JURY VOTES
-- ============================================================

CREATE TABLE jury_votes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  dispute_id    UUID,  -- FK added after disputes table
  concession_id UUID,  -- FK added after concessions table
  user_id       UUID NOT NULL REFERENCES users(id),
  role          jury_role NOT NULL,

  approve       BOOLEAN NOT NULL,
  note          TEXT,
  deliberate_lie BOOLEAN NOT NULL DEFAULT FALSE,

  -- Ratings (in-group and cross-group submission votes only)
  newsworthy    SMALLINT CHECK (newsworthy IS NULL OR (newsworthy >= 1 AND newsworthy <= 10)),
  interesting   SMALLINT CHECK (interesting IS NULL OR (interesting >= 1 AND interesting <= 10)),

  voted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(submission_id, dispute_id, concession_id, user_id, role)
);

CREATE INDEX idx_votes_submission ON jury_votes(submission_id) WHERE submission_id IS NOT NULL;
CREATE INDEX idx_votes_user ON jury_votes(user_id);

-- ============================================================
-- DISPUTES
-- ============================================================

CREATE TABLE disputes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id       UUID NOT NULL REFERENCES submissions(id),
  org_id              UUID NOT NULL REFERENCES organizations(id),
  disputed_by         UUID NOT NULL REFERENCES users(id),
  original_submitter  UUID NOT NULL REFERENCES users(id),

  reasoning           TEXT NOT NULL,
  status              dispute_status NOT NULL DEFAULT 'pending_review',
  deliberate_lie_finding BOOLEAN NOT NULL DEFAULT FALSE,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ
);

CREATE INDEX idx_disputes_submission ON disputes(submission_id);
CREATE INDEX idx_disputes_org ON disputes(org_id);

-- Now add FKs for jury tables
ALTER TABLE jury_assignments ADD CONSTRAINT fk_jury_dispute
  FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE;
ALTER TABLE jury_votes ADD CONSTRAINT fk_votes_dispute
  FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE;

-- ============================================================
-- DISPUTE EVIDENCE
-- ============================================================

CREATE TABLE dispute_evidence (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id  UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  explanation TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- CONCESSIONS
-- ============================================================

CREATE TABLE concessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  submission_id UUID NOT NULL REFERENCES submissions(id),
  proposed_by   UUID NOT NULL REFERENCES users(id),

  reasoning     TEXT NOT NULL,
  status        concession_status NOT NULL DEFAULT 'pending_review',
  recovery      NUMERIC(3,2),  -- 0.00 to 1.00
  recovery_at_resolution NUMERIC(3,2),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  rejected_at   TIMESTAMPTZ  -- when the cross-group rejection occurred
);

CREATE INDEX idx_concessions_org ON concessions(org_id);

-- Add FK for jury tables
ALTER TABLE jury_assignments ADD CONSTRAINT fk_jury_concession
  FOREIGN KEY (concession_id) REFERENCES concessions(id) ON DELETE CASCADE;
ALTER TABLE jury_votes ADD CONSTRAINT fk_votes_concession
  FOREIGN KEY (concession_id) REFERENCES concessions(id) ON DELETE CASCADE;

-- ============================================================
-- CROSS-GROUP RESULTS (per org)
-- ============================================================

CREATE TABLE cross_group_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id),
  submission_id     UUID NOT NULL REFERENCES submissions(id),
  outcome           VARCHAR(30) NOT NULL CHECK (outcome IN ('consensus', 'consensus_rejected')),
  jury_size         INTEGER NOT NULL,
  internal_jury_size INTEGER NOT NULL,
  was_lie           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cross_results_org ON cross_group_results(org_id);

-- ============================================================
-- VAULT ENTRIES (Standing Corrections)
-- ============================================================

CREATE TABLE vault_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  submission_id UUID REFERENCES submissions(id),
  submitted_by  UUID NOT NULL REFERENCES users(id),

  assertion     TEXT NOT NULL,
  evidence      TEXT NOT NULL,
  status        vault_status NOT NULL DEFAULT 'pending',
  survival_count INTEGER NOT NULL DEFAULT 0,

  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vault_org ON vault_entries(org_id);

-- ============================================================
-- ARGUMENTS
-- ============================================================

CREATE TABLE arguments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  submission_id UUID REFERENCES submissions(id),
  submitted_by  UUID NOT NULL REFERENCES users(id),

  content       TEXT NOT NULL,
  status        vault_status NOT NULL DEFAULT 'pending',
  survival_count INTEGER NOT NULL DEFAULT 0,

  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- BELIEFS
-- ============================================================

CREATE TABLE beliefs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  submission_id UUID REFERENCES submissions(id),
  submitted_by  UUID NOT NULL REFERENCES users(id),

  content       TEXT NOT NULL,
  status        vault_status NOT NULL DEFAULT 'pending',
  survival_count INTEGER NOT NULL DEFAULT 0,

  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TRANSLATIONS
-- ============================================================

CREATE TABLE translations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id),
  submission_id    UUID REFERENCES submissions(id),
  submitted_by     UUID NOT NULL REFERENCES users(id),

  original_text    TEXT NOT NULL,
  translated_text  TEXT NOT NULL,
  translation_type translation_type NOT NULL,
  status           vault_status NOT NULL DEFAULT 'pending',
  survival_count   INTEGER NOT NULL DEFAULT 0,

  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_translations_org ON translations(org_id);
CREATE INDEX idx_translations_status ON translations(org_id, status);
CREATE INDEX idx_translations_type ON translations(translation_type);

-- ============================================================
-- LINKED VAULT ENTRIES (per submission)
-- ============================================================

CREATE TABLE submission_linked_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  entry_type    VARCHAR(30) NOT NULL CHECK (entry_type IN ('vault', 'argument', 'belief', 'translation')),
  entry_id      UUID NOT NULL,
  label         TEXT,
  detail        TEXT
);

CREATE INDEX idx_linked_entries_sub ON submission_linked_entries(submission_id);

-- ============================================================
-- DIGITAL INTELLIGENCE PARTNERSHIP REQUESTS
-- ============================================================

CREATE TABLE di_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  di_user_id       UUID NOT NULL REFERENCES users(id),
  partner_user_id  UUID NOT NULL REFERENCES users(id),
  status           di_request_status NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- USER RATINGS RECEIVED (denormalized for fast profile lookups)
-- ============================================================

CREATE TABLE user_ratings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  submission_id UUID NOT NULL REFERENCES submissions(id),
  rated_by      UUID NOT NULL REFERENCES users(id),
  newsworthy    SMALLINT NOT NULL CHECK (newsworthy >= 1 AND newsworthy <= 10),
  interesting   SMALLINT NOT NULL CHECK (interesting >= 1 AND interesting <= 10),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_ratings_user ON user_ratings(user_id);

-- ============================================================
-- USER REVIEW HISTORY
-- ============================================================

CREATE TABLE user_review_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  submission_id UUID NOT NULL REFERENCES submissions(id),
  outcome       VARCHAR(30) NOT NULL,
  from_di       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_review_history_user ON user_review_history(user_id);

-- ============================================================
-- USER VINDICATIONS (Cassandra mechanic)
-- ============================================================

CREATE TABLE user_vindications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  submission_id UUID REFERENCES submissions(id),
  dispute_id    UUID REFERENCES disputes(id),
  newsworthy    SMALLINT,
  interesting   SMALLINT,
  rejections    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL,
  user_id     UUID REFERENCES users(id),
  org_id      UUID REFERENCES organizations(id),
  entity_type VARCHAR(50),  -- 'submission', 'dispute', 'user', etc.
  entity_id   UUID,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_audit_user ON audit_log(user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- FEEDBACK (Beta feature requests)
-- ============================================================

CREATE TABLE feedback (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id),
  username             VARCHAR(100) NOT NULL,
  message              TEXT NOT NULL,
  status               VARCHAR(20) DEFAULT NULL,
  admin_reply          TEXT DEFAULT NULL,
  admin_reply_at       TIMESTAMPTZ DEFAULT NULL,
  user_resolution      VARCHAR(20) DEFAULT NULL,
  user_resolution_note TEXT DEFAULT NULL,
  user_resolution_at   TIMESTAMPTZ DEFAULT NULL,
  prompt_suggestion    TEXT CHECK (length(prompt_suggestion) <= 5000),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  message TEXT NOT NULL CHECK (length(message) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_replies_feedback_id ON feedback_replies(feedback_id);

CREATE INDEX idx_feedback_created ON feedback(created_at DESC);

-- ============================================================
-- ORGANIZATION FOLLOWS
-- ============================================================

CREATE TABLE organization_follows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_follows_user ON organization_follows(user_id);
CREATE INDEX idx_org_follows_org ON organization_follows(org_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  entity_type VARCHAR(50),
  entity_id   UUID,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id, created_at DESC) WHERE read = FALSE;

-- ============================================================
-- USER BADGES
-- ============================================================

CREATE TABLE user_badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id   VARCHAR(100) NOT NULL,
  detail     TEXT,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

-- ============================================================
-- KV STORE (legacy — deprecated, retained for migration period)
-- ============================================================

CREATE TABLE IF NOT EXISTS kv_store (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES for KV elimination
-- ============================================================

CREATE INDEX idx_submissions_normalized_url
  ON submissions(normalized_url) WHERE normalized_url IS NOT NULL;
