CREATE TABLE IF NOT EXISTS documents(name TEXT PRIMARY KEY,value TEXT NOT NULL CHECK(json_valid(value)));
CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO metadata VALUES('revision','0'),('initialized','0');
CREATE TABLE IF NOT EXISTS mutations(id TEXT PRIMARY KEY,hash TEXT NOT NULL,revision INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY,date TEXT NOT NULL,name TEXT NOT NULL,action TEXT NOT NULL);
PRAGMA user_version=1;


-- MIO AUTH SCHEMA V1

CREATE TABLE IF NOT EXISTS auth_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT,
    email_verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_identities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_subject TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(provider, provider_subject),
    FOREIGN KEY(user_id)
        REFERENCES auth_users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS restaurants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS restaurant_memberships (
    user_id TEXT NOT NULL,
    restaurant_id TEXT NOT NULL,
    role TEXT NOT NULL
        CHECK(role IN ('owner','manager','host','waiter')),
    created_at TEXT NOT NULL,
    PRIMARY KEY(user_id, restaurant_id),
    FOREIGN KEY(user_id)
        REFERENCES auth_users(id)
        ON DELETE CASCADE,
    FOREIGN KEY(restaurant_id)
        REFERENCES restaurants(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY(user_id)
        REFERENCES auth_users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
    ON auth_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_memberships_restaurant
    ON restaurant_memberships(restaurant_id);

CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    purpose TEXT NOT NULL
        CHECK(purpose IN ('verify_email','reset_password')),
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    FOREIGN KEY(user_id)
        REFERENCES auth_users(id)
        ON DELETE CASCADE
);
