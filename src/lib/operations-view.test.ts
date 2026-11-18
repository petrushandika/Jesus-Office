import test from 'node:test';
import assert from 'node:assert/strict';
import { describeTask, excerpt, reportBlocks } from './operations-view.ts';

test('task titles are split into a readable title and quiet metadata', () => {
  assert.deepEqual(describeTask({ source: 'jira', title: 'OPI-1005: [WEB] Tambah riwayat aktivitas pada menu artikel terbit' }),
    { title: 'Tambah riwayat aktivitas pada menu artikel terbit', meta: ['Jira', 'OPI-1005', 'WEB'], linkLabel: 'Open OPI-1005 in Jira' });
  assert.deepEqual(describeTask({ source: 'jira', title: 'ATR-3672: ASHOP GUEST CHECKOUT : E01 · Fondasi Data & API' }),
    { title: 'ASHOP GUEST CHECKOUT : E01 · Fondasi Data & API', meta: ['Jira', 'ATR-3672'], linkLabel: 'Open ATR-3672 in Jira' });
  assert.deepEqual(describeTask({ source: 'github', title: 'CI gagal: astronacci-intl/compro-nextjs · petrushandika deploy to Development server · development' }),
    { title: 'petrushandika deploy to Development server failed', meta: ['GitHub Actions', 'astronacci-intl/compro-nextjs', 'development'], linkLabel: 'Open the run on GitHub' });
  assert.deepEqual(describeTask({ source: 'github', title: 'CI gagal: astronacci-intl/compro-nextjs · workflow · development' }),
    { title: 'Unnamed workflow run failed', meta: ['GitHub Actions', 'astronacci-intl/compro-nextjs', 'development'], linkLabel: 'Open the run on GitHub' });
  assert.deepEqual(describeTask({ source: 'techcare', title: 'Techcare: Paket Futures & Crypto Hilang' }),
    { title: 'Paket Futures & Crypto Hilang', meta: ['Techcare'], linkLabel: 'Open in Techcare' });
  assert.deepEqual(describeTask({ source: 'manual', title: 'Audit CI astronacci-intl/compro-nextjs' }),
    { title: 'Audit CI astronacci-intl/compro-nextjs', meta: ['Manual'], linkLabel: 'Open the linked page' });
});

const REPORT = [
  '# Laporan awal: OPI-1005: [WEB] Tambah riwayat',
  '',
  'Sumber: jira — https://astronacci.atlassian.net/browse/OPI-1005',
  'Status: **Butuh approval** sebelum tindakan apa pun.',
  '',
  '## Analisis (model 9Router — klaim tanpa dukungan bukti di bawah = belum terverifikasi)',
  '## Ringkasan',
  '',
  'Run **44045601741** gagal di job `deploy`.',
  'Baris kedua paragraf yang sama.',
  '',
  '## Temuan & bukti',
  '1. **Runner jalan.**',
  '   - Bukti run: "Job deploy: failure"',
  '- Poin *miring* biasa',
  '> kutipan tiket',
  '| Dugaan | Keyakinan |',
  '|---|---|',
  '| Step doctl | sedang |',
].join('\n');

test('report blocks drop the duplicated title, source and status lines', () => {
  const blocks = reportBlocks(REPORT);
  assert.equal(blocks.some(b => b.type === 'heading' && /Laporan awal/.test(b.text)), false);
  assert.equal(blocks.some(b => 'text' in b && /^(Sumber|Status):/.test(b.text)), false);
});

test('a parenthesised wrapper heading becomes one quiet note, sections become sentence-case headings', () => {
  const blocks = reportBlocks(REPORT);
  assert.deepEqual(blocks[0], { type: 'note', text: 'Analisis: model 9Router — klaim tanpa dukungan bukti di bawah = belum terverifikasi' });
  assert.deepEqual(blocks[1], { type: 'heading', text: 'Ringkasan', level: 2 });
  assert.deepEqual(reportBlocks('### GitHub Actions run 1'), [{ type: 'heading', text: 'GitHub Actions run 1', level: 3 }]);
});

test('paragraph lines merge; lists keep numbering and nesting; quotes and tables are structured', () => {
  const blocks = reportBlocks(REPORT);
  assert.deepEqual(blocks.filter(b => b.type === 'paragraph').slice(0, 2), [
    { type: 'paragraph', text: 'Run **44045601741** gagal di job `deploy`.' },
    { type: 'paragraph', text: 'Baris kedua paragraf yang sama.' },
  ], 'evidence lines keep their line breaks');
  assert.deepEqual(blocks.filter(b => b.type === 'item'), [
    { type: 'item', text: '**Runner jalan.**', marker: '1.', depth: 0 },
    { type: 'item', text: 'Bukti run: "Job deploy: failure"', marker: '', depth: 1 },
    { type: 'item', text: 'Poin *miring* biasa', marker: '', depth: 0 },
  ]);
  assert.deepEqual(blocks.find(b => b.type === 'quote'), { type: 'quote', text: 'kutipan tiket' });
  assert.deepEqual(blocks.find(b => b.type === 'table'), { type: 'table', head: ['Dugaan', 'Keyakinan'], rows: [['Step doctl', 'sedang']] });
});

test('short lines ending in a colon become labels', () => {
  assert.deepEqual(reportBlocks('Informasi yang Masih Kurang:\nScreenshot halaman'), [{ type: 'label', text: 'Informasi yang Masih Kurang' }, { type: 'paragraph', text: 'Screenshot halaman' }]);
});

test('excerpt is the plain first summary paragraph', () => {
  assert.equal(excerpt(REPORT), 'Run 44045601741 gagal di job deploy.');
  assert.equal(excerpt(''), '');
});

test('"Label: value" evidence lines become fields; URLs are not mistaken for labels', () => {
  assert.deepEqual(reportBlocks('Arsitektur: Web desktop\nhttps://example.com/a: b'), [
    { type: 'field', label: 'Arsitektur', text: 'Web desktop' },
    { type: 'paragraph', text: 'https://example.com/a: b' },
  ]);
});

test('excerpt masks e-mail addresses', () => {
  assert.equal(excerpt('## Ringkasan\nPembeli (ntschristian@gmail.com) tidak bisa memutar video.'), 'Pembeli (n…@gmail.com) tidak bisa memutar video.');
});
