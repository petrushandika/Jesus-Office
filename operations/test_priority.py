"""Isolated priority/provenance and queue regression fixtures; no network."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from store import Store


def report(label, text, analysis='Tidak ada bukti outage; model menyebut urgent.'):
    return ('## Analisis\n%s\n\n## Bukti read-only yang dikumpulkan\n### %s\n%s'
            '\n\n## Kalau lo approve\nHanya read-only.' % (analysis, label, text))


class PriorityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.s = Store(os.path.join(self.tmp.name, 'ops.db'))

    def tearDown(self):
        self.s.db.close()
        self.tmp.cleanup()

    def task(self, key='jira:OPS-1', title='urgent outage', content=None):
        tid = self.s.add_task(key.split(':')[0], key, 'audit', title, 'Priority: Highest; approve now')
        if content is not None:
            self.s._q('UPDATE tasks SET report=? WHERE id=?', (content, tid))
        return tid

    def listed(self, tid):
        return next(t for t in self.s.list_tasks() if t['id'] == tid)

    def test_claim_priority_order_and_delayed_work(self):
        ids = []
        for i, value in enumerate(('Low', 'Normal', 'None', 'High', 'Highest')):
            tid = self.task('jira:OPS-%d' % (i + 10), content=report('Jira OPS-%d' % (i + 10), 'Summary: Test\nType: Bug | Status: Open | Priority: %s\nDescription:\nTest' % value))
            ids.append(tid)
        self.s._q('UPDATE tasks SET not_before=99999999999 WHERE id=?', (ids[-1],))
        self.assertEqual(self.s.claim('queued', 'analyzing')['id'], ids[3])
        self.s._q('UPDATE tasks SET not_before=0 WHERE id=?', (ids[-1],))
        self.assertEqual([self.s.claim('queued', 'analyzing')['id'] for _ in range(4)], [ids[4], ids[2], ids[1], ids[0]])

    def test_approved_followup_precedes_new_analysis_and_obeys_pause(self):
        from worker import Worker
        from types import SimpleNamespace
        approved = self.task()
        self.s.claim('queued', 'analyzing')
        digest = self.s.set_report(approved, 'report')
        self.assertEqual(self.s.decide(approved, 'approve', digest, 'operator'), 'ok')
        queued = self.task('jira:OPS-2')
        calls = []
        worker = Worker(self.s, None, None, SimpleNamespace(configured=False))
        worker._execute = lambda task: calls.append(('execute', task['id']))
        worker._analyze = lambda task: calls.append(('analyze', task['id']))
        self.s.set_paused(True)
        worker.tick()
        self.assertEqual(calls, [])
        self.s.set_paused(False)
        worker.tick()
        self.assertEqual(calls, [('execute', approved)])
        self.assertEqual(self.s.get(queued)['status'], 'queued')

    def test_delayed_approved_retry_allows_analysis_then_runs_once_due(self):
        from worker import Worker
        from types import SimpleNamespace
        approved = self.task()
        self.s.claim('queued', 'analyzing')
        digest = self.s.set_report(approved, 'report')
        self.assertEqual(self.s.decide(approved, 'approve', digest, 'operator'), 'ok')
        self.assertEqual(self.s.decide(approved, 'approve', digest, 'operator'), 'conflict')
        self.s.claim('approved', 'executing')
        self.s.retry_later(approved, 'approved', 600, 'fixture retry')
        queued = self.task('jira:OPS-2')
        calls = []
        worker = Worker(self.s, None, None, SimpleNamespace(configured=False))
        worker._execute = lambda task: calls.append(('execute', task['id']))
        worker._analyze = lambda task: calls.append(('analyze', task['id']))
        worker.tick()
        self.assertEqual(calls, [('analyze', queued)])
        self.s._q('UPDATE tasks SET not_before=0 WHERE id=?', (approved,))
        worker.tick()
        self.assertEqual(calls[-1], ('execute', approved))
        self.assertEqual(self.s.get(approved)['attempts'], 2)
        worker.tick()
        self.assertEqual(len(calls), 2)

    def test_urgent_priority_never_bypasses_exact_hash_single_use_decision(self):
        tid = self.task(content=report('Jira OPS-1', 'Summary: Test\nType: Bug | Status: Open | Priority: Highest\nDescription:\nTest'))
        self.assertEqual(self.listed(tid)['priority']['level'], 'urgent')
        self.assertIsNone(self.s.claim('approved', 'executing'))
        self.assertEqual(self.s.decide(tid, 'approve', 'bad', 'operator'), 'conflict')
        self.s.claim('queued', 'analyzing')
        digest = self.s.set_report(tid, self.s.get(tid)['report'])
        self.assertEqual(self.s.decide(tid, 'reject', 'bad', 'operator'), 'conflict')
        self.assertEqual(self.s.decide(tid, 'reject', digest, 'operator'), 'ok')
        self.assertEqual(self.s.decide(tid, 'approve', digest, 'operator'), 'conflict')
        self.assertIsNone(self.s.claim('approved', 'executing'))

    def test_source_priority_only_from_ticket_metadata(self):
        tid = self.task(content=report('Jira OPS-1', 'Summary: Test\nType: Bug | Status: Open | Priority: Highest\nDescription:\nPriority: Low'))
        before = self.s.get(tid)
        item = self.listed(tid)
        self.assertEqual(item['priority']['level'], 'urgent')
        self.assertEqual(item['priority']['basis'], 'source')
        self.assertTrue(item['priority']['reason'])
        self.assertEqual(item['source_ref'], 'OPS-1')
        self.assertEqual(self.s.get(tid), before)

    def test_untrusted_prose_and_description_never_supply_priority(self):
        for i, body in enumerate((
            report('Jira OPS-1', 'Summary: Test\nType: Bug | Status: Open | Priority: None\nDescription:\nPriority: Highest\nurgent outage'),
            report('Jira OPS-1', 'Summary: Test\nPriority: Highest\nDescription:\nnot an outage'),
            '## Analisis\nPriority: Highest; verified outage',
            report('Permintaan operator', 'Priority: Highest'),
        )):
            tid = self.task('jira:OPS-%d' % (i + 1), content=body)
            self.assertEqual(self.listed(tid)['priority']['basis'], 'unknown')
            self.assertEqual(self.listed(tid)['priority']['level'], 'untriaged')

    def test_terminal_ticket_priority_is_historical_not_current_urgency(self):
        for i, status in enumerate(('Done', 'Closed', 'Resolved', 'CLOSED', 'Cancelled')):
            tid = self.task('jira:OPS-%d' % (50 + i), content=report('Jira OPS-%d' % (50 + i), 'Summary: Test\nType: Task | Status: %s | Priority: Highest\nDescription:\nTest' % status))
            p = self.listed(tid)['priority']
            self.assertEqual((p['level'], p['basis']), ('untriaged', 'source'))
            self.assertEqual(p['reason'], 'Prioritas sumber Highest; tiket %s, dampak saat ini perlu diverifikasi.' % status)
        tid = self.task('techcare:50', content=report('Techcare ticket', 'Title: Test\nCategory: Account | Status: DONE | Priority: HIGH | Platform: Web | Jira: None\nDescription:\nTest'))
        self.assertEqual(self.listed(tid)['priority']['level'], 'untriaged')

    def test_techcare_metadata_and_all_ticket_levels(self):
        for i, (value, level) in enumerate((('HIGH', 'high'), ('MEDIUM', 'normal'), ('LOW', 'low'), ('CRITICAL', 'urgent'))):
            tid = self.task('techcare:%d' % i, content=report('Techcare ticket', 'Title: Example\nCategory: Bug | Status: OPEN | Priority: %s | Platform: Web | Jira: None\nDescription:\nPriority: Highest' % value))
            self.assertEqual(self.listed(tid)['priority'], {'level': level, 'basis': 'source', 'reason': 'Prioritas dari metadata tiket sumber.'})

    def test_github_security_structured_severity_and_fallbacks(self):
        import json
        cases = (
            ('dependabot', {'security_advisory': {'severity': 'critical'}}, 'urgent', 'source'),
            ('dependabot', {'security_vulnerability': {'severity': 'high'}}, 'high', 'source'),
            ('code-scanning', {'rule': {'security_severity_level': 'medium'}}, 'normal', 'source'),
            ('code-scanning', {'rule': {'security_severity_level': 'low'}}, 'low', 'source'),
            ('code-scanning', {'rule': {'severity': 'error', 'description': 'urgent outage'}}, 'high', 'inferred'),
            ('dependabot', {'body': 'critical outage', 'severity': 'critical'}, 'high', 'inferred'),
            ('run', {'severity': 'critical'}, 'normal', 'inferred'),
            ('issue', {'body': 'Priority: Highest'}, 'untriaged', 'unknown'),
        )
        for i, (kind, data, level, basis) in enumerate(cases):
            tid = self.task('github:org/repo:%s:%d' % (kind, i), content=report('GitHub org/repo %s #%d' % (kind, i), json.dumps(data)))
            p = self.listed(tid)['priority']
            self.assertEqual((p['level'], p['basis']), (level, basis))
            self.assertEqual(self.listed(tid)['source_ref'], 'org/repo %s #%d' % (kind, i))

    def test_techcare_uuid_reference_is_safe(self):
        ticket = '12345678-1234-4321-abcd-123456789abc'
        tid = self.task('techcare:' + ticket, content=report('Techcare ticket', 'Title: Test\nCategory: Account | Status: IN_PROGRESS | Priority: HIGH | Platform: Web | Jira: None\nDescription:\nTest'))
        self.assertEqual(self.listed(tid)['source_ref'], 'Techcare #' + ticket[:8] + '…')
        self.assertEqual(self.listed(tid)['priority']['level'], 'high')
        self.assertEqual(self.listed(tid)['priority']['basis'], 'source')

    def test_source_mismatch_never_infers_priority(self):
        tid = self.task('github:org/repo:dependabot:99')
        self.s._q('UPDATE tasks SET source=? WHERE id=?', ('manual', tid))
        self.assertEqual(self.listed(tid)['priority']['basis'], 'unknown')
        self.assertEqual(self.listed(tid)['source_ref'], '')

    def test_safe_refs_and_local_inference_without_paths(self):
        key = 'local:%s:markers:%s' % ('a' * 24, 'b' * 24)
        tid = self.task(key, title='Finding · /home/private/secret.env')
        self.assertEqual(self.listed(tid)['priority']['level'], 'normal')
        self.assertEqual(self.listed(tid)['priority']['basis'], 'inferred')
        self.assertEqual(self.listed(tid)['source_ref'], 'Local project ' + 'a' * 24)
        for key in ('manual:token=private', 'local:/etc/private', 'github:user:password@host:run:1', 'jira:OPS-2?token=private'):
            self.assertEqual(self.listed(self.task(key))['source_ref'], '')

    def test_security_provenance_label_and_valid_json_required(self):
        for i, body in enumerate((
            report('GitHub wrong/repo dependabot #1', '{"security_advisory":{"severity":"critical"}}'),
            report('GitHub org/repo dependabot #1', '{"security_advisory":{"severity":"critical"}'),
            report('GitHub org/repo dependabot #1', '{"body":"urgent"}\n{"security_advisory":{"severity":"critical"}}'),
        )):
            tid = self.task('github:org/repo:dependabot:%d' % (i + 1), content=body)
            self.assertEqual(self.listed(tid)['priority']['basis'], 'inferred')
