<?php
require_once __DIR__ . '/../_bootstrap.php';

require_admin_user_id();

$stmt = db()->prepare(
    'SELECT
        u.id,
        u.username,
        u.email,
        u.is_admin,
        u.created_at,
        COALESCE(tc.todo_count, 0) AS todo_count,
        COALESCE(nc.note_count, 0) AS note_count
     FROM users u
     LEFT JOIN (
        SELECT user_id, COUNT(*) AS todo_count
        FROM todos
        GROUP BY user_id
     ) tc ON tc.user_id = u.id
     LEFT JOIN (
        SELECT user_id, COUNT(*) AS note_count
        FROM notes
        GROUP BY user_id
     ) nc ON nc.user_id = u.id
     ORDER BY u.created_at DESC, u.id DESC'
);

if (!$stmt) {
    respond_json(false, ['message' => 'Database query failed.'], 500);
}

$stmt->execute();
$result = $stmt->get_result();
$users = [];

while ($row = $result ? $result->fetch_assoc() : null) {
    $users[] = [
        'id' => (int) $row['id'],
        'username' => (string) $row['username'],
        'email' => (string) $row['email'],
        'is_admin' => !empty($row['is_admin']),
        'createdAt' => date('c', strtotime((string) $row['created_at'])),
        'todoCount' => (int) $row['todo_count'],
        'noteCount' => (int) $row['note_count'],
    ];
}

$stmt->close();

respond_json(true, ['users' => $users]);

