<?php
require_once __DIR__ . '/../_bootstrap.php';

$userId = require_user_id();

$stmt = db()->prepare('SELECT reminders_enabled, sound_enabled, reminder_before FROM user_settings WHERE user_id = ? LIMIT 1');
if (!$stmt) {
    respond_json(false, ['message' => 'Database query failed.'], 500);
}

$stmt->bind_param('i', $userId);
$stmt->execute();
$result = $stmt->get_result();
$row = $result ? $result->fetch_assoc() : null;
$stmt->close();

$settings = $row ? [
    'enabled' => (bool) $row['reminders_enabled'],
    'sound' => (bool) $row['sound_enabled'],
    'reminderBefore' => (int) $row['reminder_before'],
] : [
    'enabled' => true,
    'sound' => true,
    'reminderBefore' => 5,
];

respond_json(true, ['settings' => $settings]);
