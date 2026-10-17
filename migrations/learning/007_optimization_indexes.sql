-- Optimization indexes for SQLite
CREATE INDEX IF NOT EXISTS user_state_updated_at ON user_state(updated_at);
CREATE INDEX IF NOT EXISTS user_added_card ON user_added(card);
