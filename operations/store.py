"""SQLite persistence: tasks, approvals, worker runs, audit events, email outbox."""
import hashlib, json, os, secrets, sqlite3, threading, time
from datetime import datetime, timezone
from priority import ORDER, classify, source_ref

MAX_ATTEMPTS = 3
SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks(
 id TEXT PRIMARY KEY, source TEXT NOT NULL, source_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
 title TEXT NOT NULL, description TEXT NOT NULL, source_url TEXT, status TEXT NOT NULL,
 report TEXT, report_hash TEXT, decision TEXT, execution_report TEXT,
 attempts INTEGER NOT NULL DEFAULT 0, not_before REAL NOT NULL DEFAULT 0, error TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs(
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL,
 started_at TEXT NOT NULL, ended_at TEXT, heartbeat_at TEXT NOT NULL,
 tool_calls INTEGER NOT NULL DEFAULT 0, last_tool TEXT, last_tool_at TEXT);
CREATE TABLE IF NOT EXISTS events(
 id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, kind TEXT NOT NULL, detail TEXT, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS outbox(
 id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, kind TEXT NOT NULL, report_hash TEXT,
 status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_at REAL NOT NULL DEFAULT 0,
 error TEXT, message_id TEXT, created_at TEXT NOT NULL, UNIQUE(task_id, kind, report_hash));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seen(source_key TEXT PRIMARY KEY);
"""
TASK_FIELDS = ('id', 'title', 'source', 'source_url', 'status', 'report', 'report_hash', 'created_at',
               'updated_at', 'decision', 'execution_report', 'kind', 'error')


def now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


class Store:
    def __init__(self, path, pause_file=None):
        self.path, self.pause_file = path, pause_file
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.executescript(SCHEMA)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass

    def _q(self, sql, args=()):
        with self.lock:
            return self.db.execute(sql, args).fetchall()

    def _one(self, sql, args=()):
        rows = self._q(sql, args)
        return dict(rows[0]) if rows else None

    def event(self, task_id, kind, detail=''):
        self._q('INSERT INTO events(task_id,kind,detail,at) VALUES(?,?,?,?)', (task_id, kind, detail[:500], now_iso()))

    def events(self, task_id):
        return [dict(r) for r in self._q('SELECT kind,detail,at FROM events WHERE task_id=? ORDER BY id', (task_id,))]

    # settings / kill switch
    def setting(self, key, default=None):
        row = self._one('SELECT value FROM settings WHERE key=?', (key,))
        return json.loads(row['value']) if row else default

    def set_setting(self, key, value):
        self._q('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                (key, json.dumps(value)))

    def paused(self):
        return bool(self.setting('paused', False)) or bool(self.pause_file and os.path.exists(self.pause_file))

    def set_paused(self, value):
        self.set_setting('paused', bool(value))
        self.event(None, 'pause' if value else 'resume', 'operator')

    def known(self, source_key):
        return bool(self._q('SELECT 1 FROM tasks WHERE source_key=? UNION SELECT 1 FROM seen WHERE source_key=?',
                            (source_key, source_key)))

    def mark_seen(self, source_key):
        self._q('INSERT OR IGNORE INTO seen(source_key) VALUES(?)', (source_key,))

    # tasks
    def add_task(self, source, source_key, kind, title, description, source_url=None):
        tid = secrets.token_hex(8)
        stamp = now_iso()
        with self.lock:
            cur = self.db.execute(
                'INSERT OR IGNORE INTO tasks(id,source,source_key,kind,title,description,source_url,status,created_at,updated_at)'
                ' VALUES(?,?,?,?,?,?,?,?,?,?)',
                (tid, source, source_key, kind, title[:200], description[:12000], source_url, 'queued', stamp, stamp))
            if cur.rowcount == 0:
                return None
        self.event(tid, 'created', source)
        return tid

    def get(self, tid):
        return self._one('SELECT * FROM tasks WHERE id=?', (tid,))

    def list_tasks(self, limit=200):
        rows = self._q('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?', (limit,))
        return [dict({k: r[k] for k in TASK_FIELDS}, priority=classify(dict(r)),
                     source_ref=source_ref(dict(r))) for r in rows]

    def claim(self, from_status, to_status):
        with self.lock:
            rows = self._q('SELECT * FROM tasks WHERE status=? AND not_before<=? ORDER BY created_at, id',
                           (from_status, time.time()))
            if not rows:
                return None
            row = min(rows, key=lambda r: ORDER[classify(dict(r))['level']])

            self.db.execute('UPDATE tasks SET status=?, attempts=attempts+1, updated_at=? WHERE id=? AND status=?',
                            (to_status, now_iso(), row['id'], from_status))
        self.event(row['id'], to_status)
        return self.get(row['id'])

    def retry_later(self, tid, back_status, seconds, reason):
        task = self.get(tid)
        if task['attempts'] >= MAX_ATTEMPTS:
            return self.fail(tid, reason)
        self._q('UPDATE tasks SET status=?, not_before=?, error=?, updated_at=? WHERE id=?',
                (back_status, time.time() + seconds, reason[:300], now_iso(), tid))
        self.event(tid, 'retry', reason)

    def fail(self, tid, reason):
        self._q("UPDATE tasks SET status='failed', error=?, updated_at=? WHERE id=?", (reason[:300], now_iso(), tid))
        self.event(tid, 'failed', reason)

    def set_report(self, tid, report):
        digest = hashlib.sha256(('%s\n%s' % (tid, report)).encode()).hexdigest()
        self._q("UPDATE tasks SET report=?, report_hash=?, status='awaiting_approval', attempts=0, error=NULL,"
                " updated_at=? WHERE id=? AND status='analyzing'", (report, digest, now_iso(), tid))
        self.event(tid, 'report_ready', digest)
        return digest

    def replace_report(self, tid, expected_hash, report):
        """Swap an undecided awaiting report for a new version. The new hash invalidates the old one."""
        digest = hashlib.sha256(('%s\n%s' % (tid, report)).encode()).hexdigest()
        with self.lock:
            cur = self.db.execute("UPDATE tasks SET report=?, report_hash=?, updated_at=? WHERE id=? AND report_hash=?"
                                  " AND status='awaiting_approval' AND decision IS NULL",
                                  (report, digest, now_iso(), tid, expected_hash))
            if cur.rowcount != 1:
                return None
        self.event(tid, 'report_revised', '%s -> %s' % (expected_hash[:12], digest[:12]))
        return digest

    def decide(self, tid, decision, report_hash, operator):
        if decision not in ('approve', 'reject'):
            return 'invalid'
        stamp = now_iso()
        record = json.dumps({'decision': decision, 'by': operator, 'at': stamp, 'report_hash': report_hash})
        with self.lock:
            if not self.get(tid):
                return 'missing'
            cur = self.db.execute(
                "UPDATE tasks SET status=?, decision=?, attempts=0, updated_at=? WHERE id=? AND status='awaiting_approval'"
                " AND report_hash=? AND decision IS NULL",
                ('approved' if decision == 'approve' else 'rejected', record, stamp, tid, report_hash))
            if cur.rowcount != 1:
                return 'conflict'
        self.event(tid, 'decision', '%s by %s for %s' % (decision, operator, report_hash))
        return 'ok'

    def finish(self, tid, execution_report):
        self._q("UPDATE tasks SET execution_report=?, status='completed', error=NULL, updated_at=? WHERE id=? AND status='executing'",
                (execution_report, now_iso(), tid))
        self.event(tid, 'completed')

    # runs (what the 3D office animates)
    def start_run(self, tid, role):
        rid = 'ops-' + secrets.token_hex(6)
        stamp = now_iso()
        self._q("INSERT INTO runs(id,task_id,role,status,started_at,heartbeat_at) VALUES(?,?,?,'running',?,?)",
                (rid, tid, role, stamp, stamp))
        return rid

    def step(self, rid, tool):
        stamp = now_iso()
        self._q('UPDATE runs SET tool_calls=tool_calls+1, last_tool=?, last_tool_at=?, heartbeat_at=? WHERE id=?',
                (tool, stamp, stamp, rid))

    def heartbeat(self, rid):
        self._q("UPDATE runs SET heartbeat_at=? WHERE id=? AND status='running'", (now_iso(), rid))

    def end_run(self, rid, status):
        stamp = now_iso()
        self._q('UPDATE runs SET status=?, ended_at=?, heartbeat_at=? WHERE id=?', (status, stamp, stamp, rid))

    def run(self, rid):
        return self._one('SELECT * FROM runs WHERE id=?', (rid,))

    def snapshot(self, limit=10):
        rows = self._q("SELECT * FROM runs ORDER BY (status='running') DESC, started_at DESC LIMIT ?", (limit,))
        agents = []
        for r in rows:
            running = r['status'] == 'running'
            recent = False
            if running and r['last_tool_at']:
                age = datetime.now(timezone.utc) - datetime.fromisoformat(r['last_tool_at'].replace('Z', '+00:00'))
                recent = age.total_seconds() <= 8
            agents.append({
                'id': r['id'], 'run': r['id'], 'task': 0,
                'status': r['status'] if r['status'] in ('running', 'completed', 'failed', 'interrupted') else 'failed',
                'activity': ('tool' if recent else 'thinking') if running else 'done',
                'model': 'astronacci-9router', 'startedAt': r['started_at'], 'endedAt': r['ended_at'],
                'heartbeatAt': r['heartbeat_at'], 'toolCalls': r['tool_calls'], 'lastTool': r['last_tool'],
                'lastToolAt': r['last_tool_at']})
        return {'agents': agents}

    def recover(self):
        """After a restart: running runs are interrupted; in-flight tasks retried up to MAX_ATTEMPTS."""
        with self.lock:
            self.db.execute("UPDATE runs SET status='interrupted', ended_at=? WHERE status='running'", (now_iso(),))
            for status, back in (('analyzing', 'queued'), ('executing', 'approved')):
                for row in self.db.execute('SELECT id, attempts FROM tasks WHERE status=?', (status,)).fetchall():
                    if row['attempts'] >= MAX_ATTEMPTS:
                        self.db.execute("UPDATE tasks SET status='failed', error='interrupted too often', updated_at=? WHERE id=?",
                                        (now_iso(), row['id']))
                    else:
                        self.db.execute('UPDATE tasks SET status=?, updated_at=? WHERE id=?', (back, now_iso(), row['id']))

    # email outbox
    def queue_mail(self, tid, kind, report_hash):
        self._q('INSERT OR IGNORE INTO outbox(task_id,kind,report_hash,created_at) VALUES(?,?,?,?)',
                (tid, kind, report_hash, now_iso()))

    def due_mail(self, limit=5):
        return [dict(r) for r in self._q("SELECT * FROM outbox WHERE status='pending' AND next_at<=? ORDER BY id LIMIT ?",
                                         (time.time(), limit))]

    def mail_result(self, mid, ok, detail):
        if ok:
            self._q("UPDATE outbox SET status='sent', message_id=?, error=NULL WHERE id=?", (detail, mid))
        else:
            row = self._one('SELECT attempts FROM outbox WHERE id=?', (mid,))
            attempts = row['attempts'] + 1
            self._q('UPDATE outbox SET attempts=?, next_at=?, error=?, status=? WHERE id=?',
                    (attempts, time.time() + min(3600, 60 * 2 ** attempts), detail[:200],
                     'failed' if attempts >= 12 else 'pending', mid))

    def mail_summary(self):
        rows = self._q('SELECT status, COUNT(*) n FROM outbox GROUP BY status')
        return {r['status']: r['n'] for r in rows}
