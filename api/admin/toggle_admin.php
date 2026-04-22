<?php
require_once __DIR__ . '/../_bootstrap.php';

$adminId = require_admin_user_id();
$input = read_json_body();
$userId = (int) ($input['userId'] ?? 0);
$isAdmin = !empty($input['isAdmin']) ? 1 : 0;

if ($userId <= 0) {
    respond_json(false, ['message' => 'Invalid user.'], 422);
}

if ($userId === $adminId && $isAdmin === 0) {
    respond_json(false, ['message' => 'You cannot remove your own admin access.'], 422);
}

$stmt = db()->prepare('UPDATE users SET is_admin = ? WHERE id = ?');
if (!$stmt) {
    respond_json(false, ['message' => 'Database query failed.'], 500);
}

$stmt->bind_param('ii', $isAdmin, $userId);
$stmt->execute();
$stmt->close();

respond_json(true, ['message' => 'User role updated.']);
