'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

type Task = { id: string; title: string; source: string; source_url?: string; status: string; report: unknown; report_hash: string | null; created_at: string; updated_at: string; decision: unknown; execution_report: unknown; error?: string | null };
type Snapshot = { tasks: Task[]; connectors: { name: string; status: string; detail: string }[]; capabilities: unknown[]; paused?: boolean };
const plain = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2);
function sourceLink(value?: string) {
  try { const url = new URL(value ?? ''); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}

// Render report Markdown as React elements (headings, bullets, **bold**). Never injects HTML.
function inline(text: string) {
  const code = (value: string) => value.split(/(`[^`]+`)/g).map((part, index) => part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <code key={index}>{part.slice(1, -1)}</code> : part);
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={index}>{code(part.slice(2, -2))}</strong> : <span key={index}>{code(part)}</span>);
}
function Report({ text }: { text: string }) {
  return <div className="ops-report">{text.split('\n').map((line, index) => {
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) return heading[1].length <= 1 ? <p key={index} className="ops-report-title">{inline(heading[2])}</p> : <p key={index} className="ops-report-heading">{inline(heading[2])}</p>;
    const bullet = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (bullet) return <p key={index} className="ops-report-bullet">{inline(bullet[1])}</p>;
    return line.trim() ? <p key={index}>{inline(line)}</p> : null;
  })}</div>;
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
      setSnapshot(data); setUpdated(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })); setMessage('');
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
  const awaitingCount = snapshot?.tasks.filter(task => task.status === 'awaiting_approval' && !task.decision).length ?? 0;
  const statusClass = (status: string) => status === 'completed' ? 'ops-badge ops-ok' : status === 'failed' || status === 'rejected' ? 'ops-badge ops-bad' : status === 'awaiting_approval' ? 'ops-badge ops-wait' : 'ops-badge';
  return <>
    <p role="status" aria-live="polite" className="ops-message">{message}</p>
    {!signedIn ? <section className="ops-section"><div className="ops-card"><h2>Operator sign in</h2><p className="ops-muted">Operator access only. A session lasts up to eight hours.</p><form onSubmit={login}><label htmlFor="operator-password">Password</label><input id="operator-password" name="password" type="password" autoComplete="current-password" maxLength={4096} required /><button className="ops-primary" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button></form></div></section> : <>
      <div className="ops-toolbar"><button disabled={busy} onClick={() => void reload()}>Reload</button><button disabled={busy || typeof snapshot?.paused !== 'boolean'} onClick={() => void mutate('pause', { paused: !snapshot?.paused })}>{snapshot?.paused ? 'Resume intake' : 'Pause intake'}</button><button disabled={busy} onClick={async () => { setBusy(true); try { await request('logout', {}); setSnapshot(null); setSignedIn(false); } catch { setMessage('Logout failed. Try again.'); } finally { setBusy(false); } }}>Log out</button><span className="ops-status">{snapshot?.paused ? 'Intake paused' : snapshot?.paused === false ? 'Intake active' : 'Intake state unknown'} · {updated ? `Updated ${updated}` : 'Loading…'} · {awaitingCount} awaiting your decision</span></div>
      <section className="ops-section" aria-labelledby="task-list-title"><p className="ops-eyebrow">Queue</p><h2 id="task-list-title">Tasks {snapshot ? `(${snapshot.tasks.length})` : ''}</h2>{snapshot?.tasks.length === 0 && <p className="ops-muted">No tasks yet.</p>}{snapshot?.tasks.map(task => {
        const link = sourceLink(task.source_url);
        const awaiting = ['waiting_approval', 'awaiting_approval', 'pending_approval'].includes(task.status) && !!task.report_hash && !task.decision;
        return <article key={task.id} className="ops-card"><p className="ops-meta">{task.created_at.slice(0, 16).replace('T', ' ')} · {task.source}{link && <> · <a href={link} target="_blank" rel="noopener noreferrer">Open source</a></>}</p><div className="ops-task-heading"><h3>{task.title}</h3><span className={statusClass(task.status)}>{task.status.replace('_', ' ')}</span></div>{task.error && <p className="ops-message">Last error: {task.error}</p>}{task.report ? <details><summary>Read the report</summary><Report text={plain(task.report)} /></details> : <p className="ops-muted">Analysis in progress.</p>}<p className="ops-meta">Report <code title={task.report_hash || undefined}>{task.report_hash ? task.report_hash.slice(0, 12) : 'pending'}</code> · ID <code>{task.id}</code></p>{awaiting && <div className="ops-toolbar"><button className="ops-primary" disabled={busy} onClick={() => void decide(task, 'approve')}>Review and approve</button><button className="ops-reject" disabled={busy} onClick={() => void decide(task, 'reject')}>Review and reject</button></div>}{task.decision != null && <p className="ops-meta">Decision: {plain(task.decision)}</p>}{task.execution_report != null && task.execution_report !== '' && <details open><summary>Execution report</summary><Report text={plain(task.execution_report)} /></details>}</article>;
      })}</section>
      <section className="ops-section"><p className="ops-eyebrow">Manual</p><h2>Add a task</h2><div className="ops-card"><form onSubmit={addTask}><label htmlFor="task-title">Title</label><input id="task-title" name="title" maxLength={200} required /><label htmlFor="task-description">Investigation request</label><textarea id="task-description" name="description" rows={4} maxLength={12000} required /><label htmlFor="task-source-url">Source URL (optional, HTTP or HTTPS)</label><input id="task-source-url" name="source_url" type="url" maxLength={2048} /><button className="ops-primary" type="submit" disabled={busy}>Queue for analysis</button></form></div></section>
      <section className="ops-section"><p className="ops-eyebrow">Sources</p><h2>Connectors</h2>{snapshot?.connectors.length ? <ul className="ops-list">{snapshot.connectors.map((connector, index) => <li key={index}><strong>{connector.name}</strong> <span className={connector.status === 'ok' ? 'ops-badge ops-ok' : 'ops-badge ops-bad'}>{connector.status}</span><p className="ops-muted">{connector.detail}</p></li>)}</ul> : <p className="ops-muted">No connector statuses available.</p>}</section>
      <section className="ops-section"><p className="ops-eyebrow">Limits</p><h2>Execution boundary</h2><div className="ops-card"><p><strong>Read-only investigation</strong> is supported. Automatic analysis produces a report, then waits for explicit human approval before bounded read-only execution. Coding, arbitrary shell commands and deployment are unsupported or blocked. Reloading never approves work.</p><p className="ops-muted">Reports are delivered here first, and by email when the email connector shows ok. Opening an email link never approves anything.</p><h4>Current capabilities</h4>{snapshot?.capabilities.length ? <ul className="ops-list">{snapshot.capabilities.map((capability, index) => <li key={index}>{plain(capability)}</li>)}</ul> : <p className="ops-muted">No capabilities reported yet.</p>}</div></section>
    </>}
  </>;
}
