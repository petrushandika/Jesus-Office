"""Combine remote findings with bounded read-only local checks."""
from sources import Sources
from local_audit import LocalSources
from safety import redact


class Connectors:
    def __init__(self, env, store):
        self.remote = Sources(env, store=store)
        self.local = LocalSources(env, store)
        self.local_state = {'name': 'local', 'status': 'unavailable', 'detail': 'Not scanned yet.'}

    def poll(self):
        items = self.remote.poll()
        try:
            local, detail = self.local.poll()
            items.extend(local)
            state = self.local.store.setting('local_audit_v1', {}).get('status', 'unavailable')
            self.local_state = {'name': 'local', 'status': 'ok' if state == 'available' else state, 'detail': detail}
        except Exception as error:
            self.local_state = {'name': 'local', 'status': 'unavailable', 'detail': 'Local scan unavailable: ' + redact(str(error))[:250]}
        return items

    def statuses(self):
        return self.remote.statuses() + [self.local_state]

    def evidence(self, task):
        return self.local.evidence(task) if task['source'] == 'local' else self.remote.evidence(task)

    def deep_evidence(self, task):
        return self.local.evidence(task) if task['source'] == 'local' else self.remote.deep_evidence(task)
