-- ISOLATED DRAFT ONLY. Keep request/outcome history immutable.
CREATE TABLE qr_independent_leases (
  request_id TEXT PRIMARY KEY NOT NULL REFERENCES qr_independent_requests(id),
  expires_at INTEGER NOT NULL CHECK(expires_at>=0),
  retry_of TEXT UNIQUE REFERENCES qr_independent_requests(id),
  retry_count INTEGER NOT NULL CHECK(retry_count BETWEEN 0 AND 2)
);
-- Old local reservations have no deadline; grant their original request 30 seconds.
INSERT INTO qr_independent_leases(request_id,expires_at,retry_of,retry_count)
SELECT id,requested_at+30000,NULL,0 FROM qr_independent_requests;
CREATE INDEX qr_independent_expiration ON qr_independent_leases(expires_at);
CREATE TRIGGER qr_independent_lease_no_update BEFORE UPDATE ON qr_independent_leases
BEGIN SELECT RAISE(ABORT,'Independent review history is append only'); END;
CREATE TRIGGER qr_independent_lease_no_delete BEFORE DELETE ON qr_independent_leases
BEGIN SELECT RAISE(ABORT,'Independent review history is append only'); END;
