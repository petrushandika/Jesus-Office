import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { SESSION_COOKIE, verifySession } from '../../lib/operations-auth';
import OperationsPanel from './operations-panel';
import './operations.css';

export const metadata = { title: 'Private operations | Jesus Office', robots: { index: false, follow: false } };

// Session is read at request time inside a Suspense boundary (Cache Components).
async function Gate() {
  await connection(); // verifySession reads the clock; never evaluate it while prerendering
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const authenticated = verifySession(token, process.env.OFFICE_SESSION_SECRET ?? '', process.env.OFFICE_OPERATOR_PASSWORD ?? '');
  return <OperationsPanel authenticated={authenticated} />;
}

export default function OperationsPage() {
  return <main className="ops-operations"><div className="ops-container"><header><p className="ops-eyebrow">Jesus Office / Private area</p><h1>Operations desk</h1><p>Operator access only. Reports first, human decisions before execution.</p></header><Suspense fallback={<p>Checking session…</p>}><Gate /></Suspense></div></main>;
}
