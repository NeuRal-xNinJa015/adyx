-- Adyx — PostgreSQL Schema Initialization
-- This runs automatically when the container starts for the first time.

-- ============================================================
-- Users Table — No phone numbers, no emails.
-- Identity is certificate-based.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    user_id         VARCHAR(64) PRIMARY KEY,
    display_name    VARCHAR(128) NOT NULL,
    clearance_level VARCHAR(32) DEFAULT 'standard',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active       BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- Devices Table — Each device has its own crypto identity
-- ============================================================
CREATE TABLE IF NOT EXISTS devices (
    device_id           VARCHAR(64) PRIMARY KEY,
    user_id             VARCHAR(64) NOT NULL REFERENCES users(user_id),
    device_name         VARCHAR(128),
    public_key          BYTEA NOT NULL,          -- X25519 public key
    signing_public_key  BYTEA NOT NULL,          -- Ed25519 public key
    certificate         BYTEA,                   -- X.509 certificate (DER)
    device_fingerprint  VARCHAR(128) NOT NULL,
    is_active           BOOLEAN DEFAULT TRUE,
    registered_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_devices_user ON devices(user_id);
CREATE INDEX idx_devices_active ON devices(user_id, is_active);

-- ============================================================
-- Pre-Key Bundles — Signal Protocol key material
-- ============================================================
CREATE TABLE IF NOT EXISTS pre_key_bundles (
    device_id               VARCHAR(64) PRIMARY KEY REFERENCES devices(device_id),
    identity_key            BYTEA NOT NULL,
    signed_pre_key          BYTEA NOT NULL,
    signed_pre_key_signature BYTEA NOT NULL,
    signed_pre_key_id       INTEGER NOT NULL,
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS one_time_pre_keys (
    id          SERIAL PRIMARY KEY,
    device_id   VARCHAR(64) NOT NULL REFERENCES devices(device_id),
    key_data    BYTEA NOT NULL,
    used        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_otp_keys_device ON one_time_pre_keys(device_id, used);

-- ============================================================
-- Audit Log — Immutable, append-only
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    log_id      BIGSERIAL PRIMARY KEY,
    timestamp   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    actor_id    VARCHAR(64),
    action      VARCHAR(64) NOT NULL,
    target_type VARCHAR(32),
    target_id   VARCHAR(64),
    details     JSONB,
    ip_hash     VARCHAR(128)
);

CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);

-- ============================================================
-- Seed data for development
-- ============================================================
INSERT INTO users (user_id, display_name, clearance_level) VALUES
    ('user-alpha', 'Agent Alpha', 'top_secret'),
    ('user-bravo', 'Agent Bravo', 'secret')
ON CONFLICT (user_id) DO NOTHING;
