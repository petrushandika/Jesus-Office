'use client';

import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { describeTask, excerpt, reportBlocks, taskBrief } from '../../lib/operations-view';

type Task = { id: string; title: string; source: string; source_url?: string; status: string; report: unknown; report_hash: string | null; created_at: string; updated_at: string; decision: unknown; execution_report: unknown; error?: string | null };
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
const STATUS_WORDS: Record<string, string> = { queued: 'Queued', analyzing: 'Writing report', approved: 'Approved, starting', executing: 'Following up', running: 'Running', completed: 'Done', rejected: 'Rejected', failed: 'Failed' };

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
    if (record?.decision) return `${record.decision === 'approve' ? 'Approved' : 'Rejected'}${record.by ? ` by ${record.by}` : ''}${record.at ? `, ${when(record.at)}` : ''}`;
  } catch { /* fall through to raw text */ }
  return plain(value);
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
    if (!response.ok) throw new Error(response.status === 409 ? 'This report changed or was already decided. Read the latest version first.' : response.status === 429 ? 'Too many attempts. Wait a few minutes and try again.' : response.status === 401 ? 'Wrong password, or the session has ended.' : 'The operations service did not respond. Try again shortly.');
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
    const password = String(new FormData(form).get('password') ?? '');
    form.reset(); setBusy(true); setMessage('');
    try { await request('login', { password }); setSignedIn(true); }
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
      ? `Approve the read-only follow-up for “${name}”?\n\nThis covers report ${task.report_hash.slice(0, 12)} only. No code, pull request or deploy will run.`
      : `Reject “${name}”?\n\nThe agents stop here and nothing else runs for this task.`)) return;
    await mutate(`tasks/${encodeURIComponent(task.id)}/decision`, { decision, report_hash: task.report_hash });
  }

  const crumbs = (end?: ReactNode) => <nav className="ops-crumbs" aria-label="Breadcrumb"><Link href="/">Office</Link><span aria-hidden="true">/</span><span>Operations</span>{end}</nav>;
  const hero = (lede: ReactNode, actions?: ReactNode) => <header className="ops-hero">
    <p className="ops-eyebrow">Private</p>
    <h1>Operations<span>.</span></h1>
    <p className="ops-lede">{lede}</p>
    {actions}
  </header>;
  const status = <p role="status" aria-live="polite" className="ops-message">{message}</p>;

  if (!signedIn) return <>
    {crumbs()}
    {hero('Agents check GitHub, local projects, Jira and Techcare, write a report, then wait for you. Sign in to read and decide.')}
    <form className="ops-signin" onSubmit={login}>
      <label htmlFor="operator-password">Password</label>
      <div className="ops-signin-row">
        <input id="operator-password" name="password" type="password" autoComplete="current-password" maxLength={4096} required />
        <button className="ops-primary" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
      </div>
      <p className="ops-hint">The session lasts up to eight hours on this device.</p>
    </form>
    {status}
  </>;

  const tasks = snapshot?.tasks ?? [];
  const waiting = tasks.filter(task => WAITING.includes(task.status) && !!task.report_hash && !task.decision);
  const active = tasks.filter(task => ACTIVE.includes(task.status) && !waiting.includes(task));
  const finished = tasks.filter(task => !waiting.includes(task) && !active.includes(task));
  const lede = !snapshot ? 'Loading the queue…'
    : waiting.length === 0 ? 'Nothing is waiting for you. New findings from GitHub, local projects, Jira and Techcare land here first.'
    : `${waiting.length} report${waiting.length === 1 ? ' is' : 's are'} waiting for your decision. Follow-up waits for your approval.`;

  const card = (task: Task) => {
    const view = describeTask(task), link = sourceLink(task.source_url), text = plain(task.report);
    const isWaiting = waiting.includes(task);
    const brief = taskBrief(text);
    const summary = brief ? '' : text ? excerpt(text) : '';
    const meta = [...view.meta];
    if (!isWaiting) meta.push(STATUS_WORDS[task.status] ?? task.status.replace(/_/g, ' '));
    return <article key={task.id} className="ops-task" data-status={task.status}>
      <p className="ops-task-meta"><span className="ops-task-tags">{meta.map((part, index) => <span key={index}>{part}</span>)}</span><time dateTime={task.created_at}>{when(task.created_at)}</time></p>
      <h3>{brief?.Judul || view.title}</h3>
      {brief && <dl className="ops-brief">{['Masalah', 'Target', 'Kondisi sekarang', 'Usulan'].filter(key => brief[key]).map(key => <div key={key}><dt>{key}</dt><dd>{brief[key]}</dd></div>)}</dl>}
      {summary && <p className="ops-task-summary">{summary}</p>}
      {task.error && <p className="ops-task-error">Last attempt failed: {task.error}</p>}
      {!text && <p className="ops-task-summary">The report is being written.</p>}
      {text && <details>
        <summary>{isWaiting ? 'Read the report and decide' : 'Read the report'}</summary>
        <Report text={brief ? text.replace(/^## Inti\s*\n[\s\S]*?(?=^## |$(?![\s\S]))/m, '') : text} />
        {isWaiting && <div className="ops-decision">
          <div className="ops-decision-actions">
            <button className="ops-primary" disabled={busy} onClick={() => void decide(task, 'approve')}>Approve follow-up</button>
            <button className="ops-quiet" disabled={busy} onClick={() => void decide(task, 'reject')}>Reject</button>
          </div>
          <p className="ops-hint">Your decision applies to this version of the report only.</p>
        </div>}
      </details>}
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

  return <div data-tasks={snapshot ? tasks.length : undefined}>
    {crumbs(<button className="ops-link ops-signout" disabled={busy} onClick={() => void logout()}>Sign out</button>)}
    {hero(lede, <div className="ops-actions" data-paused={snapshot?.paused ? 'true' : 'false'}>
      <span className="ops-intake">{!snapshot ? 'Connecting…' : snapshot.paused ? 'Intake paused' : 'Intake on, every 15 minutes'}</span>
      {updated && <span>Updated {updated} WIB</span>}
      <button className="ops-quiet ops-small" disabled={busy || typeof snapshot?.paused !== 'boolean'} onClick={() => void mutate('pause', { paused: !snapshot?.paused })}>{snapshot?.paused ? 'Resume intake' : 'Pause intake'}</button>
    </div>)}
    {status}
    {snapshot && <>
      {group('task-list-title', 'Waiting for you', waiting, 'Nothing is waiting for you. New reports appear here.')}
      {group('active-title', 'In progress', active)}
      {group('done-title', 'Decided', finished)}
    </>}
  </div>;
}
