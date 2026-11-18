'use client';

import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import DashboardShell, { type DeskView } from './dashboard-shell';
import { describeTask, excerpt, reportBlocks, taskBrief, priorityView, comparePriority, type TaskPriority } from '../../lib/operations-view';

type Task = { priority?: TaskPriority; source_ref?: string; id: string; title: string; source: string; source_url?: string; status: string; report: unknown; report_hash: string | null; created_at: string; updated_at: string; decision: unknown; execution_report: unknown; error?: string | null };
type Connector = { name: string; status: string; detail: string };
type Capability = string | { text: string; active?: boolean };
type Snapshot = { tasks: Task[]; connectors: Connector[]; capabilities: Capability[]; paused?: boolean };

const plain = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2);
function sourceLink(value?: string) {
  try { const url = new URL(value ?? ''); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
const clock = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const when = (iso: string) => { const date = new Date(iso); return Number.isNaN(date.getTime()) ? '' : clock.format(date).replace(',', ' ·') + ' WIB'; };
const WAITING = ['waiting_approval', 'awaiting_approval', 'pending_approval'];
const ACTIVE = ['queued', 'analyzing', 'approved', 'executing', 'running'];
const STATUS_WORDS: Record<string, string> = { queued: 'Queued', analyzing: 'Writing report', approved: 'Accepted, queued', executing: 'Following up', running: 'Running', completed: 'Follow-up complete', rejected: 'Rejected', failed: 'Failed' };

// Report text is untrusted model output: rendered as React text only (bold, italic, inline code). Never HTML.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|(?<![\w*])\*[^*\s][^*]*\*(?![\w*]))/g).map((part, index) => {
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{inline(part.slice(2, -2))}</strong>;
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}
function Report({ text }: { text: string }) {
  return <div className="ops-report">{reportBlocks(text).map((block, index) => {
    switch (block.type) {
      case 'heading': return block.level === 2 ? <h4 key={index}>{inline(block.text)}</h4> : <h5 key={index}>{inline(block.text)}</h5>;
      case 'note': return <p key={index} className="ops-report-note">{inline(block.text)}</p>;
      case 'label': return <p key={index} className="ops-report-label">{inline(block.text)}</p>;
      case 'field': return <p key={index} className="ops-report-field"><strong>{inline(block.label)}:</strong>{' '}{inline(block.text)}</p>;
      case 'item': return <p key={index} className="ops-report-item" data-depth={block.depth}><span aria-hidden="true">{block.marker || '–'}</span><span>{inline(block.text)}</span></p>;
      case 'quote': return <blockquote key={index}>{inline(block.text)}</blockquote>;
      case 'table': return <div key={index} className="ops-report-table"><table><thead><tr>{block.head.map((cell, c) => <th key={c}>{inline(cell)}</th>)}</tr></thead><tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>;
      default: return <p key={index}>{inline(block.text)}</p>;
    }
  })}</div>;
}
function decisionLine(value: unknown) {
  try {
    const record = typeof value === 'string' ? JSON.parse(value) : value as { decision?: string; by?: string; at?: string };
    if (record?.decision) return `${record.decision === 'approve' ? 'Accepted' : 'Rejected'}${record.by ? ` by ${record.by}` : ''}${record.at ? `, ${when(record.at)}` : ''}`;
  } catch { /* fall through to raw text */ }
  return plain(value);
}

export default function OperationsPanel({ authenticated }: { authenticated: boolean }) {
  const [signedIn, setSignedIn] = useState(authenticated);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<DeskView>('overview');
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [updated, setUpdated] = useState('');
  const loading = useRef(false);
  const request = useCallback(async (path: string, body?: unknown) => {
    const response = await fetch('/api/operations/' + path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401) { setSignedIn(false); setSnapshot(null); }
    if (!response.ok) throw new Error(response.status === 409 ? 'This report changed or was already decided. Read the latest version first.' : response.status === 429 ? 'Too many attempts. Wait a few minutes and try again.' : response.status === 401 ? 'Email or password is incorrect, or the session has ended.' : 'The operations service did not respond. Try again shortly.');
    return response.json();
  }, []);
  const reload = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const data = await request('tasks') as Snapshot;
      if (!Array.isArray(data.tasks) || !Array.isArray(data.connectors) || !Array.isArray(data.capabilities)) throw new Error('The operations service sent an unexpected response.');
      setSnapshot(data); setUpdated(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date())); setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to refresh.'); }
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
    catch (error) { setMessage(error instanceof Error ? error.message : 'That did not work.'); return false; }
    finally { setBusy(false); }
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');
    form.reset(); setBusy(true); setMessage('');
    try { await request('login', { email, password }); setSignedIn(true); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Sign in failed.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { await request('logout', {}); setSnapshot(null); setSignedIn(false); setMessage(''); }
    catch { setMessage('Sign out failed. Try again.'); }
    finally { setBusy(false); }
  }
  async function decide(task: Task, decision: 'approve' | 'reject') {
    const name = describeTask(task).title;
    if (!task.report_hash || !window.confirm(decision === 'approve'
      ? `Accept and run the read-only follow-up for “${name}”?\n\nThis covers report ${task.report_hash.slice(0, 12)} only. No code, pull request or deploy will run.`
      : `Reject “${name}”?\n\nThe agents stop here and nothing else runs for this task.`)) return;
    await mutate(`tasks/${encodeURIComponent(task.id)}/decision`, { decision, report_hash: task.report_hash });
  }
  const status = <p role="status" aria-live="polite" className="ops-message">{message}</p>;

  if (!signedIn) return <div className="ops-login-layout">
    <section className="ops-login-story" aria-labelledby="login-story-title">
      <Link className="ops-brand" href="/">Jesus Office<span>Private operations</span></Link>
      <div><p className="ops-eyebrow">Project operations</p><h1 id="login-story-title">Your projects.<br/>One workspace<span>.</span></h1><p>Findings from your projects, in one workspace. Review the evidence and choose the next step.</p></div>
      <p className="ops-login-note">Review first. Act with approval.</p>
    </section>
    <section className="ops-login-panel" aria-labelledby="login-title">
      <div className="ops-login-box"><p className="ops-eyebrow">Welcome back</p><h2 id="login-title">Sign in</h2><p className="ops-login-description">Use your operator account to open the workspace.</p>
      <form className="ops-signin" onSubmit={login}>
        <label htmlFor="operator-email">Email address</label>
        <input id="operator-email" name="email" type="email" autoComplete="username" maxLength={254} required />
        <label htmlFor="operator-password">Password</label>
        <input id="operator-password" name="password" type="password" autoComplete="current-password" maxLength={4096} required />
        <button className="ops-primary" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="ops-hint">Private access. Your session lasts up to eight hours.</p>
      </form>{status}<Link className="ops-login-back" href="/">Back to the city</Link></div>
    </section>
  </div>;

  const tasks = [...(snapshot?.tasks ?? [])].sort(comparePriority);
  const waiting = tasks.filter(task => WAITING.includes(task.status) && !!task.report_hash && !task.decision);
  const active = tasks.filter(task => ACTIVE.includes(task.status) && !waiting.includes(task));
  const finished = tasks.filter(task => !waiting.includes(task) && !active.includes(task));
  const counts = { overview: tasks.length, waiting: waiting.length, active: active.length, decided: finished.length };
  const matches = (task: Task) => (sourceFilter === 'all' || task.source === sourceFilter)
    && (priorityFilter === 'all' || priorityView(task.priority).level === priorityFilter)
    && (!query.trim() || [task.title, task.source_ref, taskBrief(plain(task.report))?.Judul].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const visibleWaiting = waiting.filter(matches), visibleActive = active.filter(matches), visibleFinished = finished.filter(matches);
  const titles = { overview: 'Overview', waiting: 'Needs decision', active: 'In progress', decided: 'History' };
  const lede = !snapshot ? 'Loading your workspace…' : view === 'waiting' ? 'Review the evidence. Accept a follow-up or stop it here.'
    : view === 'active' ? 'Reports being prepared and follow-ups you have accepted.' : view === 'decided' ? 'Your decisions and their follow-up results.'
    : 'A clear view of what needs your attention.';

  const card = (task: Task) => {
    const view = describeTask(task), link = sourceLink(task.source_url), text = plain(task.report);
    const isWaiting = waiting.includes(task);
    const brief = taskBrief(text), priority = priorityView(task.priority);
    const summary = brief ? '' : text ? excerpt(text) : '';
    const meta = [...view.meta];
    if (task.source_ref && !meta.includes(task.source_ref)) meta.push(task.source_ref);
    if (!isWaiting) meta.push(STATUS_WORDS[task.status] ?? task.status.replace(/_/g, ' '));
    return <article key={task.id} className="ops-task" data-status={task.status} data-priority={priority.level}>
      <p className="ops-task-meta"><span className="ops-task-tags"><strong>Source:</strong>{meta.map((part, index) => <span key={index}>{part}</span>)}</span><time dateTime={task.created_at}>{when(task.created_at)}</time></p>
      <p className="ops-priority"><span className="ops-priority-badge" data-level={priority.level}>{priority.label}</span><span>{priority.basis}</span></p>
      <h3>{brief?.Judul || view.title}</h3>
      <p className="ops-priority-reason">{priority.reason}</p>
      {brief && <dl className="ops-brief">{['Masalah', 'Target', 'Kondisi sekarang', 'Usulan'].filter(key => brief[key]).map(key => <div key={key}><dt>{key}</dt><dd>{brief[key]}</dd></div>)}</dl>}
      {summary && <p className="ops-task-summary">{summary}</p>}
      {task.error && <p className="ops-task-error">Last attempt failed: {task.error}</p>}
      {!text && <p className="ops-task-summary">The report is being written.</p>}
      {text && <details>
        <summary>Read the report</summary>
        <Report text={brief ? text.replace(/^## Inti\s*\n[\s\S]*?(?=^## |$(?![\s\S]))/m, '') : text} />
      </details>}
      {isWaiting && <div className="ops-decision">
          <div className="ops-decision-actions">
            <button className="ops-primary" disabled={busy} onClick={() => void decide(task, 'approve')}>Accept</button>
            <button className="ops-quiet" disabled={busy} onClick={() => void decide(task, 'reject')}>Reject</button>
          </div>
          <p className="ops-hint">Accept runs a read-only investigation and implementation plan for this report. No code changes or deploy. Reject stops this task.</p>
        </div>}
      <p className="ops-task-foot">
        {link && <a href={link} target="_blank" rel="noopener noreferrer">{view.linkLabel}</a>}
        {task.decision != null && <span>{decisionLine(task.decision)}</span>}
        <span className="ops-ref" title={task.report_hash ? `Report ${task.report_hash}` : undefined}>Ref {task.id.slice(0, 8)}</span>
      </p>
      {task.execution_report != null && task.execution_report !== '' && <details open>
        <summary>Read the follow-up report</summary>
        <Report text={plain(task.execution_report)} />
      </details>}
    </article>;
  };
  const group = (id: string, title: string, items: Task[], empty?: string) => (items.length || empty) ? <section className="ops-section" aria-labelledby={id}>
    <h2 id={id}>{title}{items.length > 0 && <span className="ops-count">{items.length}</span>}</h2>
    {items.length ? <div className="ops-tasks">{items.map(card)}</div> : <p className="ops-empty">{empty}</p>}
  </section> : null;

  return <DashboardShell view={view} onView={setView} counts={counts} busy={busy} onLogout={() => void logout()}>
    <div data-tasks={snapshot ? tasks.length : undefined}>
      <header className="ops-dashboard-header"><div><p className="ops-eyebrow">Workspace / {titles[view]}</p><h1>{titles[view]}<span>.</span></h1><p className="ops-lede">{lede}</p></div>
        <div className="ops-actions" data-paused={snapshot?.paused ? 'true' : 'false'}>
          <span className="ops-intake">{!snapshot ? 'Connecting…' : snapshot.paused ? 'Intake paused' : 'Intake on'}</span>
          {updated && <span>Updated {updated} WIB</span>}
          <button className="ops-quiet ops-small" disabled={busy || typeof snapshot?.paused !== 'boolean'} onClick={() => void mutate('pause', { paused: !snapshot?.paused })}>{snapshot?.paused ? 'Resume intake' : 'Pause intake'}</button>
        </div>
      </header>
      {status}
      {snapshot && <>
        {view === 'overview' && <nav className="ops-overview-stats" aria-label="Queue summary">{(['waiting', 'active', 'decided'] as const).map(key => <button key={key} onClick={() => setView(key)}><span>{titles[key]}</span><strong>{counts[key]}</strong><span aria-hidden="true">↗</span></button>)}</nav>}
        <div className="ops-toolbar">
          <label className="ops-search"><span className="ops-sr-only">Search tasks</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tasks or references" /></label>
          <label><span className="ops-sr-only">Filter by source</span><select value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}><option value="all">All sources</option>{['jira', 'github', 'local', 'techcare', 'manual'].filter(source => tasks.some(task => task.source === source)).map(source => <option key={source} value={source}>{{jira: 'Jira', github: 'GitHub', local: 'Local projects', techcare: 'Techcare', manual: 'Historical manual'}[source]}</option>)}</select></label>
          <label><span className="ops-sr-only">Filter by priority</span><select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}><option value="all">All priorities</option>{['urgent', 'high', 'untriaged', 'normal', 'low'].map(level => <option key={level} value={level}>{priorityView({level, reason: '', basis: ''}).label}</option>)}</select></label>
          {(query || sourceFilter !== 'all' || priorityFilter !== 'all') && <button className="ops-link" onClick={() => { setQuery(''); setSourceFilter('all'); setPriorityFilter('all'); }}>Clear filters</button>}
        </div>
        <p className="ops-order-note">Priority first · Needs triage means more evidence is needed.</p>
        {(view === 'overview' || view === 'waiting') && group('task-list-title', 'Needs decision', visibleWaiting, waiting.length ? 'No tasks match these filters.' : 'Nothing is waiting for your decision.')}
        {(view === 'overview' || view === 'active') && group('active-title', 'In progress', visibleActive, view === 'active' ? 'No matching tasks in progress.' : undefined)}
        {(view === 'overview' || view === 'decided') && group('done-title', 'History', visibleFinished, view === 'decided' ? 'No matching decisions yet.' : undefined)}
      </>}
    </div>
  </DashboardShell>;
}
