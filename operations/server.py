"""Jesus Office operations service. Local-only HTTP API + background worker.

Run: python3 operations/server.py  (env loaded by systemd EnvironmentFile)
Kill switch: POST /pause {"paused": true}  or create the file $OFFICE_OPS_DATA/PAUSE
"""
import hmac, json, os, re, signal, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from store import Store  # noqa: E402

CAPABILITIES = [
    'Intake otomatis tiap 15 menit: GitHub Actions gagal (repo allowlist), Jira (JQL dikonfigurasi), Techcare (assignee dikonfigurasi)',
    'Analisis + laporan awal oleh Astronacci 9Router, lalu MENUNGGU approval manusia',
    'Setelah approve: investigasi lanjutan read-only (log job, komentar tiket) + rencana implementasi',
    'Belum aktif: menulis kode, push/PR, update tiket, deploy (butuh executor terpisah + approval per tindakan)',
]
TASK_ID = re.compile(r'^/tasks/([a-f0-9]{16})/decision$')
MAX_BODY = 16384


def make_server(store, token, worker, port=18160, operator='operator'):
    if not token or len(token) < 32:
        raise SystemExit('OFFICE_OPS_TOKEN missing or too short')

    class Handler(BaseHTTPRequestHandler):
        server_version = 'office-ops'
        sys_version = ''

        def log_message(self, *args):  # never log request contents
            pass

        def _send(self, status, data=None):
            body = json.dumps(data if data is not None else {}).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _authorized(self):
            header = self.headers.get('Authorization', '')
            return header.startswith('Bearer ') and hmac.compare_digest(header[7:].encode(), token.encode())

        def _body(self):
            length = int(self.headers.get('Content-Length') or 0)
            if length <= 0 or length > MAX_BODY or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                raise ValueError
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError
            return data

        def do_GET(self):
            if self.path == '/health':
                return self._send(200, {'ok': True})
            if not self._authorized():
                return self._send(401)
            if self.path == '/tasks':
                return self._send(200, {'tasks': store.list_tasks(), 'paused': store.paused(), 'capabilities': CAPABILITIES,
                                        'connectors': worker.statuses() if worker else []})
            if self.path == '/snapshot':
                return self._send(200, store.snapshot())
            self._send(404)

        def do_POST(self):
            if not self._authorized():
                return self._send(401)
            try:
                data = self._body()
            except (ValueError, json.JSONDecodeError):
                return self._send(400)
            if self.path == '/tasks':
                title, desc, url = data.get('title'), data.get('description'), data.get('source_url')
                if (data.get('source') != 'manual' or not isinstance(title, str) or not isinstance(desc, str)
                        or not title.strip() or not desc.strip() or len(title) > 200 or len(desc) > 12000
                        or (url is not None and (not isinstance(url, str) or not re.match(r'^https?://', url) or len(url) > 2048))):
                    return self._send(400)
                tid = store.add_task('manual', 'manual:' + os.urandom(8).hex(), 'audit', title.strip(), desc.strip(), url)
                return self._send(201, {'id': tid})
            if self.path == '/pause':
                if not isinstance(data.get('paused'), bool):
                    return self._send(400)
                store.set_paused(data['paused'])
                return self._send(200, {'paused': store.paused()})
            match = TASK_ID.match(self.path)
            if match:
                h = data.get('report_hash')
                if data.get('decision') not in ('approve', 'reject') or not isinstance(h, str) or not re.match(r'^[a-f0-9]{64}$', h):
                    return self._send(400)
                result = store.decide(match.group(1), data['decision'], h, operator)
                return self._send({'ok': 200, 'missing': 404}.get(result, 409), {'result': result})
            self._send(404)

    return ThreadingHTTPServer(('127.0.0.1', port), Handler)


def main():
    from llm import LLM
    from mailer import Mailer
    from sources import Sources
    from worker import Worker
    env = os.environ
    data = env.get('OFFICE_OPS_DATA') or sys.exit('OFFICE_OPS_DATA missing')
    store = Store(os.path.join(data, 'operations.db'), pause_file=os.path.join(data, 'PAUSE'))
    store.recover()
    llm = LLM(env.get('OFFICE_LLM_BASE_URL', ''), env.get('OFFICE_LLM_API_KEY', ''), env.get('OFFICE_LLM_MODEL', ''),
              int(env.get('OFFICE_LLM_MAX_PER_HOUR', '20')))
    operator = env.get('OFFICE_OPERATOR_ID', 'operator')
    worker = Worker(store, llm, Sources(env), Mailer(env), operator=operator,
                    poll_seconds=int(env.get('OFFICE_POLL_SECONDS', '900')))
    httpd = make_server(store, env.get('OFFICE_OPS_TOKEN', ''), worker, int(env.get('OFFICE_OPS_PORT', '18160')), operator)
    stop = threading.Event()
    threading.Thread(target=worker.loop, args=(stop,), daemon=True).start()
    signal.signal(signal.SIGTERM, lambda *_: (stop.set(), threading.Thread(target=httpd.shutdown).start()))
    print('office-ops listening 127.0.0.1:%d' % httpd.server_address[1], flush=True)
    httpd.serve_forever()


if __name__ == '__main__':
    main()
