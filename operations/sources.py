"""Read-only connectors: GitHub Actions, Jira, Techcare. GET requests to allowlisted hosts only."""
import base64, json, re, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from safety import allowed_url, adf_text, clip, redact

ALLOWED_OWNERS = {'petrushandika', 'astronacci-intl', 'the-aesthetics-skin', 'alphaalliance'}
DENY = re.compile(r'tradegenz', re.I)
FAILED = {'failure', 'startup_failure', 'timed_out'}
LOG_HOST = re.compile(r'(^|\.)(blob\.core\.windows\.net|actions\.githubusercontent\.com)$')
PER_POLL = 5


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def _iso_ago(**kw):
    return (datetime.now(timezone.utc) - timedelta(**kw)).strftime('%Y-%m-%dT%H:%M:%SZ')


class Sources:
    def __init__(self, env):
        self.gh_token = env.get('OFFICE_GITHUB_TOKEN', '')
        self.repos = [r.strip() for r in env.get('OFFICE_REPOS', '').split(',') if r.strip()]
        self.jira_url = env.get('OFFICE_JIRA_URL', '').rstrip('/')
        self.jira_auth = base64.b64encode(('%s:%s' % (env.get('OFFICE_JIRA_EMAIL', ''), env.get('OFFICE_JIRA_TOKEN', ''))).encode()).decode()
        self.jira_ok = bool(self.jira_url and env.get('OFFICE_JIRA_TOKEN'))
        self.jql = env.get('OFFICE_JIRA_JQL') or 'assignee=currentUser() AND resolution=Unresolved AND updated >= -14d ORDER BY updated DESC'
        self.tc_url = env.get('OFFICE_TECHCARE_URL', '').rstrip('/')
        self.tc_header = env.get('OFFICE_TECHCARE_HEADER', 'Authorization')
        self.tc_token = env.get('OFFICE_TECHCARE_TOKEN', '')
        self.tc_assignee = env.get('OFFICE_TECHCARE_ASSIGNEE', 'petrus').lower()
        self.hosts = {'api.github.com'}
        for url in (self.jira_url, self.tc_url):
            if url:
                self.hosts.add(urllib.parse.urlsplit(url).hostname)
        self.state = {}

    # HTTP --------------------------------------------------------------
    def _get(self, url, headers, limit=1_000_000, raw=False):
        if not allowed_url(url, self.hosts):
            raise PermissionError('URL outside allowlist')
        req = urllib.request.Request(url, headers=dict(headers, Accept=headers.get('Accept', 'application/json')))
        with _opener.open(req, timeout=30) as res:
            body = res.read(limit)
        return body if raw else json.loads(body)

    def _gh(self, path):
        return self._get('https://api.github.com' + path, {'Authorization': 'Bearer ' + self.gh_token,
                                                            'X-GitHub-Api-Version': '2022-11-28'})

    def _jira(self, path):
        return self._get(self.jira_url + path, {'Authorization': 'Basic ' + self.jira_auth})

    def _tc(self, path=''):
        return self._get(self.tc_url + path, {self.tc_header: self.tc_token})

    def _mark(self, name, ok, detail):
        self.state[name] = {'name': name, 'status': 'ok' if ok else 'error', 'detail': detail,
                            'checked_at': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}

    def statuses(self):
        return list(self.state.values())

    # discovery ---------------------------------------------------------
    def _repo_allowed(self, full):
        owner = full.split('/')[0].lower()
        return owner in ALLOWED_OWNERS and not DENY.search(full)

    def repositories(self):
        if self.repos != ['*']:
            return [r for r in self.repos if self._repo_allowed(r)]
        cutoff = _iso_ago(days=30)
        data = self._gh('/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100')
        return [r['full_name'] for r in data if not r.get('archived') and (r.get('pushed_at') or '') >= cutoff
                and self._repo_allowed(r['full_name'])]

    # polling -----------------------------------------------------------
    def poll(self):
        items = []
        for name, fn in (('github', self._poll_github), ('jira', self._poll_jira), ('techcare', self._poll_techcare)):
            try:
                found, detail = fn()
                items.extend(found)
                self._mark(name, True, detail)
            except Exception as e:  # connector failure is visible, never fabricated
                code = getattr(e, 'code', None)
                self._mark(name, False, 'Could not read: %s%s.' % (type(e).__name__, ' HTTP %s' % code if code else ''))
        return items

    def _poll_github(self):
        if not self.gh_token:
            raise PermissionError('token missing')
        repos, items, errors = self.repositories(), [], 0
        since = _iso_ago(days=3)
        for repo in repos:
            try:
                runs = self._gh('/repos/%s/actions/runs?per_page=30&created=%%3E%%3D%s' % (repo, since)).get('workflow_runs', [])
            except urllib.error.HTTPError:
                errors += 1
                continue
            latest = {}
            for run in runs:  # newest first: keep the latest run per workflow+branch
                latest.setdefault((run.get('workflow_id'), run.get('head_branch')), run)
            for run in latest.values():
                if run.get('conclusion') in FAILED:
                    items.append({'source': 'github', 'source_key': 'github:%s:run:%s' % (repo, run['id']), 'kind': 'audit',
                                  'title': clip('CI gagal: %s · %s · %s' % (repo, run.get('name') or 'workflow', run.get('head_branch')), 200),
                                  'description': 'Run %s berakhir %s pada branch %s.' % (run['id'], run.get('conclusion'), run.get('head_branch')),
                                  'source_url': run.get('html_url')})
        return items[:PER_POLL * 2], '%d %s watched, %d recent failed %s%s.' % (
            len(repos), 'repository' if len(repos) == 1 else 'repositories', len(items), 'run' if len(items) == 1 else 'runs',
            ', %d could not be read' % errors if errors else '')

    def _poll_jira(self):
        if not self.jira_ok:
            raise PermissionError('not configured')
        q = urllib.parse.urlencode({'jql': self.jql, 'maxResults': 20, 'fields': 'summary,status,issuetype,updated'})
        issues = self._jira('/rest/api/3/search/jql?' + q).get('issues', [])
        items = [{'source': 'jira', 'source_key': 'jira:' + i['key'], 'kind': 'task',
                  'title': clip('%s: %s' % (i['key'], i['fields'].get('summary', '')), 200),
                  'description': 'Jira %s (%s, %s)' % (i['key'], (i['fields'].get('issuetype') or {}).get('name'),
                                                       (i['fields'].get('status') or {}).get('name')),
                  'source_url': '%s/browse/%s' % (self.jira_url, i['key'])} for i in issues]
        return items, '%d open %s assigned to you.' % (len(issues), 'issue' if len(issues) == 1 else 'issues')

    def _poll_techcare(self):
        if not (self.tc_url and self.tc_token):
            raise PermissionError('not configured')
        tickets = self._tc('?page=1&limit=50').get('data', [])
        mine = [t for t in tickets if t.get('status') != 'DONE' and not t.get('resolution')
                and self.tc_assignee in ((t.get('assignee') or {}).get('name') or '').lower()]
        items = [{'source': 'techcare', 'source_key': 'techcare:' + str(t['id']), 'kind': 'task',
                  'title': clip('Techcare: %s' % t.get('title', ''), 200),
                  'description': 'Techcare %s, prioritas %s, status %s' % (t.get('category'), t.get('priority'), t.get('status')),
                  'source_url': None} for t in mine]
        return items, '%d open %s assigned to you.' % (len(mine), 'ticket' if len(mine) == 1 else 'tickets')

    # evidence ----------------------------------------------------------
    def _parts(self, task):
        return task['source_key'].split(':')

    def evidence(self, task):
        src, parts = task['source'], self._parts(task)
        if src == 'github':
            repo, run_id = parts[1], parts[3]
            run = self._gh('/repos/%s/actions/runs/%s' % (repo, run_id))
            jobs = self._gh('/repos/%s/actions/runs/%s/jobs?per_page=30' % (repo, run_id)).get('jobs', [])
            lines = ['Workflow: %s | event %s | branch %s | commit %s | conclusion %s' % (
                run.get('name'), run.get('event'), run.get('head_branch'), (run.get('head_sha') or '')[:10], run.get('conclusion')),
                'Commit message: ' + clip((run.get('head_commit') or {}).get('message', ''), 1500)]
            if not jobs:
                lines.append('Tidak ada job yang dibuat (job tidak pernah dimulai).')
            for j in jobs:
                failed = [s['name'] for s in j.get('steps', []) if s.get('conclusion') == 'failure']
                lines.append('Job %s: %s, runner %s, label %s%s' % (j.get('name'), j.get('conclusion'), j.get('runner_name'),
                             ','.join(j.get('labels', [])), ', step gagal: ' + ', '.join(failed) if failed else ''))
            return [{'label': 'GitHub Actions run %s' % run_id, 'text': '\n'.join(lines)}]
        if src == 'jira':
            f = self._jira('/rest/api/3/issue/%s?fields=summary,status,issuetype,priority,description,labels,components' % parts[1])['fields']
            return [{'label': 'Jira %s' % parts[1], 'text': 'Summary: %s\nType: %s | Status: %s | Priority: %s\nDescription:\n%s' % (
                f.get('summary'), (f.get('issuetype') or {}).get('name'), (f.get('status') or {}).get('name'),
                (f.get('priority') or {}).get('name'), adf_text(f.get('description')))}]
        if src == 'techcare':
            t = self._tc('/' + urllib.parse.quote(parts[1], safe=''))
            return [{'label': 'Techcare ticket', 'text': 'Title: %s\nCategory: %s | Status: %s | Priority: %s | Platform: %s | Jira: %s\nDescription:\n%s' % (
                t.get('title'), t.get('category'), t.get('status'), t.get('priority'), t.get('platform'),
                t.get('jiraIssueKey'), clip(t.get('description'), 6000))}]
        return self._manual_evidence(task)

    def _manual_evidence(self, task):
        out = [{'label': 'Permintaan operator', 'text': clip(task['description'], 6000)}]
        for repo in sorted(set(re.findall(r'\b([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)\b', task['description'] + ' ' + task['title'])))[:3]:
            if not self._repo_allowed(repo):
                continue
            try:
                runs = self._gh('/repos/%s/actions/runs?per_page=5' % repo).get('workflow_runs', [])
                out.append({'label': 'GitHub %s' % repo, 'text': '\n'.join('%s %s %s %s' % (
                    r.get('created_at'), r.get('name'), r.get('head_branch'), r.get('conclusion') or r.get('status')) for r in runs)})
            except urllib.error.HTTPError as e:
                out.append({'label': 'GitHub %s' % repo, 'text': 'Tidak bisa dibaca (HTTP %s).' % e.code})
        return out

    def deep_evidence(self, task):
        src, parts = task['source'], self._parts(task)
        if src == 'github':
            repo, run_id = parts[1], parts[3]
            jobs = self._gh('/repos/%s/actions/runs/%s/jobs?per_page=30' % (repo, run_id)).get('jobs', [])
            out = []
            for j in [j for j in jobs if j.get('conclusion') == 'failure'][:2]:
                out.append({'label': 'Log job %s (bagian akhir)' % j.get('name'), 'text': self._job_log(repo, j['id'])})
            return out or [{'label': 'Log', 'text': 'Tidak ada job gagal dengan log (kemungkinan gagal sebelum job dimulai).'}]
        if src == 'jira':
            comments = self._jira('/rest/api/3/issue/%s/comment?orderBy=-created&maxResults=5' % parts[1]).get('comments', [])
            return [{'label': 'Komentar Jira terbaru', 'text': '\n---\n'.join(
                '%s: %s' % (c.get('created', '')[:10], adf_text(c.get('body'), 1500)) for c in comments) or 'Tidak ada komentar.'}]
        return self.evidence(task)

    def _job_log(self, repo, job_id):
        url = 'https://api.github.com/repos/%s/actions/jobs/%s/logs' % (repo, job_id)
        try:
            self._get(url, {'Authorization': 'Bearer ' + self.gh_token}, raw=True)
            return 'Log tidak tersedia.'
        except urllib.error.HTTPError as e:
            location = e.headers.get('Location', '') if e.code in (301, 302, 307) else ''
        parts = urllib.parse.urlsplit(location)
        if parts.scheme != 'https' or not LOG_HOST.search(parts.hostname or ''):
            return 'Log tidak tersedia.'
        with _opener.open(urllib.request.Request(location), timeout=30) as res:  # signed URL; no credentials sent
            body = res.read(3_000_000).decode('utf-8', 'replace')
        lines = [re.sub(r'^\S+Z ', '', l) for l in body.splitlines()]
        return clip('\n'.join(lines[-80:]), 6000)


def render_evidence(evidence):
    return '\n\n'.join('### %s\n%s' % (e['label'], redact(clip(e['text'], 6000))) for e in evidence)
