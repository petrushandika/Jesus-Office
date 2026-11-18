"""Synthetic local-only fixtures; never execute tests on discovered Mac projects."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from local_audit import LocalSources, REMOTE, STATE_KEY
from store import Store


class LocalAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = Store(str(self.root / 'state.db'))
        self.source = LocalSources({}, self.store)
        self.ns = {'__name__':'fixture'}
        exec(REMOTE, self.ns)
        self.request = {'roots':[str(self.root)], 'batch':10, 'directories':100,
                        'seconds':25, 'pending':[str(self.root)]}
        self.ns['request'] = self.request

    def tearDown(self):
        self.store.db.close()
        self.temp.cleanup()

    def repo(self, name='project'):
        repo = self.root / name
        repo.mkdir()
        subprocess.run(['git','init','-q',str(repo)], check=True)
        return repo

    def test_markers_junit_and_secret_exclusions(self):
        repo = self.repo()
        (repo / 'code.py').write_text('<<<<<<< HEAD\na\n=======\nb\n>>>>>>> branch\n')
        (repo / '.env').write_text('<<<<<<< HEAD\nTOP_SECRET\n=======\na\n>>>>>>> x\n')
        (repo / 'test-results.xml').write_text('<testsuite><testcase><failure>TOP_SECRET</failure></testcase></testsuite>')
        (repo / 'node_modules').mkdir()
        (repo / 'node_modules' / 'bad.py').write_text('<<<<<<< HEAD\na\n=======\nb\n>>>>>>> x\n')
        subprocess.run(['git','-C',str(repo),'add','.'],check=True)
        result = self.ns['run'](self.request)
        findings = result['projects'][0]['findings']
        self.assertEqual(sorted(f['check'] for f in findings), ['markers','test_report'])
        self.assertNotIn('TOP_SECRET',json.dumps(result))
        self.assertNotIn('code.py',json.dumps(result))

    def test_tradegenz_and_symlink_not_traversed(self):
        self.repo('TradeGenZ-private')
        allowed = self.repo('allowed')
        os.symlink(allowed,self.root / 'link')
        hidden = self.root / '.hidden'
        hidden.mkdir()
        self.repo('.hidden/nested')
        result = self.ns['run'](self.request)
        self.assertEqual([p['path'] for p in result['projects']], [str(allowed)])
        self.assertEqual(result['excluded'],1)

    def test_persisted_cursor_and_evidence_no_remote_reread(self):
        result = {'projects':[{'path':'/Users/Petrus/Job/demo','status':'checked','partial':False,
                              'findings':[{'check':'merge','identity':'a'*24,'count':1}]}],
                  'pending':['/Users/Petrus/Job/next'], 'visited':1,'errors':0,'excluded':0}
        with patch.object(self.source,'_remote',return_value=result):
            items, detail = self.source.poll()
        self.assertEqual(len(items),1)
        self.assertEqual(items[0]['source'],'local')
        self.assertIn('not a guarantee',detail)
        fresh = LocalSources({},self.store)
        with patch.object(fresh,'_remote',side_effect=AssertionError('no SSH')):
            self.assertTrue(fresh.evidence(items[0]))
            self.assertEqual(fresh.evidence({'source':'local','source_key':'local:/etc/passwd'}),[])
        self.assertEqual(self.store.setting(STATE_KEY)['pending'],result['pending'])
        with patch.object(fresh,'_remote',return_value=result):
            again,_ = fresh.poll()
        self.assertEqual(again[0]['source_key'], items[0]['source_key'])

    def test_unreachable_not_healthy(self):
        with patch.object(self.source,'_remote',side_effect=subprocess.TimeoutExpired('ssh',1)):
            items, detail = self.source.poll()
        self.assertEqual(items,[])
        self.assertIn('not verified',detail)
        self.assertEqual(self.store.setting(STATE_KEY)['status'],'unavailable')

    def test_discovery_cursor_resumes(self):
        for n in ('a','b','c'): self.repo(n)
        self.request['batch'] = 1
        seen = []
        for _ in range(10):
            result = self.ns['run'](self.request)
            seen.extend(p['path'] for p in result['projects'])
            if not result['pending']: break
            self.request['pending'] = result['pending']
        self.assertEqual(len(set(seen)),3)

    def test_root_rejection(self):
        for root in ('/etc','/Users/Petrus/Job/TradeGenZ','/Users/Petrus/.ssh'):
            with self.assertRaises(ValueError):
                LocalSources({'OFFICE_LOCAL_ROOTS':root},self.store)

    def test_excluded_root_cannot_be_normalized_away(self):
        with self.assertRaises(ValueError):
            LocalSources({'OFFICE_LOCAL_ROOTS':'/Users/Petrus/TradeGenZ/../Job'}, self.store)

    def test_status_remains_partial_for_earlier_partial_project(self):
        result = {'projects':[{'path':'/Users/Petrus/Job/demo','status':'checked','partial':True,
                              'findings':[]}], 'pending':['/Users/Petrus/Job/next'],
                  'visited':1,'errors':0,'excluded':0}
        with patch.object(self.source,'_remote',return_value=result): self.source.poll()
        result['projects'] = []
        result['pending'] = []
        with patch.object(self.source,'_remote',return_value=result): self.source.poll()
        self.assertEqual(self.store.setting(STATE_KEY)['status'],'partial')

    def test_unmerged_index(self):
        repo = self.repo()
        oid = subprocess.run(['git','-C',str(repo),'hash-object','-w','--stdin'],input=b'a',stdout=subprocess.PIPE,check=True).stdout.strip().decode()
        subprocess.run(['git','-C',str(repo),'update-index','--index-info'],
                       input=('100644 %s 1\tfile.py\n100644 %s 2\tfile.py\n' % (oid,oid)).encode(),check=True)
        result = self.ns['run'](self.request)
        self.assertEqual([f['check'] for f in result['projects'][0]['findings']],['merge'])


if __name__ == '__main__':
    unittest.main()
