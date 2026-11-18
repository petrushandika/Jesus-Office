'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

type Task = { id: string; title: string; source: string; source_url?: string; status: string; report: unknown; report_hash: string | null; created_at: string; updated_at: string; decision: unknown; execution_report: unknown; error?: string | null };
type Snapshot = { tasks: Task[]; connectors: { name: string; status: string; detail: string }[]; capabilities: unknown[]; paused?: boolean };
const plain = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2);
function sourceLink(value?: string) {
  try { const url = new URL(value ?? ''); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}

export default function OperationsPanel({ authenticated }: { authenticated: boolean }) {
  const [signedIn, setSignedIn] = useState(authenticated);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState('');
  const loading = useRef(false);
  const request = useCallback(async (path: string, body?: unknown) => {
    const response = await fetch('/api/operations/' + path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401) { setSignedIn(false); setSnapshot(null); }
    if (!response.ok) throw new Error(response.status === 409 ? 'Report changed or task no longer awaiting approval. Reload and review again.' : response.status === 429 ? 'Too many attempts. Try again later.' : 'Operation failed. Check access or service availability.');
    return response.json();
  }, []);
  const reload = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const data = await request('tasks') as Snapshot;
      if (!Array.isArray(data.tasks) || !Array.isArray(data.connectors) || !Array.isArray(data.capabilities)) throw new Error('Invalid service response.');
      setSnapshot(data); setUpdated(new Date().toLocaleTimeString()); setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to reload.'); }
    finally { loading.current = false; }
  }, [request]);
  useEffect(() => {
    if (!signedIn) return;
    const first = setTimeout(() => void reload(), 0);
    const interval = setInterval(() => void reload(), 10_000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, [signedIn, reload]);
  async function mutate(path: string, body: unknown) {
    setBusy(true); setMessage('');
    try { await request(path, body); await reload(); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Operation failed.'); return false; }
    finally { setBusy(false); }
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    const password = String(new FormData(form).get('password') ?? '');
    form.reset(); setBusy(true); setMessage('');
    try { await request('login', { password }); setSignedIn(true); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Login failed.'); }
    finally { setBusy(false); }
  }
  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    const source_url = String(values.get('source_url') ?? '').trim();
    if (await mutate('tasks', { title: values.get('title'), description: values.get('description'), source: 'manual', ...(source_url ? { source_url } : {}) })) form.reset();
  }
  async function decide(task: Task, decision: 'approve' | 'reject') {
    if (!task.report_hash || !window.confirm(`${decision === 'approve' ? 'Approve bounded read-only execution' : 'Reject task'}: ${task.title}?\n\nReport hash: ${task.report_hash}\nOnly this exact report is being decided. Coding and deployment are not supported.`)) return;
    await mutate(`tasks/${encodeURIComponent(task.id)}/decision`, { decision, report_hash: task.report_hash });
  }
  return <>
    <p role="status" aria-live="polite" className="ops-message">{message}</p>
    {!signedIn ? <section className="ops-card"><h2>Operator sign in</h2><p>Use your operator password. A secure session lasts up to eight hours.</p><form onSubmit={login}><label htmlFor="operator-password">Password</label><input id="operator-password" name="password" type="password" autoComplete="current-password" maxLength={4096} required /><button disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button></form></section> : <>
      <div className="ops-toolbar"><button disabled={busy} onClick={() => void reload()}>Reload</button><button disabled={busy || typeof snapshot?.paused !== 'boolean'} onClick={() => void mutate('pause', { paused: !snapshot?.paused })}>{snapshot?.paused ? 'Resume intake' : 'Pause intake'}</button><button disabled={busy} onClick={async () => { setBusy(true); try { await request('logout', {}); setSnapshot(null); setSignedIn(false); } catch { setMessage('Logout failed. Try again.'); } finally { setBusy(false); } }}>Log out</button><span>{snapshot?.paused ? 'Intake paused' : snapshot?.paused === false ? 'Intake active' : 'Intake state unknown'} · {updated ? `Updated ${updated}` : 'Loading…'} · polls every 10 seconds</span></div>
      <section className="ops-card"><h2>Execution boundary</h2><p><strong>Read-only investigation</strong> is supported. Automatic analysis produces a report, then waits for explicit human approval before bounded read-only execution. Coding, arbitrary shell commands and deployment are unsupported or blocked. Reloading never approves work.</p><p>Reports are delivered here first, and by email when the email connector below shows ok. Opening an email link never approves anything.</p><h3>Current capabilities</h3>{snapshot?.capabilities.length ? <ul className="ops-list">{snapshot.capabilities.map((capability, index) => <li key={index}>{plain(capability)}</li>)}</ul> : <p>No capabilities reported yet.</p>}</section>
      <section className="ops-card"><h2>Connectors</h2>{snapshot?.connectors.length ? <ul className="ops-list">{snapshot.connectors.map((connector, index) => <li key={index}><strong>{connector.name}</strong> <span className={connector.status === 'ok' ? 'ops-badge ops-ok' : 'ops-badge ops-bad'}>{connector.status}</span><p className="ops-muted">{connector.detail}</p></li>)}</ul> : <p>No connector statuses available.</p>}</section>
      <section className="ops-card"><h2>Add manual task</h2><form onSubmit={addTask}><label htmlFor="task-title">Title</label><input id="task-title" name="title" maxLength={200} required /><label htmlFor="task-description">Investigation request</label><textarea id="task-description" name="description" rows={4} maxLength={12000} required /><label htmlFor="task-source-url">Source URL (optional, HTTP or HTTPS)</label><input id="task-source-url" name="source_url" type="url" maxLength={2048} /><button type="submit" disabled={busy}>Queue for analysis</button></form></section>
      <section aria-labelledby="task-list-title"><h2 id="task-list-title">Tasks {snapshot ? `(${snapshot.tasks.length})` : ''}</h2>{snapshot?.tasks.length === 0 && <p>No tasks yet.</p>}{snapshot?.tasks.map(task => {
        const link = sourceLink(task.source_url);
        const awaiting = ['waiting_approval', 'awaiting_approval', 'pending_approval'].includes(task.status) && !!task.report_hash && !task.decision;
        return <article key={task.id} className="ops-card"><div className="ops-task-heading"><h3>{task.title}</h3><span className="ops-badge">{task.status}</span></div><p>{task.source} · <code>{task.id}</code></p>{link && <a href={link} target="_blank" rel="noopener noreferrer">Open source</a>}<p className="ops-muted">Created {task.created_at} · Updated {task.updated_at}</p>{task.error && <p className="ops-message">Last error: {task.error}</p>}<h4>Analysis report</h4><pre>{plain(task.report) || 'Analysis not available yet.'}</pre><p>Report hash: <code>{task.report_hash || 'Not available'}</code></p>{awaiting && <div className="ops-toolbar"><button disabled={busy} onClick={() => void decide(task, 'approve')}>Review and approve</button><button className="ops-reject" disabled={busy} onClick={() => void decide(task, 'reject')}>Review and reject</button></div>}{task.decision != null && <p>Decision: {plain(task.decision)}</p>}<h4>Execution report</h4><pre>{plain(task.execution_report) || 'No execution report. Approval does not imply unsupported actions will run.'}</pre></article>;
      })}</section>
    </>}
  </>;
}
