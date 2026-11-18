"""Read-only GitHub discovery tests; all HTTP responses are local fixtures."""
from email.message import Message
import os
import sys
import tempfile
import unittest
import urllib.error
import urllib.parse
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))
from sources import Sources
from store import Store


def repo(name, archived=False):
    return {'full_name': name, 'archived': archived, 'pushed_at': '2000-01-01T00:00:00Z'}


class Network:
    def __init__(self, repos=None, orgs=None, org_repos=None):
        self.repos = repos or []
        self.orgs = orgs or []
        self.org_repos = org_repos or {}
        self.calls = []
        self.responses = {}

    def __call__(self, url, headers, **kw):
        parsed = urllib.parse.urlsplit(url)
        path = parsed.path
        self.calls.append(url)
        if 'tradegenz' in url.lower():
            raise AssertionError('Excluded repo requested')
        page = int(urllib.parse.parse_qs(parsed.query).get('page', [1])[0])
        if (path, page) in self.responses:
            value = self.responses[path, page]
        elif path in self.responses:
            value = self.responses[path]
        elif path == '/user':
            return {'login': 'fixture-user'}
        elif path == '/user/orgs':
            value = self.orgs
        elif path == '/user/repos':
            value = self.repos
        elif path.startswith('/orgs/'):
            value = self.org_repos.get(path.split('/')[2], [])
        elif path.endswith('/actions/runs'):
            return {'workflow_runs': []}
        elif path.count('/') == 3 and path.startswith('/repos/'):
            return repo('/'.join(path.split('/')[2:]))
        else:
            value = []
        if isinstance(value, Exception):
            raise value
        if isinstance(value, list):
            return value[(page - 1) * 100:page * 100]
        return value


class GitHubDiscoveryTests(unittest.TestCase):
    def source(self, net, store=None, **env):
        source = Sources(dict(OFFICE_GITHUB_TOKEN='fixture', OFFICE_REPOS='*', **env), store)
        source._get = net
        return source

    def test_paginated_user_org_membership_and_org_repos_cached(self):
        orgs = [{'login': 'org%03d' % n} for n in range(101)]
        net = Network([repo('foreign/r%03d' % n) for n in range(101)], orgs,
                      {'org100': [repo('org100/r%03d' % n) for n in range(101)]})
        s = self.source(net)
        inventory = s.repositories()
        self.assertEqual(len(inventory), 202)
        self.assertIn('org100', s.owners)
        self.assertNotIn('foreign', s.owners)
        self.assertTrue(s._repo_allowed('foreign/r000'))
        self.assertFalse(s._repo_allowed('foreign/unseen'))
        self.assertTrue(s._repo_allowed('org100/unseen'))
        for endpoint in ['/user/orgs', '/user/repos', '/orgs/org100/repos']:
            self.assertTrue(any(endpoint + '?' in c and 'page=2' in c for c in net.calls))
        before = len(net.calls)
        self.assertEqual(s.repositories(), inventory)
        self.assertEqual(len(net.calls), before)

    def test_archived_old_and_exclusion_before_requests(self):
        net = Network([repo('org/old'), repo('org/archive', True), repo('org/TrAdEgEnZ-demo')],
                      [{'login': 'org'}, {'login': 'TradeGenZ'}])
        s = self.source(net)
        s._poll_github()
        self.assertEqual(s.github_coverage['inventory'], 2)
        self.assertEqual(s.github_coverage['archived'], 1)
        self.assertIn('org/old', s.gh_state['audits'])
        self.assertFalse(any('/repos/org/archive/' in c for c in net.calls))
        self.assertFalse(any('pushed' in c or 'created=%' in c for c in net.calls))
        for method in (s.evidence, s.deep_evidence):
            with self.assertRaises(ValueError):
                method({'source': 'github', 'source_key': 'github:org/TradeGenZ:issue:1'})
        with patch.object(s, '_get') as get:
            with self.assertRaises(PermissionError):
                s._gh('/repos/org/tradegenz/issues')
            get.assert_not_called()

    def test_rotating_batch_restart_and_pending_not_truncated(self):
        net = Network([repo('org/r%02d' % n) for n in range(23)])
        for n in range(23):
            net.responses['/repos/org/r%02d/issues' % n] = [{'number': j, 'title': 'Bug'} for j in range(2)]
        with tempfile.TemporaryDirectory() as d:
            store = Store(os.path.join(d, 'state.db'))
            s = self.source(net, store)
            first, _ = s._poll_github()
            self.assertEqual(len(first), 20)
            self.assertEqual(s.github_coverage['batch'], 10)
            self.assertEqual(s.github_coverage['cursor'], 10)
            s = self.source(net, store)
            second, _ = s._poll_github()
            self.assertEqual(len(second), 40)
            self.assertEqual(s.github_coverage['covered'], 20)
            store.add_task(**first[0])
            third, _ = s._poll_github()
            self.assertEqual(s.github_coverage['covered'], 23)
            self.assertEqual(len(third), 45)
            self.assertNotIn(first[0]['source_key'], [i['source_key'] for i in third])
            store.db.close()

    def test_findings_latest_branch_issue_not_pr_and_alerts(self):
        net = Network([repo('org/r')])
        net.responses['/repos/org/r/actions/runs'] = {'workflow_runs': [
            {'id': 4, 'workflow_id': 1, 'head_branch': 'main', 'conclusion': 'success'},
            {'id': 3, 'workflow_id': 1, 'head_branch': 'main', 'conclusion': 'failure'},
            {'id': 2, 'workflow_id': 1, 'head_branch': 'dev', 'conclusion': 'failure'}]}
        net.responses['/repos/org/r/issues'] = [{'number': 5, 'title': 'Bug'}, {'number': 6, 'pull_request': {}}]
        net.responses['/repos/org/r/dependabot/alerts'] = [{'number': 7, 'security_advisory': {'summary': 'Vulnerability'}}]
        net.responses['/repos/org/r/code-scanning/alerts'] = [{'number': 8, 'rule': {'description': 'Unsafe'}}]
        items, _ = self.source(net)._poll_github()
        self.assertEqual({i['source_key'] for i in items}, {'github:org/r:run:2', 'github:org/r:issue:5',
                         'github:org/r:dependabot:7', 'github:org/r:code-scanning:8'})

    def test_permissions_and_partial_failures_not_healthy(self):
        net = Network([repo('org/r')])
        for endpoint, code in [('dependabot/alerts', 403), ('code-scanning/alerts', 404), ('actions/runs', 500)]:
            net.responses['/repos/org/r/' + endpoint] = urllib.error.HTTPError('https://api.github.com', code, 'fixture', Message(), None)
        s = self.source(net)
        s.poll()
        self.assertEqual(s.state['github']['status'], 'partial')
        self.assertEqual(s.github_coverage['unsupported_or_failed'], 3)
        checks = s.gh_state['audits']['org/r']['checks']
        self.assertEqual(checks['dependabot']['status'], 'unsupported')
        self.assertEqual(checks['run']['status'], 'not audited')
        self.assertEqual(checks['issue']['status'], 'audited')

    def test_issue_page_rotation_and_no_loss(self):
        net = Network([repo('org/r')])
        net.responses['/repos/org/r/issues'] = [{'number': n, 'title': 'Bug'} for n in range(201)]
        s = self.source(net, OFFICE_GITHUB_PAGE_LIMIT='1')
        self.assertEqual(len(s._poll_github()[0]), 100)
        self.assertEqual(s.github_coverage['partial_checks'], 1)
        self.assertEqual(len(s._poll_github()[0]), 200)
        self.assertEqual(len(s._poll_github()[0]), 201)
        self.assertEqual(s.gh_state['pages']['org/r:issue'], 1)

    def test_evidence_dispatch_no_actions_fallback(self):
        net = Network()
        s = self.source(net)
        s.owners.add('org')
        for kind, endpoint in [('issue', 'issues'), ('dependabot', 'dependabot/alerts'), ('code-scanning', 'code-scanning/alerts')]:
            net.responses['/repos/org/r/%s/9' % endpoint] = {'number': 9, 'body': 'fixture evidence'}
            task = {'source': 'github', 'source_key': 'github:org/r:%s:9' % kind}
            for method in (s.evidence, s.deep_evidence):
                self.assertIn('fixture evidence', method(task)[0]['text'])
                self.assertTrue(net.calls[-1].endswith('/%s/9' % endpoint))
        self.assertFalse(any('actions' in call for call in net.calls))
        with self.assertRaises(ValueError):
            s.evidence({'source': 'github', 'source_key': 'github:org/r:unknown:9'})

    def test_inventory_partial_page_failure_keeps_readable_results(self):
        net = Network([repo('org/r%03d' % n) for n in range(101)])
        net.responses[('/user/repos', 2)] = urllib.error.HTTPError(
            'https://api.github.com', 503, 'fixture', Message(), None)
        s = self.source(net)
        self.assertEqual(len(s.repositories()), 100)
        self.assertEqual(len(s.gh_state['inventory_errors']), 1)
        self.assertEqual(s.gh_state['inventory_errors'][0]['status'], 'partial')

    def test_incomplete_rotation_is_partial_not_healthy(self):
        s = self.source(Network([repo('org/r%02d' % n) for n in range(12)]))
        s.poll()
        self.assertEqual(s.state['github']['status'], 'partial')
        self.assertEqual(s.github_coverage['covered'], 10)
        s.poll()
        self.assertEqual(s.github_coverage['covered'], 12)
        self.assertEqual(s.state['github']['status'], 'ok')

    def test_transport_get_only(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return b'{}'
        s = Sources({'OFFICE_GITHUB_TOKEN': 'fixture'})
        with patch('sources._opener.open', return_value=Response()) as opened:
            s._gh('/user')
            self.assertEqual(opened.call_args.args[0].get_method(), 'GET')


if __name__ == '__main__':
    unittest.main()
