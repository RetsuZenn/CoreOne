<?php
require_once __DIR__ . '/../_bootstrap.php';

$input = read_json_body();
$identifier = trim((string) ($input['identifier'] ?? ''));
$password = (string) ($input['password'] ?? '');

if ($identifier === '' || $password === '') {
    respond_json(false, ['message' => 'Please enter username/email and password.'], 422);
}

$stmt = db()->prepare('SELECT id, username, email, password_hash, is_admin FROM users WHERE username = ? OR email = ? LIMIT 1');
if (!$stmt) {
    respond_json(false, ['message' => 'Database query failed.'], 500);
}

$stmt->bind_param('ss', $identifier, $identifier);
$stmt->execute();
$result = $stmt->get_result();
$user = $result ? $result->fetch_assoc() : null;
$stmt->close();

if (!$user || !password_verify($password, (string) $user['password_hash'])) {
    respond_json(false, ['message' => 'Invalid credentials.'], 401);
}

session_regenerate_id(true);
$_SESSION['user_id'] = (int) $user['id'];

respond_json(true, ['user' => user_payload($user)]);
