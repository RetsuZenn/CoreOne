<?php
require_once __DIR__ . '/../_bootstrap.php';

require_admin_user_id();

$stmt = db()->prepare(
    'SELECT
        t.id,
        t.title,
        t.description,
        t.due_date,
        t.due_time,
        t.priority,
        t.completed,
        t.created_at,
        u.username,
        u.email
     FROM todos t
     INNER JOIN users u ON u.id = t.user_id
     ORDER BY t.created_at DESC, t.id DESC'
);

if (!$stmt) {
    respond_json(false, ['message' => 'Database query failed.'], 500);
}

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
        'completed' => !empty($row['completed']),
        'createdAt' => date('c', strtotime((string) $row['created_at'])),
        'username' => (string) $row['username'],
        'email' => (string) $row['email'],
    ];
}

$stmt->close();

respond_json(true, ['todos' => $items]);
