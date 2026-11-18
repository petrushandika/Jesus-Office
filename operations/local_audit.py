"""Bounded, read-only Mac audit. No project code is executed or transferred.

LocalSources(env, store).poll() -> (items, Indonesian detail); evidence(task)
returns persisted, sanitized metadata only (never follows a task-supplied path).
OFFICE_LOCAL_ROOTS accepts a JSON list or comma-separated absolute Mac paths.
Limits: directory batches resume; oversized repository checks are marked partial.
This detects evidence, not every bug, and never runs tests or changes a checkout.
"""
import hashlib
import json
import os
import subprocess

DEFAULT_ROOTS = ['/Users/Petrus/' + p for p in ('Job', 'Learning', 'Lecture', 'Herd', 'backend')]
STATE_KEY = 'local_audit_v1'

# Executed with system Python over SSH stdin, not installed on the Mac.
REMOTE = r'''
import hashlib, json, os, re, selectors, stat, subprocess, time
import xml.etree.ElementTree as ET
SKIP = {'node_modules','vendor','venv','env','__pycache__','dist','build','out','coverage',
        'target','tmp','temp','cache','caches','Pods','DerivedData','bower_components'}
LIMIT = 2_000_000
START = time.monotonic()
def denied(path):
    return 'tradegenz' in path.casefold()
def safe(path, roots):
    if not isinstance(path, str) or not os.path.isabs(path) or denied(path): return False
    path = os.path.normpath(path)
    if not any(path == r or path.startswith(r + '/') for r in roots): return False
    current = '/'
    for component in path.split('/')[1:]:
        if component.startswith('.'): return False
        if component in SKIP and any(current == r or current.startswith(r + '/') for r in roots): return False
        current = os.path.join(current, component)
        try:
            if stat.S_ISLNK(os.lstat(current).st_mode): return False
        except OSError: return False
    return True
def git(repo, args):
    env = {'PATH':'/usr/bin:/bin:/usr/local/bin', 'HOME':'/var/empty', 'LC_ALL':'C',
           'GIT_CONFIG_NOSYSTEM':'1', 'GIT_CONFIG_GLOBAL':'/dev/null', 'GIT_OPTIONAL_LOCKS':'0',
           'GIT_TERMINAL_PROMPT':'0', 'GIT_NO_REPLACE_OBJECTS':'1'}
    cmd = ['/usr/bin/git','--no-optional-locks','-c','core.fsmonitor=false',
           '-c','core.hooksPath=/dev/null','-c','core.untrackedCache=false','-C',repo] + args
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env)
    selector = selectors.DefaultSelector(); selector.register(p.stdout, selectors.EVENT_READ)
    chunks = []; size = 0; until = min(START + request['seconds'], time.monotonic() + 5)
    try:
        while selector.get_map():
            if time.monotonic() > until: raise TimeoutError()
            for key, _ in selector.select(.1):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk: selector.unregister(key.fileobj); continue
                size += len(chunk)
                if size > LIMIT: raise ValueError('bounded output')
                chunks.append(chunk)
        rc = p.wait(timeout=1)
        if rc: raise ValueError('git unavailable')
        return b''.join(chunks)
    finally:
        if p.poll() is None: p.kill()
        p.wait(); selector.close(); p.stdout.close()
def identity(value): return hashlib.sha256(value.encode('utf-8', 'replace')).hexdigest()[:24]
def result_file(name):
    return name in {'junit.xml','test-results.xml','pytest.xml','surefire-reports.xml'} or bool(re.fullmatch(r'TEST-[A-Za-z0-9_.-]+\.xml', name))
def readable(rel):
    parts = rel.split('/')
    return (not os.path.isabs(rel) and all(p not in ('', '.', '..') and not p.startswith('.')
            and p not in SKIP and not denied(p) for p in parts)
            and not re.search(r'(?i)(secret|credential|private.?key|\.pem$|\.key$|\.p12$|\.log$|lock$)',rel))
def audit(repo):
    summary = {'path':repo, 'findings':[], 'status':'checked', 'files_checked':0,
               'test_reports_checked':0, 'partial':False}
    def finding(check, rel, count):
        # Do not export source snippets, XML messages, test names, logs or filenames.
        summary['findings'].append({'check':check, 'identity':identity(rel), 'count':count})
    try:
        unmerged = git(repo, ['ls-files','-u','-z'])
        files = {p.split(b'\t',1)[1] for p in unmerged.split(b'\0') if b'\t' in p}
        for path in sorted(files):
            rel = os.fsdecode(path)
            if readable(rel): finding('merge',rel,1)
        tracked = git(repo, ['ls-files','--cached','-z'])
        tracked_names = set(os.fsdecode(p) for p in tracked.split(b'\0') if p)
        names = sorted(tracked_names)
        # Existing standard JUnit reports may be ignored/untracked, but only known
        # report locations, never arbitrary logs or recursively enumerated files.
        reports = []
        for directory in ('', 'test-results', 'reports', 'surefire-reports'):
            base = os.path.join(repo,directory)
            if not safe(base, request['roots']) or not os.path.isdir(base): continue
            with os.scandir(base) as entries:
                for i, entry in enumerate(entries):
                    if i >= 1000: summary['partial'] = True; break
                    if result_file(entry.name): reports.append(os.path.relpath(entry.path,repo))
        names = sorted(set(names + reports))
        consumed = 0
        for rel in names:
            if not readable(rel): continue
            if summary['files_checked'] >= 1500 or consumed >= 8_000_000 or time.monotonic() > START + request['seconds'] - 1:
                summary['partial'] = True; break
            path = os.path.join(repo,rel)
            if not safe(path, request['roots']): continue
            try:
                fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                with os.fdopen(fd,'rb') as handle:
                    info = os.fstat(handle.fileno())
                    if not stat.S_ISREG(info.st_mode): continue
                    if info.st_size > 256_000:
                        summary['partial'] = True; continue
                    body = handle.read(256_001)
                if len(body) > 256_000: summary['partial'] = True; continue
                consumed += len(body); summary['files_checked'] += 1
                if b'\0' in body: continue
                # A complete opening/separator/closing sequence avoids flagging
                # isolated documentation separator lines. Only counts leave Mac.
                if rel in tracked_names and re.search(rb'(?m)^<{7}(?: |\r?$)[\s\S]*?^={7}\r?$[\s\S]*?^>{7}(?: |\r?$)',body):
                    finding('markers',rel,1)
                if result_file(os.path.basename(rel)):
                    summary['test_reports_checked'] += 1
                    if b'<!DOCTYPE' in body.upper() or b'<!ENTITY' in body.upper(): continue
                    root = ET.fromstring(body)
                    if root.tag not in ('testsuites','testsuite'): continue
                    count = sum(1 for case in root.iter('testcase') if case.find('failure') is not None or case.find('error') is not None)
                    if count: finding('test_report',rel,count)
            except (OSError, ET.ParseError):
                summary['partial'] = True
        if len(summary['findings']) > 300:
            summary['findings'] = summary['findings'][:300]; summary['partial'] = True
    except (OSError, ValueError, TimeoutError, subprocess.SubprocessError):
        summary['status'] = 'unavailable'; summary['partial'] = True
    return summary

def run(request):
    roots = request['roots']
    stack = list(request.get('pending') or roots)
    out = {'projects':[], 'pending':[], 'visited':0, 'errors':0, 'excluded':0}
    while stack and out['visited'] < request['directories'] and len(out['projects']) < request['batch'] and time.monotonic() < START + request['seconds'] - 1:
        path = stack.pop()
        if denied(path): out['excluded'] += 1; continue
        if not safe(path,roots): out['errors'] += 1; continue
        out['visited'] += 1
        try:
            meta = os.path.join(path,'.git')
            if os.path.lexists(meta):
                mode = os.lstat(meta).st_mode
                if stat.S_ISDIR(mode): out['projects'].append(audit(path))
                else: out['projects'].append({'path':path,'status':'unavailable','partial':True,
                                              'findings':[], 'files_checked':0,'test_reports_checked':0})
            children = []
            with os.scandir(path) as entries:
                for i, entry in enumerate(entries):
                    # Very wide directories retain cursor by name on a later poll.
                    if denied(entry.name): out['excluded'] += 1; continue
                    if entry.name.startswith('.') or entry.name in SKIP: continue
                    if entry.is_dir(follow_symlinks=False): children.append(entry.path)
                    if i >= 50000: raise ValueError('directory too wide')
            stack.extend(sorted(children, reverse=True))
        except (OSError, ValueError): out['errors'] += 1
    out['pending'] = stack
    return out
if __name__ == '__main__':
    request = REQUEST
    print(json.dumps(run(request), ensure_ascii=True))
'''


def _number(env, key, default, low, high):
    try:
        return max(low, min(high, int(env.get(key, default))))
    except (ValueError, TypeError):
        return default


class LocalSources:
    def __init__(self, env, store):
        self.store = store
        raw = env.get('OFFICE_LOCAL_ROOTS')
        roots = json.loads(raw) if raw and raw.lstrip().startswith('[') else raw.split(',') if raw else DEFAULT_ROOTS
        if not isinstance(roots, list) or not roots:
            raise ValueError('OFFICE_LOCAL_ROOTS requires nonempty roots')
        if any(not isinstance(r, str) or 'tradegenz' in r.casefold() or '..' in r.split('/') for r in roots):
            raise ValueError('Excluded or malformed root')
        self.roots = sorted(set(os.path.normpath(r.strip()) for r in roots if r.strip()))
        if not self.roots or any(not r.startswith('/Users/Petrus/') or 'tradegenz' in r.casefold()
                                 or any(p.startswith('.') or p == '..' for p in r.split('/')) for r in self.roots):
            raise ValueError('Local roots must be safe absolute paths under /Users/Petrus')
        self.batch = _number(env, 'OFFICE_LOCAL_BATCH', 5, 1, 30)
        self.directories = _number(env, 'OFFICE_LOCAL_DIRECTORIES', 1500, 1, 5000)
        self.seconds = _number(env, 'OFFICE_LOCAL_SECONDS', 25, 5, 90)
        self.ssh = ['ssh', '-i', os.path.expanduser('~/.ssh/mac_tunnel_key'), '-p', '2222',
                    '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-o', 'StrictHostKeyChecking=yes',
                    '-o', 'LogLevel=ERROR', 'developer2@localhost', '/usr/bin/python3', '-']

    def _remote(self, request):
        payload = REMOTE.replace('request = REQUEST', 'request = ' + repr(request))
        # Remote emits only bounded metadata. Never include SSH stderr in evidence.
        proc = subprocess.run(self.ssh, input=payload, text=True, stdout=subprocess.PIPE,
                              stderr=subprocess.DEVNULL, timeout=self.seconds + 10, check=True)
        if len(proc.stdout) > 4_000_000:
            raise ValueError('metadata limit')
        return json.loads(proc.stdout)

    def poll(self):
        state = self.store.setting(STATE_KEY, {})
        if state.get('roots') != self.roots:
            state = {'roots':self.roots, 'pending':self.roots[:], 'projects':{}, 'cycles':0}
        request = {'roots':self.roots, 'pending':state.get('pending') or self.roots[:],
                   'batch':self.batch, 'directories':self.directories, 'seconds':self.seconds}
        try:
            result = self._remote(request)
        except (OSError, ValueError, subprocess.SubprocessError):
            state['status'] = 'unavailable'
            self.store.set_setting(STATE_KEY, state)
            return [], 'Unavailable: Mac SSH failed. Local checks are not verified.'
        items = []
        labels = {'merge':'Konflik merge belum selesai', 'markers':'Kemungkinan penanda konflik dalam berkas tracked',
                  'test_report':'Laporan tes yang sudah ada mencatat kegagalan'}
        for project in result['projects']:
            path = project['path']
            # Validate the returned identity too, before persisting metadata.
            if not any(path == r or path.startswith(r + '/') for r in self.roots) or 'tradegenz' in path.casefold():
                continue
            project_id = hashlib.sha256(path.encode()).hexdigest()[:24]
            # Only conservative project labels are exported to task/report surfaces.
            name = ''.join(c if c.isalnum() or c in '._- ' else '_' for c in os.path.basename(path))[:100]
            for finding in project['findings']:
                check, identity = finding['check'], finding['identity']
                if check not in labels or not isinstance(identity, str) or len(identity) != 24:
                    continue
                key = 'local:%s:%s:%s' % (project_id, check, identity)
                count = int(finding['count'])
                text = ('Proyek %s. %s; jumlah %d. Identitas berkas %s. '
                        'Hanya metadata tersanitasi, tanpa isi kode/log/rahasia. '
                        'Bukti laporan tes bisa lama; tes tidak dijalankan. '
                        'Audit lokal tidak menjamin semua bug ditemukan; perbaikan tetap perlu persetujuan.'
                        % (name, labels[check], count, identity))
                self.store.set_setting('local_evidence:' + key, [{'label':labels[check], 'text':text}])
                items.append({'source':'local', 'source_key':key, 'kind':'audit',
                              'title':('%s · %s' % (labels[check],name))[:200],
                              'description':text, 'source_url':None})
            # Inventory contains paths only in local Store, never source contents.
            state['projects'][project_id] = project
        state['pending'] = result['pending']
        if not state['pending']:
            state['cycles'] = state.get('cycles',0) + 1
        state['discovery_errors'] = state.get('discovery_errors', 0) + result['errors']
        state['status'] = 'partial' if (state['pending'] or state['discovery_errors']
                                        or any(p['partial'] for p in state['projects'].values())) else 'available'
        state['last_batch'] = {k:result[k] for k in ('visited','errors','excluded')}
        self.store.set_setting(STATE_KEY, state)
        detail = ('%d projects inventoried; batch %d, %d directories pending, %d findings, %d unreadable. '
                  'Status %s. Git projects only; bounded read-only checks, not a guarantee of no bugs.' %
                  (len(state['projects']),len(result['projects']),len(result['pending']),len(items),result['errors'],state['status']))
        return items, detail

    def evidence(self, task):
        key = task.get('source_key','')
        if task.get('source') != 'local' or not key.startswith('local:'):
            return []
        return self.store.setting('local_evidence:' + key, [])
