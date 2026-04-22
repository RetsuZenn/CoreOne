<?php
require_once __DIR__ . '/../_bootstrap.php';

$adminId = require_admin_user_id();
$input = read_json_body();
$userId = (int) ($input['userId'] ?? 0);

if ($userId <= 0) {
    respond_json(false, ['message' => 'Invalid user.'], 422);
}

if ($userId === $adminId) {
    respond_json(false, ['message' => 'You cannot delete your own admin account.'], 422);
}

$stmt = db()->prepare('DELETE FROM users WHERE id = ?');
if (!$stmt) {
    respond_json(false, ['message' => 'Database query failed.'], 500);
}

$stmt->bind_param('i', $userId);
$stmt->execute();
$stmt->close();

respond_json(true, ['message' => 'User deleted.']);
