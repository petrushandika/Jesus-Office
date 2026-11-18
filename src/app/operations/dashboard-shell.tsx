'use client';
import Link from 'next/link';
import { useRef, type ReactNode } from 'react';
export type DeskView = 'overview' | 'waiting' | 'active' | 'decided';
const navigation: { id: DeskView; label: string; path: string }[] = [
 { id: 'overview', label: 'Overview', path: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z' },
 { id: 'waiting', label: 'Needs decision', path: 'M4 4h16v16H4z M8 9h8 M8 13h5' },
 { id: 'active', label: 'In progress', path: 'M12 3a9 9 0 1 1-9 9 M12 7v5l3 2' },
 { id: 'decided', label: 'History', path: 'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2' },
];
function Icon({ path }: { path: string }) { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>; }
export default function DashboardShell({ view, onView, counts, busy, onLogout, children }: { view: DeskView; onView: (view: DeskView) => void; counts: Record<DeskView, number>; busy: boolean; onLogout: () => void; children: ReactNode }) {
 const drawer = useRef<HTMLDialogElement>(null);
 const menu = () => <>
  <Link className="ops-brand" href="/">Jesus Office<span>Operations workspace</span></Link>
  <p className="ops-nav-label">Workspace</p>
  <nav aria-label="Workspace navigation">{navigation.map(item => <button key={item.id} className="ops-nav-item" aria-current={view === item.id ? 'page' : undefined} onClick={() => { onView(item.id); drawer.current?.close(); }}><Icon path={item.path}/><span>{item.label}</span>{item.id !== 'overview' && <span className="ops-nav-count">{counts[item.id]}</span>}</button>)}</nav>
  <div className="ops-sidebar-bottom"><Link href="/">Back to the city <span aria-hidden="true">↗</span></Link><button disabled={busy} onClick={onLogout}><Icon path="M9 4H4v16h5 M14 8l4 4-4 4 M8 12h10"/>Sign out</button><p>Private workspace</p></div>
 </>;
 return <div className="ops-dashboard">
  <aside className="ops-sidebar">{menu()}</aside>
  <div className="ops-mobilebar"><button aria-label="Open navigation" aria-haspopup="dialog" aria-controls="workspace-menu" onClick={() => drawer.current?.showModal()}><Icon path="M4 6h16 M4 12h16 M4 18h16"/></button><span>Jesus Office <span>/ Operations</span></span></div>
  <dialog id="workspace-menu" ref={drawer} className="ops-drawer" aria-label="Workspace navigation" onClick={event => { if (event.target === event.currentTarget) drawer.current?.close(); }}><div className="ops-drawer-content"><button className="ops-drawer-close" aria-label="Close navigation" onClick={() => drawer.current?.close()}><Icon path="M6 6l12 12 M6 18L18 6"/></button>{menu()}</div></dialog>
  <div className="ops-workspace">{children}</div>
 </div>;
}
