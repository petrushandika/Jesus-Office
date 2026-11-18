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
    def __init__(self, env, store=None):
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
        self.store = store
        self.batch_size = max(1, min(100, int(env.get('OFFICE_GITHUB_BATCH_SIZE', 10))))
        self.inventory_ttl = max(60, int(env.get('OFFICE_GITHUB_INVENTORY_TTL', 3600)))
        self.page_limit = max(1, min(100, int(env.get('OFFICE_GITHUB_PAGE_LIMIT', 3))))
        self.gh_state = store.setting('github:discovery', {}) if store else {}
        self.owners = set(ALLOWED_OWNERS) | set(self.gh_state.get('owners', []))
        self.github_coverage = self.gh_state.get('coverage', {})

    # HTTP --------------------------------------------------------------
    def _get(self, url, headers, limit=1_000_000, raw=False):
        if not allowed_url(url, self.hosts):
            raise PermissionError('URL outside allowlist')
        req = urllib.request.Request(url, headers=dict(headers, Accept=headers.get('Accept', 'application/json')))
        with _opener.open(req, timeout=30) as res:
            body = res.read(limit)
        return body if raw else json.loads(body)

    def _gh(self, path):
        if DENY.search(urllib.parse.unquote(path)):
            raise PermissionError('Excluded GitHub target')
        if not path.startswith('/') or path.startswith('//'):
            raise ValueError('Invalid GitHub API path')
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
    def _save_github(self):
        if self.store:
            self.store.set_setting('github:discovery', self.gh_state)

    def _valid_repo(self, full):
        return bool(re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', full)) and not DENY.search(full)

    def _repo_allowed(self, full):
        if not self._valid_repo(full):
            return False
        inventory = {r['full_name'].lower() for r in self.gh_state.get('inventory', [])}
        return full.split('/')[0].lower() in self.owners or full.lower() in inventory

    def _pages(self, path, key=None, limit=100, start=1):
        rows = []
        for page in range(start, start + limit):
            try:
                data = self._gh(path + ('&' if '?' in path else '?') + 'per_page=100&page=%d' % page)
            except Exception:
                if rows:
                    return rows, True  # preserve readable pages; never claim complete coverage
                raise
            batch = data.get(key, []) if key else data
            if not isinstance(batch, list):
                raise ValueError('Invalid GitHub list response')
            rows.extend(batch)
            if len(batch) < 100:
                return rows, False
        return rows, True

    def repositories(self):
        if self.gh_state.get('inventory_at', 0) + self.inventory_ttl > time.time():
            return [r['full_name'] for r in self.gh_state.get('inventory', [])]
        errors, inventory = [], {}
        def collect(path):
            try:
                rows, partial = self._pages(path)
                if partial:
                    errors.append({'endpoint': path, 'status': 'partial', 'detail': 'pagination cap'})
                return rows
            except Exception as e:
                errors.append({'endpoint': path, 'status': 'not audited', 'http': getattr(e, 'code', None)})
                return []
        if self.repos == ['*']:
            # Membership establishes owner trust; foreign collaborator repos do not.
            try:
                login = self._gh('/user').get('login', '')
                if re.fullmatch(r'[A-Za-z0-9_.-]+', login) and not DENY.search(login):
                    self.owners.add(login.lower())
            except Exception as e:
                errors.append({'endpoint': '/user', 'status': 'not audited', 'http': getattr(e, 'code', None)})
            orgs = collect('/user/orgs')
            for org in orgs:
                login = org.get('login', '')
                if re.fullmatch(r'[A-Za-z0-9_.-]+', login) and not DENY.search(login):
                    self.owners.add(login.lower())
            repos = collect('/user/repos?affiliation=owner,collaborator,organization_member&sort=full_name')
            for org in orgs:
                login = org.get('login', '')
                if login.lower() in self.owners and not DENY.search(login):
                    repos.extend(collect('/orgs/%s/repos?type=all' % login))
            for repo in repos:
                full = repo.get('full_name', '')
                if self._valid_repo(full):
                    inventory[full.lower()] = {'full_name': full, 'archived': bool(repo.get('archived'))}
        else:
            for full in self.repos:
                if not self._repo_allowed(full):
                    continue
                try:
                    repo = self._gh('/repos/' + full)
                    inventory[full.lower()] = {'full_name': full, 'archived': bool(repo.get('archived'))}
                except Exception as e:
                    errors.append({'endpoint': '/repos/' + full, 'status': 'not audited', 'http': getattr(e, 'code', None)})
        if errors:
            for repo in self.gh_state.get('inventory', []):
                if self._valid_repo(repo['full_name']):
                    inventory.setdefault(repo['full_name'].lower(), repo)
        self.gh_state.update(inventory=sorted(inventory.values(), key=lambda r: r['full_name'].lower()),
                             inventory_at=time.time(), owners=sorted(self.owners), inventory_errors=errors)
        self._save_github()
        return [r['full_name'] for r in self.gh_state['inventory']]

    # polling -----------------------------------------------------------
    def poll(self):
        items = []
        for name, fn in (('github', self._poll_github), ('jira', self._poll_jira), ('techcare', self._poll_techcare)):
            try:
                found, detail = fn()
                items.extend(found)
                self._mark(name, True, detail)
                if name == 'github':
                    self.state[name]['coverage'] = self.github_coverage
                    c = self.github_coverage
                    if (c.get('unsupported_or_failed') or c.get('partial_checks') or c.get('inventory_failures')
                            or c.get('covered', 0) < c.get('eligible', 0)):
                        self.state[name]['status'] = 'partial'
            except Exception as e:  # connector failure is visible, never fabricated
                code = getattr(e, 'code', None)
                self._mark(name, False, 'Could not read: %s%s.' % (type(e).__name__, ' HTTP %s' % code if code else ''))
        return items

    def _poll_github(self):
        if not self.gh_token:
            raise PermissionError('token missing')
        self.repositories()
        inventory = self.gh_state.get('inventory', [])
        active = [r['full_name'] for r in inventory if not r['archived'] and self._valid_repo(r['full_name'])]
        cursor = self.gh_state.get('cursor', 0) % max(1, len(active))
        batch = [active[(cursor + i) % len(active)] for i in range(min(self.batch_size, len(active)))]
        pending = {i['source_key']: i for i in self.gh_state.get('pending', [])
                   if self._repo_allowed(i['source_key'].split(':')[1])}
        audits = self.gh_state.setdefault('audits', {})
        pages = self.gh_state.setdefault('pages', {})
        for repo in batch:
            result = {}
            for kind, endpoint, key in (
                ('run', 'actions/runs', 'workflow_runs'),
                ('issue', 'issues?state=open&sort=created&direction=asc', None),
                ('dependabot', 'dependabot/alerts?state=open&sort=created&direction=asc', None),
                ('code-scanning', 'code-scanning/alerts?state=open&sort=created&direction=asc', None)):
                page_key = repo + ':' + kind
                start = 1 if kind == 'run' else pages.get(page_key, 1)
                try:
                    rows, partial = self._pages('/repos/%s/%s' % (repo, endpoint), key, self.page_limit, start)
                    pages[page_key] = start + max(1, (len(rows) + 99) // 100) if partial and kind != 'run' else 1
                    result[kind] = {'status': 'partial' if partial else 'audited', 'count': len(rows), 'page': start}
                    if kind == 'run':
                        latest = {}
                        for row in rows:
                            latest.setdefault((row.get('workflow_id'), row.get('head_branch')), row)
                        rows = [r for r in latest.values() if r.get('conclusion') in FAILED]
                    elif kind == 'issue':
                        rows = [r for r in rows if 'pull_request' not in r]
                    for row in rows:
                        number = row['id'] if kind == 'run' else row['number']
                        title = row.get('title') or row.get('name') or (row.get('rule') or {}).get('description')
                        if kind == 'dependabot':
                            title = (row.get('security_advisory') or {}).get('summary') or title
                        item = {'source': 'github', 'source_key': 'github:%s:%s:%s' % (repo, kind, number),
                                'kind': 'task' if kind == 'issue' else 'audit',
                                'title': clip('%s: %s · %s' % (kind, repo, title or number), 200),
                                'description': clip('GitHub %s #%s: %s%s' % (
                                    kind, number, row.get('body') or title or row.get('conclusion'),
                                    ' | branch %s | conclusion %s' % (row.get('head_branch'), row.get('conclusion'))
                                    if kind == 'run' else ''), 6000),
                                'source_url': row.get('html_url')}
                        pending[item['source_key']] = item
                except Exception as e:
                    code = getattr(e, 'code', None)
                    result[kind] = {'status': 'unsupported' if code in (401, 403, 404) else 'not audited',
                                    'http': code, 'error': type(e).__name__}
            audits[repo] = {'checked_at': time.time(), 'checks': result}
        # Delivery is not acknowledgment: retain findings until the consumer stores them.
        if self.store:
            pending = {k: v for k, v in pending.items() if not self.store.known(k)}
        failures = sum(v['status'] in ('unsupported', 'not audited') for r in active
                       for v in audits.get(r, {}).get('checks', {}).values())
        partial = sum(v['status'] == 'partial' for r in active
                      for v in audits.get(r, {}).get('checks', {}).values())
        self.github_coverage = {'inventory': len(inventory), 'archived': sum(r['archived'] for r in inventory),
                                'eligible': len(active), 'batch': len(batch),
                                'covered': sum(r in audits for r in active),
                                'fully_audited': sum(r in audits and all(
                                    v['status'] == 'audited' for v in audits[r]['checks'].values()) for r in active),
                                'cursor': (cursor + len(batch)) % max(1, len(active)),
                                'unsupported_or_failed': failures, 'partial_checks': partial,
                                'inventory_failures': len(self.gh_state.get('inventory_errors', [])),
                                'pending': len(pending)}
        self.gh_state.update(cursor=self.github_coverage['cursor'], coverage=self.github_coverage,
                             pending=list(pending.values()))
        self._save_github()
        c = self.github_coverage
        detail = ('%(inventory)d inventory (%(archived)d archived, not audited); %(batch)d repos this tick; '
                  'coverage %(covered)d/%(eligible)d; cursor %(cursor)d; %(pending)d pending findings; '
                  '%(unsupported_or_failed)d unsupported/not audited; %(partial_checks)d partial checks; '
                  '%(inventory_failures)d inventory failures.') % c
        return list(pending.values()), detail

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
    def _github_parts(self, parts):
        if len(parts) != 4 or parts[0] != 'github' or not self._repo_allowed(parts[1]):
            raise ValueError('Invalid or excluded GitHub source key')
        if parts[2] not in ('run', 'issue', 'dependabot', 'code-scanning') or not re.fullmatch(r'[0-9]+', parts[3]):
            raise ValueError('Unsupported GitHub evidence kind or identifier')
        return parts[1], parts[2], parts[3]

    def _github_finding_evidence(self, repo, kind, number):
        endpoint = {'issue': 'issues', 'dependabot': 'dependabot/alerts',
                    'code-scanning': 'code-scanning/alerts'}[kind]
        data = self._gh('/repos/%s/%s/%s' % (repo, endpoint, number))
        # API text is untrusted evidence, never instructions or executable tools.
        return [{'label': 'GitHub %s %s #%s' % (repo, kind, number),
                 'text': clip(json.dumps(data, ensure_ascii=False, indent=2), 12000)}]

    def _parts(self, task):
        return task['source_key'].split(':')

    def evidence(self, task):
        src, parts = task['source'], self._parts(task)
        if src == 'github':
            repo, kind, number = self._github_parts(parts)
            if kind != 'run':
                return self._github_finding_evidence(repo, kind, number)
            run_id = number
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
            repo, kind, number = self._github_parts(parts)
            if kind != 'run':
                return self._github_finding_evidence(repo, kind, number)
            run_id = number
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
