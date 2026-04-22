<?php
require_once __DIR__ . '/../_bootstrap.php';

$input = read_json_body();
$username = trim((string) ($input['username'] ?? ''));
$email = trim((string) ($input['email'] ?? ''));
$password = (string) ($input['password'] ?? '');

if ($username === '' || $email === '' || $password === '') {
    respond_json(false, ['message' => 'Please fill out all fields.'], 422);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond_json(false, ['message' => 'Please enter a valid email address.'], 422);
}

$check = db()->prepare('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1');
if (!$check) {
    respond_json(false, ['message' => 'Database query failed.'], 500);
}

$check->bind_param('ss', $username, $email);
$check->execute();
$exists = $check->get_result();

if ($exists && $exists->fetch_assoc()) {
    $check->close();
    respond_json(false, ['message' => 'Username or email already exists.'], 409);
}

$check->close();

$hash = password_hash($password, PASSWORD_DEFAULT);
$stmt = db()->prepare('INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, 0)');
if (!$stmt) {
    respond_json(false, ['message' => 'Database query failed.'], 500);
}

$stmt->bind_param('sss', $username, $email, $hash);

if (!$stmt->execute()) {
    $stmt->close();
    respond_json(false, ['message' => 'Could not create account.'], 500);
}

$userId = (int) $stmt->insert_id;
$stmt->close();

$settingsStmt = db()->prepare('INSERT INTO user_settings (user_id, reminders_enabled, sound_enabled, reminder_before) VALUES (?, 1, 1, 5) ON DUPLICATE KEY UPDATE user_id = user_id');
if ($settingsStmt) {
    $settingsStmt->bind_param('i', $userId);
    $settingsStmt->execute();
    $settingsStmt->close();
}

respond_json(true, [
    'message' => 'Account created successfully.',
    'user' => [
        'id' => $userId,
        'username' => $username,
        'email' => $email,
    ]
]);
