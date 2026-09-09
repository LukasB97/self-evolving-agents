import { mkdir, writeFile } from 'node:fs/promises';

// Two before/after comparisons; all snapshots share geometry and colors.
// Block heights are schematic and do not represent token counts.
const colors = {
  ink: '#24333b', muted: '#61717a', line: '#c7d0d4',
  neutral: '#f1f3f4', problem: '#e4e9ec', knowledge: '#def0eb',
};
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const block = (label, kind = 'neutral', height = 36) => ({ label, kind, height });
const boundary = label => ({ label, kind: 'boundary', height: 44 });
const opening = [
  block('The problem', 'problem'),
  block('First result + proof', 'knowledge', 44),
  block('Second result + proof', 'knowledge', 44),
  block('Failed routes + why they fail'),
  block('Next approach + open questions', 'neutral', 44),
];
const snapshots = [
  {
    name: 'context-01', title: 'Before the first compaction',
    description: 'Two established results sit among the attempts and calculations that produced them.',
    rows: [
      block('The problem', 'problem'),
      block('First approach'),
      block('Calculations and conjectures', 'neutral', 52),
      block('First result proved', 'knowledge'),
      block('Further attempts', 'neutral', 44),
      block('Dead end'),
      block('New approach and conjecture'),
      block('More calculations', 'neutral', 52),
      block('Conjecture disproved'),
      block('Second result proved', 'knowledge'),
      block('Next approach'),
    ],
    end: 'Context almost full',
  },
  {
    name: 'context-02', title: 'Start of iteration 2',
    description: 'The shorter context groups established results, preserves reasons for failure, and leaves room for new work.',
    rows: [...opening, boundary('End of first compaction')],
    continuation: 'Iteration 2 begins here',
  },
  {
    name: 'context-03', title: 'End of iteration 2',
    description: 'The existing foundation is followed by new exploration, a third result, and a generalization of the first result.',
    rows: [
      ...opening,
      boundary('End of first compaction'),
      block('Build on the two results', 'neutral', 44),
      block('New calculations', 'neutral', 52),
      block('Third result proved', 'knowledge'),
      block('Try to generalize the first result', 'neutral', 52),
      block('Generalization proved', 'knowledge'),
      block('Next: connect the results to the problem'),
    ],
    end: 'Context almost full again',
  },
  {
    name: 'context-04', title: 'Start of iteration 3',
    description: 'The generalization joins the first result, the third result joins the foundation, and the next step is updated.',
    rows: [
      block('The problem', 'problem'),
      block('First result + generalization + proofs', 'knowledge', 52),
      block('Second result + proof', 'knowledge', 44),
      block('Third result + proof', 'knowledge', 44),
      block('Failed routes + why they fail'),
      block('Next: connect the results to the problem', 'neutral', 44),
      boundary('End of second compaction'),
    ],
    continuation: 'Iteration 3 begins here',
  },
];

const figures = [
  {
    name: 'compaction-01',
    title: 'First compaction',
    description: 'Before and after: two results scattered through exploration are grouped with their proofs, failed routes, and the next approach. Space remains for iteration two.',
    before: snapshots[0], after: snapshots[1],
    beforeLabel: 'End of iteration 1', afterLabel: 'Start of iteration 2',
  },
  {
    name: 'compaction-02',
    title: 'Second compaction',
    description: 'Before and after: a third result and a generalization discovered during new exploration enter the existing foundation, with their proofs retained. Space remains for iteration three.',
    before: snapshots[2], after: snapshots[3],
    beforeLabel: 'End of iteration 2', afterLabel: 'Start of iteration 3',
  },
];

const width = 1080;
const columnWidth = 450;
const rowStart = 136;
const gap = 3;
const rowsHeight = snapshot => snapshot.rows.reduce((height, row) => height + row.height + gap, 0);
const text = (label, x, baseline, size = 18, extra = '') =>
  `<text x="${x}" y="${baseline}" font-size="${size}" ${extra}>${escape(label)}</text>`;

function drawSnapshot(snapshot, x, label, iteration, extent) {
  const parts = [
    text(label, x, 76, 19, 'font-weight="600"'),
    text(iteration, x, 99, 14, `fill="${colors.muted}"`),
    text('Start of context', x, 123, 12, `fill="${colors.muted}"`),
  ];
  let y = rowStart;
  for (const row of snapshot.rows) {
    if (row.kind === 'boundary') {
      const baseline = y + 27;
      parts.push(`<path d="M${x} ${baseline - 5}h104 M${x + 346} ${baseline - 5}h104" stroke="${colors.line}"/>`);
      parts.push(text(row.label, x + columnWidth / 2, baseline, 13, `text-anchor="middle" fill="${colors.muted}"`));
    } else {
      parts.push(`<rect x="${x}" y="${y}" width="${columnWidth}" height="${row.height}" fill="${colors[row.kind]}"/>`);
      parts.push(text(row.label, x + 16, y + row.height / 2 + 6));
    }
    y += row.height + gap;
  }
  if (snapshot.continuation) {
    const roomHeight = rowStart + extent - y;
    parts.push(`<rect x="${x}" y="${y}" width="${columnWidth}" height="${roomHeight}" fill="white" stroke="${colors.line}" stroke-dasharray="5 5"/>`);
    parts.push(text('Room for new exploration', x + 16, y + 34, 17, `fill="${colors.muted}"`));
  } else {
    parts.push(text(snapshot.end, x, rowStart + extent + 25, 13, `fill="${colors.muted}"`));
  }
  return parts.join('\n');
}

const directory = new URL('../assets/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const figure of figures) {
  const extent = Math.max(rowsHeight(figure.before), rowsHeight(figure.after) + 88);
  const height = rowStart + extent + 44;
  const arrowY = rowStart + extent / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${escape(figure.title)}</title>
<desc id="desc">${escape(figure.description)}</desc>
<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
    <path d="M0 0L8 4L0 8Z" fill="${colors.muted}"/>
  </marker>
</defs>
<rect width="${width}" height="${height}" fill="white"/>
<g font-family="Arial, Helvetica, sans-serif" fill="${colors.ink}">
${text(figure.title, 32, 34, 24, 'font-weight="600"')}
${drawSnapshot(figure.before, 32, 'Before', figure.beforeLabel, extent)}
${drawSnapshot(figure.after, 598, 'After', figure.afterLabel, extent)}
${text('evolve', 540, arrowY - 15, 15, `text-anchor="middle" fill="${colors.muted}"`)}
<path d="M501 ${arrowY}H577" fill="none" stroke="${colors.muted}" stroke-width="2" marker-end="url(#arrow)"/>
</g>
</svg>
`;
  await writeFile(new URL(`${figure.name}.svg`, directory), svg);
}
