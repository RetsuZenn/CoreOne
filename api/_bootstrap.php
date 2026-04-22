<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

session_start();

const DB_HOST = '127.0.0.1';
const DB_USER = 'root';
const DB_PASS = '';
const DB_NAME = 'coreone_db';

function db(): mysqli
{
    static $connection = null;

    if ($connection instanceof mysqli) {
        return $connection;
    }

    $connection = @new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

    if ($connection->connect_errno) {
        respond_json(false, ['message' => 'Database connection failed. Check MySQL in XAMPP.'], 500);
    }

    $connection->set_charset('utf8mb4');
    return $connection;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function respond_json(bool $success, array $payload = [], int $status = 200): void
{
    http_response_code($status);
    echo json_encode(array_merge(['success' => $success], $payload), JSON_UNESCAPED_UNICODE);
    exit;
}

function require_user_id(): int
{
    if (empty($_SESSION['user_id'])) {
        respond_json(false, ['message' => 'Not authenticated.'], 401);
    }

    return (int) $_SESSION['user_id'];
}

function current_user_row(int $userId): ?array
{
    $stmt = db()->prepare('SELECT id, username, email, is_admin FROM users WHERE id = ? LIMIT 1');
    if (!$stmt) {
        respond_json(false, ['message' => 'Database query failed.'], 500);
    }

    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    return $row ?: null;
}

function user_payload(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'username' => (string) $row['username'],
        'email' => (string) $row['email'],
        'is_admin' => !empty($row['is_admin']),
    ];
}

function require_admin_user_id(): int
{
    $userId = require_user_id();
    $user = current_user_row($userId);

    if (!$user || empty($user['is_admin'])) {
        respond_json(false, ['message' => 'Admin access required.'], 403);
    }

    return $userId;
}

function mysql_datetime_or_null(?string $value): ?string
{
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }

    $timestamp = strtotime($value);
    if ($timestamp === false) {
        return null;
    }

    return date('Y-m-d H:i:s', $timestamp);
}

function mysql_date_or_null(?string $value): ?string
{
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }

    $timestamp = strtotime($value);
    if ($timestamp === false) {
        return null;
    }

    return date('Y-m-d', $timestamp);
}

function mysql_time_or_null(?string $value): ?string
{
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }

    $timestamp = strtotime('2000-01-01 ' . $value);
    if ($timestamp === false) {
        return null;
    }

    return date('H:i:s', $timestamp);
}
