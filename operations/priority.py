"""Informational priority from stored connector metadata, never model prose or approval."""
import json
import re

ORDER = {level: rank for rank, level in enumerate(('urgent', 'high', 'untriaged', 'normal', 'low'))}
LEVELS = {'highest': 'urgent', 'critical': 'urgent', 'urgent': 'urgent', 'blocker': 'urgent',
          'high': 'high', 'major': 'high', 'medium': 'normal', 'normal': 'normal',
          'low': 'low', 'lowest': 'low', 'minor': 'low', 'trivial': 'low'}
MARKER = '\n## Bukti read-only yang dikumpulkan\n'


def source_ref(task):
    key = task.get('source_key') or ''
    if task.get('source') != key.split(':')[0]:
        return ''
    if re.fullmatch(r'jira:[A-Z][A-Z0-9_]{0,19}-[0-9]{1,12}', key):
        return key.split(':')[1]
    if re.fullmatch(r'techcare:(?:[0-9]{1,20}|[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12})', key):
        ticket = key.split(':')[1]
        return 'Techcare #' + (ticket[:8] + '…' if '-' in ticket else ticket)
    match = github_parts(key)
    if match:
        return '%s %s #%s' % match
    match = re.fullmatch(r'local:([a-f0-9]{24}):[a-z_-]+:[a-f0-9]{24}', key)
    if match:
        return 'Local project ' + match.group(1)
    return ''


def github_parts(key):
    match = re.fullmatch(r'github:([A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}):(run|issue|dependabot|code-scanning):([0-9]{1,20})', key)
    return match.groups() if match else None


def classify(task):
    key = task.get('source_key') or ''
    ref = source_ref(task)
    text = task.get('report') or ''
    # The worker appends source evidence after analysis. Never inspect analysis or description.
    evidence = ('\n' + text).split(MARKER, 1)[-1] if ('\n' + text).count(MARKER) == 1 else ''
    if task.get('source') != key.split(':')[0]:
        return {'level': 'untriaged', 'basis': 'unknown', 'reason': 'Identitas sumber tidak cocok; perlu triase.'}
    if key.startswith('jira:') and ref:
        pattern = (r'\A### Jira ' + re.escape(ref) + r'\nSummary: [^\n]*\n'
                   r'Type: [^\n|]* \| Status: (?P<status>[^\n|]*) \| Priority: (?P<priority>[^\n|]+)\nDescription:\n')
    elif key.startswith('techcare:') and ref:
        pattern = (r'\A### Techcare ticket\nTitle: [^\n]*\nCategory: [^\n|]* \| Status: (?P<status>[^\n|]*)'
                   r' \| Priority: (?P<priority>[^\n|]+) \| Platform: [^\n|]* \| Jira: [^\n]*\nDescription:\n')
    else:
        pattern = None
    match = re.match(pattern, evidence) if pattern else None
    level = LEVELS.get(match.group('priority').strip().lower()) if match else None
    if level and match:
        status = match.group('status').strip()
        if status.lower() in ('done', 'closed', 'resolved', 'cancelled', 'canceled', 'completed'):
            return {'level': 'untriaged', 'basis': 'source',
                    'reason': 'Prioritas sumber %s; tiket %s, dampak saat ini perlu diverifikasi.' %
                              (match.group('priority').strip(), status)}
        return {'level': level, 'basis': 'source', 'reason': 'Prioritas dari metadata tiket sumber.'}
    parts = github_parts(key)
    if parts:
        repo, kind, number = parts
        if kind in ('dependabot', 'code-scanning'):
            prefix = '### GitHub %s %s #%s\n' % (repo, kind, number)
            if evidence.startswith(prefix):
                raw = re.split(r'\n## ', evidence[len(prefix):], maxsplit=1)[0].strip()
                try:
                    data = json.loads(raw)
                except (ValueError, TypeError):
                    data = {}
                if isinstance(data, dict):
                    fields = (('security_advisory', 'severity'), ('security_vulnerability', 'severity')) if kind == 'dependabot' else (('rule', 'security_severity_level'),)
                    levels = []
                    for parent, field in fields:
                        obj = data.get(parent)
                        severity = obj.get(field) if isinstance(obj, dict) else None
                        if isinstance(severity, str) and severity.lower() in ('critical', 'high', 'medium', 'low'):
                            levels.append(LEVELS[severity.lower()])
                    if levels:
                        return {'level': min(levels, key=lambda value: ORDER[value]), 'basis': 'source',
                                'reason': 'Severity dari metadata alert keamanan sumber.'}
            return {'level': 'high', 'basis': 'inferred', 'reason': 'Saran: alert keamanan; severity sumber belum jelas.'}
        if kind == 'run':
            return {'level': 'normal', 'basis': 'inferred', 'reason': 'Saran: workflow gagal; bukan bukti outage.'}
    if key.startswith('local:') and ref:
        return {'level': 'normal', 'basis': 'inferred', 'reason': 'Saran: temuan audit lokal; bug belum terkonfirmasi.'}
    return {'level': 'untriaged', 'basis': 'unknown', 'reason': 'Belum ada metadata prioritas yang jelas.'}
