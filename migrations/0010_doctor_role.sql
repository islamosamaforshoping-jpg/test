BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'doctor', 'assistant', 'student'));

ALTER TABLE system_wipe_requests DROP CONSTRAINT IF EXISTS system_wipe_requests_requester_role_check;
ALTER TABLE system_wipe_requests ADD CONSTRAINT system_wipe_requests_requester_role_check
  CHECK (requester_role IN ('admin', 'doctor', 'assistant'));

UPDATE users
SET role = 'doctor'
WHERE LOWER(username) IN ('rashad', 'elnashar', 'elalfy')
  AND role = 'admin';

COMMIT;
