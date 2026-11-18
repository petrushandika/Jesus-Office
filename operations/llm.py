"""Astronacci 9Router chat client with hourly budget. The model only writes text; it never gets tools."""
import json, threading, time, urllib.error, urllib.request

ROUTER = 'https://9router.ct.astronacci.co.id/v1'


class RetryLater(Exception):
    pass


class LLMError(Exception):
    pass


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


class LLM:
    def __init__(self, base_url, api_key, model, max_per_hour=20):
        if base_url.rstrip('/') != ROUTER:
            raise ValueError('LLM base URL must be the Astronacci 9Router')
        if not api_key or not model:
            raise ValueError('LLM credentials missing')
        self.url, self.key, self.max = ROUTER + '/chat/completions', api_key, max_per_hour
        self.models = [m.strip() for m in model.split(',') if m.strip()]
        self.model = self.models[0]
        self.calls, self.lock = [], threading.Lock()

    def _budget(self):
        with self.lock:
            cutoff = time.time() - 3600
            self.calls = [t for t in self.calls if t > cutoff]
            if len(self.calls) >= self.max:
                raise RetryLater('hourly LLM budget reached')
            self.calls.append(time.time())

    def chat(self, system, user, max_tokens=3000):
        """Try configured models in order; a 429 on one model falls through to the next."""
        self._budget()
        last = None
        for model in self.models:
            try:
                text = self._call(model, system, user, max_tokens)
                self.model = model
                return text
            except RetryLater as e:
                last = e
        raise last

    def _call(self, model, system, user, max_tokens):
        body = json.dumps({'model': model, 'stream': False, 'max_tokens': max_tokens, 'temperature': 0.2,
                           'messages': [{'role': 'system', 'content': system},
                                        {'role': 'user', 'content': user[:24000]}]}).encode()
        req = urllib.request.Request(self.url, data=body, headers={
            'Authorization': 'Bearer ' + self.key, 'Content-Type': 'application/json'})
        try:
            with _opener.open(req, timeout=180) as res:
                data = json.loads(res.read(2_000_000))
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                raise RetryLater('router HTTP %d' % e.code)
            raise LLMError('router HTTP %d' % e.code)
        except (urllib.error.URLError, TimeoutError) as e:
            raise RetryLater('router unreachable: %s' % type(e).__name__)
        try:
            text = data['choices'][0]['message']['content']
        except (KeyError, IndexError, TypeError):
            raise LLMError('router returned no message')
        if not isinstance(text, str) or not text.strip():
            raise LLMError('router returned empty text')
        return text.strip()[:12000]
