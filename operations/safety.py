"""Redaction and outbound URL policy. Everything leaving or entering a report passes here."""
import ipaddress, re
from urllib.parse import urlsplit

_PATTERNS = [
    (re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----', re.S), '[REDACTED KEY]'),
    (re.compile(r'\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})'), '[REDACTED]'),
    (re.compile(r'\b(sk|rk|pk)-[A-Za-z0-9_-]{16,}'), '[REDACTED]'),
    (re.compile(r'\bAKIA[0-9A-Z]{16}\b'), '[REDACTED]'),
    (re.compile(r'\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}'), '[REDACTED JWT]'),
    (re.compile(r'(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{6,}'), r'\1 [REDACTED]'),
    (re.compile(r'(?i)\b([A-Za-z0-9_]*(?:token|password|passwd|secret|api[_-]?key|apikey|credential)[A-Za-z0-9_]*)(["\']?\s*[=:]\s*)["\']?[^\s"\',;]+'), r'\1\2[REDACTED]'),
    (re.compile(r'(?i)\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp)://[^\s/@]+@'), r'\1://[REDACTED]@'),
]


def redact(text):
    text = '' if text is None else str(text)
    for pattern, repl in _PATTERNS:
        text = pattern.sub(repl, text)
    return text


def clip(text, limit):
    text = '' if text is None else str(text)
    return text if len(text) <= limit else text[:limit] + '\n[dipotong]'


def allowed_url(url, hosts):
    """HTTPS to an exact allowlisted public hostname only. No credentials, ports, or IP literals."""
    try:
        parts = urlsplit(url)
        host = (parts.hostname or '').lower()
        if parts.scheme != 'https' or parts.username or parts.password or host not in hosts:
            return False
        if parts.port not in (None, 443):
            return False
        try:
            ipaddress.ip_address(host)
            return False
        except ValueError:
            return True
    except ValueError:
        return False


def adf_text(node, limit=6000):
    """Flatten Atlassian Document Format to plain text."""
    out = []

    def walk(n):
        if isinstance(n, dict):
            if n.get('type') == 'text':
                out.append(n.get('text', ''))
            for child in n.get('content', []) or []:
                walk(child)
            if n.get('type') in ('paragraph', 'heading', 'listItem', 'tableRow'):
                out.append('\n')
        elif isinstance(n, list):
            for child in n:
                walk(child)
        elif isinstance(n, str):
            out.append(n)
    walk(node)
    return clip(re.sub(r'\n{3,}', '\n\n', ''.join(out)).strip(), limit)
