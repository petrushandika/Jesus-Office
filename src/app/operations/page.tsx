import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import Link from 'next/link';
import { Quicksand } from 'next/font/google';
import { SESSION_COOKIE, verifySession } from '../../lib/operations-auth';
import OperationsPanel from './operations-panel';
import './operations.css';

// Same typeface as Personal-Portfolio, scoped to the private desk only.
const quicksand = Quicksand({ variable: '--font-quicksand', subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata = { title: 'Operations | Jesus Office', robots: { index: false, follow: false } };

// Session is read at request time inside a Suspense boundary (Cache Components).
async function Gate() {
  await connection(); // verifySession reads the clock; never evaluate it while prerendering
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const authenticated = verifySession(token, process.env.OFFICE_SESSION_SECRET ?? '', process.env.OFFICE_OPERATOR_PASSWORD ?? '');
  return <OperationsPanel authenticated={authenticated} />;
}

export default function OperationsPage() {
  return <main className={`ops-page ${quicksand.variable}`}>
    <div className="ops-shell">
      <nav className="ops-crumbs" aria-label="Breadcrumb"><Link href="/">Office</Link><span aria-hidden="true">/</span><span>Operations</span></nav>
      <header className="ops-hero">
        <p className="ops-eyebrow">Private area</p>
        <h1>Operations desk<span>.</span></h1>
        <p className="ops-lede">Agents read GitHub, Jira and Techcare, write a report first, and wait for your decision before doing anything else.</p>
      </header>
      <Suspense fallback={<p className="ops-muted">Checking session…</p>}><Gate /></Suspense>
    </div>
  </main>;
}
