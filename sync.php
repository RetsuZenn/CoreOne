<?php
require_once __DIR__ . '/../_bootstrap.php';

$userId = require_user_id();
$input = read_json_body();
$items = $input['items'] ?? null;

if (!is_array($items)) {
    respond_json(false, ['message' => 'Invalid todo payload.'], 422);
}

$db = db();
$db->begin_transaction();

try {
    $delete = $db->prepare('DELETE FROM todos WHERE user_id = ?');
    if (!$delete) {
        throw new RuntimeException('Delete statement failed.');
    }
    $delete->bind_param('i', $userId);
    $delete->execute();
    $delete->close();

    $insert = $db->prepare(
        'INSERT INTO todos
            (id, user_id, title, description, due_date, due_time, priority, notification_enabled, notified, completed, created_at, updated_at)
         VALUES
            (?, ?, ?, NULLIF(?, \'\'), NULLIF(?, \'\'), NULLIF(?, \'\'), ?, ?, ?, ?, ?, ?)'
    );

    if (!$insert) {
        throw new RuntimeException('Insert statement failed.');
    }

    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }

        $id = trim((string) ($item['id'] ?? '0'));
        $title = trim((string) ($item['title'] ?? ''));
        if ($id === '0' || $title === '') {
            continue;
        }

        $desc = trim((string) ($item['desc'] ?? ''));
        $date = mysql_date_or_null($item['date'] ?? null) ?: '';
        $time = mysql_time_or_null($item['time'] ?? null) ?: '';
        $priority = in_array(($item['priority'] ?? 'medium'), ['low', 'medium', 'high'], true) ? (string) $item['priority'] : 'medium';
        $notification = !empty($item['notification']) ? 1 : 0;
        $notified = !empty($item['notified']) ? 1 : 0;
        $completed = !empty($item['completed']) ? 1 : 0;
        $createdAt = mysql_datetime_or_null($item['createdAt'] ?? null) ?: date('Y-m-d H:i:s');
        $updatedAt = mysql_datetime_or_null($item['updatedAt'] ?? null) ?: $createdAt;

        $insert->bind_param('sisssssiiiss', $id, $userId, $title, $desc, $date, $time, $priority, $notification, $notified, $completed, $createdAt, $updatedAt);
        $insert->execute();
    }

    $insert->close();
    $db->commit();
} catch (Throwable $e) {
    $db->rollback();
    respond_json(false, ['message' => 'Could not save tasks.'], 500);
}

respond_json(true, ['message' => 'Tasks saved.']);
