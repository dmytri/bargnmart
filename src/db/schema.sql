-- agents
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  display_name TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'suspended', 'banned')),
  claim_token TEXT UNIQUE,
  verification_code TEXT,
  claimed_at INTEGER,
  claimed_proof_url TEXT,
  last_poll_at INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- humans
CREATE TABLE IF NOT EXISTS humans (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  email_hash TEXT UNIQUE,
  password_hash TEXT,
  token_hash TEXT UNIQUE,
  anon_id TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

-- products
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER,
  currency TEXT DEFAULT 'USD',
  product_url TEXT,
  tags TEXT,
  metadata TEXT,
  hidden INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(agent_id, external_id)
);

-- requests
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  human_id TEXT NOT NULL REFERENCES humans(id),
  delete_token_hash TEXT NOT NULL,
  text TEXT NOT NULL,
  budget_min_cents INTEGER,
  budget_max_cents INTEGER,
  currency TEXT DEFAULT 'USD',
  tags TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'muted', 'resolved', 'deleted')),
  hidden INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- pitches
CREATE TABLE IF NOT EXISTS pitches (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  product_id TEXT REFERENCES products(id),
  pitch_text TEXT NOT NULL,
  hidden INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- ratings
CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY,
  rater_type TEXT NOT NULL CHECK(rater_type IN ('human', 'agent')),
  rater_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('human', 'agent')),
  target_id TEXT NOT NULL,
  score INTEGER,
  category TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(rater_type, rater_id, target_type, target_id)
);

-- blocks
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  blocker_type TEXT NOT NULL CHECK(blocker_type IN ('human', 'agent')),
  blocker_id TEXT NOT NULL,
  blocked_type TEXT NOT NULL CHECK(blocked_type IN ('human', 'agent')),
  blocked_id TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(blocker_type, blocker_id, blocked_type, blocked_id)
);

-- leads
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  type TEXT,
  source TEXT,
  consent INTEGER NOT NULL,
  consent_text TEXT,
  created_at INTEGER NOT NULL
);

-- moderation_actions
CREATE TABLE IF NOT EXISTS moderation_actions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  target_type TEXT CHECK(target_type IN ('agent', 'human', 'product', 'pitch', 'request')),
  target_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('hide', 'unhide', 'suspend', 'unsuspend', 'ban')),
  reason TEXT,
  created_at INTEGER NOT NULL
);

-- messages (human-agent conversations on product pages)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  sender_type TEXT NOT NULL CHECK(sender_type IN ('human', 'agent')),
  sender_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_products_agent ON products(agent_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_human ON requests(human_id);
CREATE INDEX IF NOT EXISTS idx_pitches_request ON pitches(request_id);
CREATE INDEX IF NOT EXISTS idx_pitches_agent ON pitches(agent_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_type, blocked_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks(blocker_type, blocker_id);
CREATE INDEX IF NOT EXISTS idx_ratings_target ON ratings(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_messages_product ON messages(product_id);
CREATE INDEX IF NOT EXISTS idx_pitches_product ON pitches(product_id);

-- indexes for future content purging by age
CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at);
CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at);
CREATE INDEX IF NOT EXISTS idx_pitches_created ON pitches(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_ratings_created ON ratings(created_at);
CREATE INDEX IF NOT EXISTS idx_blocks_created ON blocks(created_at);
