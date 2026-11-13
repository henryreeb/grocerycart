PRAGMA foreign_keys = ON;

CREATE TABLE households (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  password_hash TEXT,
  preferred_store_id TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  upc TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  brand TEXT,
  size TEXT,
  weight_unit TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE staples (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  default_quantity INTEGER NOT NULL CHECK (default_quantity > 0),
  purchase_frequency INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE weekly_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_week TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitting', 'submitted')),
  estimated_total_cents INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT
);

CREATE TABLE draft_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id INTEGER NOT NULL REFERENCES weekly_drafts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  source TEXT NOT NULL CHECK (source IN ('staple', 'search', 'import')),
  current_price_cents INTEGER,
  previous_price_cents INTEGER,
  weight_price_cents INTEGER,
  weight_unit TEXT,
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  stale INTEGER NOT NULL DEFAULT 0 CHECK (stale IN (0, 1)),
  UNIQUE (draft_id, product_id)
);

CREATE TABLE price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(id),
  store_id TEXT NOT NULL,
  regular_price_cents INTEGER,
  promo_price_cents INTEGER,
  observed_at TEXT NOT NULL,
  UNIQUE (product_id, store_id, observed_at)
);

CREATE TABLE coupon_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_item_id INTEGER NOT NULL REFERENCES draft_items(id) ON DELETE CASCADE,
  coupon_key TEXT,
  label TEXT,
  clipped INTEGER NOT NULL DEFAULT 0,
  exact_eligible INTEGER,
  quantity_satisfied INTEGER,
  cart_discount_cents INTEGER,
  source_url TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE TABLE oauth_tokens (
  provider TEXT PRIMARY KEY,
  encrypted_refresh_token TEXT NOT NULL,
  expires_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE extension_installations (
  id TEXT PRIMARY KEY,
  credential_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT
);

CREATE TABLE extension_pairing_codes (
  code TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);

CREATE TABLE purchase_imports (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE TABLE login_attempts (
  address TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE extension_nonces (
  installation_id TEXT NOT NULL REFERENCES extension_installations(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  used_at TEXT NOT NULL,
  PRIMARY KEY (installation_id, nonce)
);

CREATE TABLE cart_snapshots (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES extension_installations(id),
  payload_json TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE TABLE submission_operations (
  id TEXT PRIMARY KEY,
  draft_id INTEGER NOT NULL UNIQUE REFERENCES weekly_drafts(id),
  snapshot_id TEXT NOT NULL REFERENCES cart_snapshots(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'partial', 'complete', 'failed')),
  result_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
