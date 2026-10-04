BEGIN;

UPDATE users
SET name = CASE LOWER(username)
  WHEN 'rashad' THEN 'د. أحمد رشاد'
  WHEN 'elnashar' THEN 'د. تامر النشار'
  WHEN 'elalfy' THEN 'د. أحمد الألفي'
  WHEN 'donia' THEN 'دنيا'
END
WHERE LOWER(username) IN ('rashad', 'elnashar', 'elalfy', 'donia')
  AND POSITION('?' IN name) > 0;

UPDATE audit_logs AS logs
SET actor_name = users.name
FROM users
WHERE logs.actor_id = users.id
  AND LOWER(users.username) IN ('rashad', 'elnashar', 'elalfy', 'donia')
  AND POSITION('?' IN logs.actor_name) > 0;

UPDATE certificates AS certificates
SET issuer_name = users.name
FROM users
WHERE certificates.issued_by = users.id
  AND LOWER(users.username) IN ('rashad', 'elnashar', 'elalfy', 'donia')
  AND POSITION('?' IN certificates.issuer_name) > 0;

UPDATE notifications AS notifications
SET message = regexp_replace(
  notifications.message,
  'مع الدكتور[[:space:]]+[?]+([[:space:]]+[?]+)*',
  'مع الدكتور ' || users.name,
  'g'
)
FROM users
WHERE users.id = (
    substring(notifications.metadata FROM '"doctor_id"[[:space:]]*:[[:space:]]*([0-9]+)')::INTEGER
  )
  AND LOWER(users.username) IN ('rashad', 'elnashar', 'elalfy', 'donia')
  AND POSITION('?' IN notifications.message) > 0
  AND notifications.message LIKE '%مع الدكتور%';

UPDATE system_wipe_requests AS requests
SET requester_name = users.name
FROM users
WHERE requests.requester_id = users.id
  AND LOWER(users.username) IN ('rashad', 'elnashar', 'elalfy', 'donia')
  AND POSITION('?' IN requests.requester_name) > 0;

UPDATE system_wipe_requests AS requests
SET approver_name = users.name
FROM users
WHERE requests.approver_id = users.id
  AND LOWER(users.username) IN ('rashad', 'elnashar', 'elalfy', 'donia')
  AND POSITION('?' IN requests.approver_name) > 0;

COMMIT;
