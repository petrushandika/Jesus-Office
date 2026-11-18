// Pure view helpers for the operations desk: readable task titles and structured report blocks.
// Reports are untrusted text, so this only produces plain data; the panel renders it as React text.

export type TaskLike = { source: string; title: string };
export type TaskView = { title: string; meta: string[]; linkLabel: string };
export type Block =
  | { type: 'heading'; text: string; level: 2 | 3 }
  | { type: 'note'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'label'; text: string }
  | { type: 'field'; label: string; text: string }
  | { type: 'item'; text: string; marker: string; depth: number }
  | { type: 'quote'; text: string }
  | { type: 'table'; head: string[]; rows: string[][] };

export function describeTask(task: TaskLike): TaskView {
  const title = task.title.trim();
  if (task.source === 'jira') {
    const match = /^([A-Z][A-Z0-9]+-\d+):\s*((?:\[[^\]]+\]\s*)*)(.*)$/.exec(title);
    if (match) {
      const tags = [...match[2].matchAll(/\[([^\]]+)\]/g)].map(tag => tag[1]);
      return { title: match[3] || title, meta: ['Jira', match[1], ...tags], linkLabel: `Open ${match[1]} in Jira` };
    }
    return { title, meta: ['Jira'], linkLabel: 'Open in Jira' };
  }
  if (task.source === 'github') {
    const parts = title.replace(/^CI gagal:\s*/, '').split(' · ');
    if (parts.length >= 3) {
      const [repo, name, branch] = [parts[0], parts.slice(1, -1).join(' · '), parts[parts.length - 1]];
      return { title: name === 'workflow' ? 'Unnamed workflow run failed' : `${name} failed`, meta: ['GitHub Actions', repo, branch], linkLabel: 'Open the run on GitHub' };
    }
    return { title, meta: ['GitHub Actions'], linkLabel: 'Open the run on GitHub' };
  }
  if (task.source === 'techcare') return { title: title.replace(/^Techcare:\s*/, ''), meta: ['Techcare'], linkLabel: 'Open in Techcare' };
  return { title, meta: [task.source === 'manual' ? 'Manual' : task.source], linkLabel: 'Open the linked page' };
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());

export function reportBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], line = raw.trim();
    if (!line || /^(-{3,}|\*{3,}|_{3,})$/.test(line)) continue;
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      if (heading[1].length === 1) continue; // report title repeats the task title
      const wrapped = /^(.*?)\s*\((.+)\)$/.exec(heading[2]);
      if (wrapped) blocks.push({ type: 'note', text: `${wrapped[1]}: ${wrapped[2]}` });
      else blocks.push({ type: 'heading', text: heading[2], level: heading[1].length <= 2 ? 2 : 3 });
      continue;
    }
    if (/^(Sumber|Status):/.test(line)) continue; // shown as task metadata already
    if (line.startsWith('|') && lines[i + 1] && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(line), rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].trim().startsWith('|'); i++) rows.push(cells(lines[i]));
      i--;
      blocks.push({ type: 'table', head, rows });
      continue;
    }
    const item = /^(\s*)(?:([-*+])|(\d+[.)]))\s+(.*)$/.exec(raw);
    if (item) {
      blocks.push({ type: 'item', text: item[4].trim(), marker: item[3] ? item[3].replace(')', '.') : '', depth: Math.min(2, Math.floor(item[1].replace(/\t/g, '  ').length / 2)) });
      continue;
    }
    if (line.startsWith('>')) {
      const text = line.replace(/^>\s?/, '');
      const last = blocks[blocks.length - 1];
      if (last?.type === 'quote' && lines[i - 1]?.trim().startsWith('>')) last.text += ' ' + text; else blocks.push({ type: 'quote', text });
      continue;
    }
    // Reports are line-oriented evidence (Platform: …, URL: …): keep each line, never join them into one run-on paragraph.
    const label = /^([^:]{2,60}):$/.exec(line);
    const field = /^([A-Za-zÀ-ÿ][^:*`/]{1,40}):\s+(.+)$/.exec(line);
    blocks.push(label ? { type: 'label', text: label[1] } : field ? { type: 'field', label: field[1], text: field[2] } : { type: 'paragraph', text: line });
  }
  return blocks;
}

const plainText = (text: string) => text.replace(/\b([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1…@$2').replace(/"([^"]+)"/g, '“$1”').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1$2');

// First paragraph of the summary section, as plain text, for the collapsed card.
export function excerpt(text: string) {
  const blocks = reportBlocks(text);
  const start = blocks.findIndex(block => block.type === 'heading' && /ringkasan|summary/i.test(block.text));
  const paragraph = blocks.slice(start + 1).find(block => block.type === 'paragraph') ?? blocks.find(block => block.type === 'paragraph');
  return paragraph && 'text' in paragraph ? plainText(paragraph.text) : '';
}
