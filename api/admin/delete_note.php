<?php
require_once __DIR__ . '/../_bootstrap.php';

require_admin_user_id();
$input = read_json_body();
$noteId = (int) ($input['noteId'] ?? 0);

if ($noteId <= 0) {
    respond_json(false, ['message' => 'Invalid note.'], 422);
}

$stmt = db()->prepare('DELETE FROM notes WHERE id = ?');
if (!$stmt) {
    respond_json(false, ['message' => 'Database query failed.'], 500);
}

$stmt->bind_param('i', $noteId);
$stmt->execute();
$stmt->close();

respond_json(true, ['message' => 'Note deleted.']);
