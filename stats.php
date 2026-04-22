<?php
require_once __DIR__ . '/../_bootstrap.php';

require_admin_user_id();

$db = db();

$stats = [
    'users' => 0,
    'admins' => 0,
    'todos' => 0,
    'completedTodos' => 0,
    'notes' => 0,
];

$queries = [
    'users' => 'SELECT COUNT(*) AS value FROM users',
    'admins' => 'SELECT COUNT(*) AS value FROM users WHERE is_admin = 1',
    'todos' => 'SELECT COUNT(*) AS value FROM todos',
    'completedTodos' => 'SELECT COUNT(*) AS value FROM todos WHERE completed = 1',
    'notes' => 'SELECT COUNT(*) AS value FROM notes',
];

foreach ($queries as $key => $sql) {
    $result = $db->query($sql);
    if ($result && ($row = $result->fetch_assoc())) {
        $stats[$key] = (int) $row['value'];
    }
}

$stats['pendingTodos'] = $stats['todos'] - $stats['completedTodos'];

respond_json(true, ['stats' => $stats]);

