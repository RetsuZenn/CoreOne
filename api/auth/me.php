<?php
require_once __DIR__ . '/../_bootstrap.php';

$userId = require_user_id();
$user = current_user_row($userId);

if (!$user) {
    respond_json(false, ['message' => 'Session expired.'], 401);
}

respond_json(true, ['user' => user_payload($user)]);
