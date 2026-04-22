<?php
require_once __DIR__ . '/../_bootstrap.php';

require_admin_user_id();
$input = read_json_body();
$todoId = (int) ($input['todoId'] ?? 0);

if ($todoId <= 0) {
    respond_json(false, ['message' => 'Invalid task.'], 422);
}

$stmt = db()->prepare('DELETE FROM todos WHERE id = ?');
if (!$stmt) {
    respond_json(false, ['message' => 'Database query failed.'], 500);
}

$stmt->bind_param('i', $todoId);
$stmt->execute();
$stmt->close();

respond_json(true, ['message' => 'Task deleted.']);
