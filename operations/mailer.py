"""Email delivery to one fixed recipient. SMTP (app password) or Gmail API (OAuth refresh token)."""
import base64, json, re, smtplib, ssl, urllib.error, urllib.parse, urllib.request
from email.message import EmailMessage
from safety import clip, redact

RECIPIENT = re.compile(r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
LINK = 'https://office.petrushandika.com/operations'
SUBJECTS = {'approval': 'Jesus Office — laporan menunggu approval', 'result': 'Jesus Office — laporan hasil'}


class MailError(Exception):
    pass


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def compose(task, kind, sender, recipient):
    msg = EmailMessage()
    msg['Subject'] = SUBJECTS[kind]
    msg['From'], msg['To'] = sender, recipient
    title = re.sub(r'[\r\n]+', ' ', task.get('title') or '')[:200]
    body = task.get('report') if kind == 'approval' else task.get('execution_report')
    footer = ('Tidak ada tindakan yang dijalankan sebelum lo approve di dashboard. Link ini hanya membuka halaman review; '
              'membuka link TIDAK menyetujui apa pun.' if kind == 'approval'
              else 'Eksekusi di atas hanya investigasi read-only yang sudah lo approve.')
    msg.set_content('Task: %s\nID: %s\nReport hash: %s\n\n%s\n\nReview: %s\n\n%s\n' % (
        title, task.get('id'), task.get('report_hash'), clip(redact(body), 8000), LINK, footer))
    return msg


class Mailer:
    def __init__(self, env):
        self.recipient = env.get('OFFICE_REPORT_EMAIL', '')
        if not RECIPIENT.match(self.recipient):
            self.recipient = ''
        self.smtp = {k: env.get('OFFICE_SMTP_' + k.upper(), '') for k in ('host', 'user', 'password')}
        self.gmail = {k: env.get('OFFICE_GMAIL_' + k.upper(), '') for k in ('client_id', 'client_secret', 'refresh_token')}
        self.mode = ('smtp' if all(self.smtp.values()) else 'gmail' if all(self.gmail.values()) else None) if self.recipient else None

    @property
    def configured(self):
        return self.mode is not None

    def send(self, task, kind):
        if not self.configured:
            raise MailError('not configured')
        if self.mode == 'smtp':
            msg = compose(task, kind, self.smtp['user'], self.recipient)
            with smtplib.SMTP(self.smtp['host'], 587, timeout=30) as s:
                s.starttls(context=ssl.create_default_context())
                s.login(self.smtp['user'], self.smtp['password'])
                refused = s.send_message(msg, to_addrs=[self.recipient])
            if refused:
                raise MailError('recipient refused')
            return msg.get('Message-ID') or 'smtp-accepted'
        return self._gmail(task, kind)

    def _call(self, req):
        try:
            with _opener.open(req, timeout=30) as res:
                return json.loads(res.read(200_000))
        except urllib.error.HTTPError as e:
            raise MailError('HTTP %d' % e.code)

    def _gmail(self, task, kind):
        token = self._call(urllib.request.Request('https://oauth2.googleapis.com/token', data=urllib.parse.urlencode({
            'client_id': self.gmail['client_id'], 'client_secret': self.gmail['client_secret'],
            'refresh_token': self.gmail['refresh_token'], 'grant_type': 'refresh_token'}).encode()))['access_token']
        auth = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
        raw = base64.urlsafe_b64encode(compose(task, kind, 'me', self.recipient).as_bytes()).decode()
        sent = self._call(urllib.request.Request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
                                                 data=json.dumps({'raw': raw}).encode(), headers=auth))
        meta = self._call(urllib.request.Request(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages/%s?format=metadata&metadataHeaders=To' % sent['id'], headers=auth))
        to = ' '.join(h['value'] for h in meta.get('payload', {}).get('headers', []) if h.get('name') == 'To')
        if 'SENT' not in meta.get('labelIds', []) or self.recipient not in to:
            raise MailError('send not verified')
        return sent['id']
