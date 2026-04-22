<?php
require_once __DIR__ . '/../_bootstrap.php';

$userId = require_user_id();
$input = read_json_body();

$enabled = !empty($input['enabled']) ? 1 : 0;
$sound = !empty($input['sound']) ? 1 : 0;
$reminderBefore = (int) ($input['reminderBefore'] ?? 5);

$stmt = db()->prepare(
    'INSERT INTO user_settings (user_id, reminders_enabled, sound_enabled, reminder_before)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
        reminders_enabled = VALUES(reminders_enabled),
        sound_enabled = VALUES(sound_enabled),
        reminder_before = VALUES(reminder_before)'
);

if (!$stmt) {
    respond_json(false, ['message' => 'Database query failed.'], 500);
}

$stmt->bind_param('iiii', $userId, $enabled, $sound, $reminderBefore);

if (!$stmt->execute()) {
    $stmt->close();
    respond_json(false, ['message' => 'Could not save settings.'], 500);
}

$stmt->close();
respond_json(true, ['message' => 'Settings saved.']);

