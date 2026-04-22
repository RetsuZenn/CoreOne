<?php
require_once __DIR__ . '/../_bootstrap.php';

$userId = require_user_id();

$stmt = db()->prepare(
    'SELECT id, title, description, due_date, due_time, priority, notification_enabled, notified, completed, created_at, updated_at
     FROM todos
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC'
);

if (!$stmt) {
    respond_json(false, ['message' => 'Database query failed.'], 500);
}

$stmt->bind_param('i', $userId);
$stmt->execute();
$result = $stmt->get_result();
$items = [];

while ($row = $result ? $result->fetch_assoc() : null) {
    $items[] = [
        'id' => (int) $row['id'],
        'title' => (string) $row['title'],
        'desc' => (string) ($row['description'] ?? ''),
        'date' => $row['due_date'] ? (string) $row['due_date'] : '',
        'time' => $row['due_time'] ? substr((string) $row['due_time'], 0, 5) : '',
        'priority' => (string) $row['priority'],
        'notification' => (bool) $row['notification_enabled'],
        'notified' => (bool) $row['notified'],
        'completed' => (bool) $row['completed'],
        'createdAt' => date('c', strtotime((string) $row['created_at'])),
        'updatedAt' => date('c', strtotime((string) $row['updated_at'])),
    ];
}

$stmt->close();

respond_json(true, ['items' => $items]);
