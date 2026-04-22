<?php
require_once __DIR__ . '/../_bootstrap.php';

require_admin_user_id();

$stmt = db()->prepare(
    'SELECT
        n.id,
        n.title,
        n.content,
        n.color,
        n.created_at,
        n.updated_at,
        u.username,
        u.email
     FROM notes n
     INNER JOIN users u ON u.id = n.user_id
     ORDER BY n.created_at DESC, n.id DESC'
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
        'content' => (string) $row['content'],
        'color' => (string) $row['color'],
        'createdAt' => date('c', strtotime((string) $row['created_at'])),
        'updatedAt' => date('c', strtotime((string) $row['updated_at'])),
        'username' => (string) $row['username'],
        'email' => (string) $row['email'],
    ];
}

$stmt->close();

respond_json(true, ['notes' => $items]);

