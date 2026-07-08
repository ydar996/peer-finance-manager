<?php
/**
 * Peer Finance Manager mail relay for Bluehost.
 *
 * Upload to your Bluehost public web folder (e.g. public_html/pfm-mail-relay.php).
 * Render calls this over HTTPS; PHP sends via the server's local mail (mail()).
 *
 * 1. Set PFM_RELAY_SECRET below to a long random string.
 * 2. Use the same value as EMAIL_RELAY_SECRET on Render.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

// --- EDIT THIS (long random password, e.g. 32+ characters) ---
const PFM_RELAY_SECRET = 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$provided = $_SERVER['HTTP_X_PFM_RELAY_SECRET'] ?? '';
if (PFM_RELAY_SECRET === 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET' || !hash_equals(PFM_RELAY_SECRET, $provided)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw ?: '', true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON body']);
    exit;
}

$to = trim((string) ($data['to'] ?? ''));
$subject = trim((string) ($data['subject'] ?? ''));
$text = (string) ($data['text'] ?? '');
$html = (string) ($data['html'] ?? '');
$from = trim((string) ($data['from'] ?? ''));
$fromName = trim((string) ($data['fromName'] ?? 'Peer Finance Manager'));

if ($to === '' || $subject === '' || $from === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing to, subject, or from']);
    exit;
}

if (!filter_var($to, FILTER_VALIDATE_EMAIL) || !filter_var($from, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid email address']);
    exit;
}

$fromHeader = sprintf('%s <%s>', encodeHeaderValue($fromName), $from);
$body = buildBody($text, $html);
$headers = buildHeaders($fromHeader, $body['contentType']);

$sent = @mail($to, encodeHeaderValue($subject), $body['message'], $headers);
if (!$sent) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'mail() failed on server']);
    exit;
}

echo json_encode(['ok' => true, 'to' => $to]);

function encodeHeaderValue(string $value): string
{
    $value = str_replace(["\r", "\n"], '', $value);
    return preg_match('/[^\x20-\x7E]/', $value) ? '=?UTF-8?B?' . base64_encode($value) . '?=' : $value;
}

/**
 * @return array{message: string, contentType: string}
 */
function buildBody(string $text, string $html): array
{
    if ($html !== '' && $text !== '') {
        $boundary = 'pfm_' . bin2hex(random_bytes(8));
        $message = "--{$boundary}\r\n";
        $message .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $message .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
        $message .= $text . "\r\n\r\n";
        $message .= "--{$boundary}\r\n";
        $message .= "Content-Type: text/html; charset=UTF-8\r\n";
        $message .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
        $message .= $html . "\r\n\r\n";
        $message .= "--{$boundary}--";
        return [
            'message' => $message,
            'contentType' => "multipart/alternative; boundary=\"{$boundary}\"",
        ];
    }

    if ($html !== '') {
        return ['message' => $html, 'contentType' => 'text/html; charset=UTF-8'];
    }

    return ['message' => $text, 'contentType' => 'text/plain; charset=UTF-8'];
}

function buildHeaders(string $fromHeader, string $contentType): string
{
    $headers = "From: {$fromHeader}\r\n";
    $headers .= "Reply-To: {$fromHeader}\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: {$contentType}\r\n";
    $headers .= "X-Mailer: Peer-Finance-Manager-Relay\r\n";
    return $headers;
}
