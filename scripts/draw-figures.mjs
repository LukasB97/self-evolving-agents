import { mkdir, writeFile } from 'node:fs/promises';

// Shared geometry for four schematic snapshots; heights are not token counts.
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
const figures = [
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

const directory = new URL('../assets/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const figure of figures) {
  const parts = [];
  let y = 86;
  const text = (label, x, baseline, size = 17, extra = '') =>
    `<text x="${x}" y="${baseline}" font-size="${size}" ${extra}>${escape(label)}</text>`;
  parts.push(text(figure.title, 40, 33, 21, 'font-weight="500"'));
  parts.push(text('Start of context', 56, 68, 13, `fill="${colors.muted}"`));
  for (const row of figure.rows) {
    if (row.kind === 'boundary') {
      const baseline = y + 27;
      parts.push(`<path d="M56 ${baseline - 5}H174 M410 ${baseline - 5}H552" stroke="${colors.line}"/>`);
      parts.push(text(row.label, 292, baseline, 13, `text-anchor="middle" fill="${colors.muted}"`));
    } else {
      parts.push(`<rect x="56" y="${y}" width="496" height="${row.height}" fill="${colors[row.kind]}"/>`);
      parts.push(text(row.label, 72, y + row.height / 2 + 6));
    }
    y += row.height + 3;
  }
  const arrowEnd = y - 7;
  parts.push(`<path d="M37 86V${arrowEnd}m-4 -5 4 5 4 -5" fill="none" stroke="${colors.line}"/>`);
  if (figure.continuation) {
    parts.push(`<rect x="56" y="${y}" width="496" height="72" rx="3" fill="white" stroke="${colors.line}"/>`);
    parts.push(text(figure.continuation, 72, y + 28, 17, 'font-weight="500"'));
    parts.push(text('Room for new exploration', 72, y + 52, 14, `fill="${colors.muted}"`));
    y += 88;
  } else {
    parts.push(text(figure.end, 56, y + 23, 13, `fill="${colors.muted}"`));
    y += 42;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="592" height="${y}" viewBox="0 0 592 ${y}" role="img" aria-labelledby="title desc">
<title id="title">${escape(figure.title)}</title>
<desc id="desc">${escape(figure.description)}</desc>
<rect width="592" height="${y}" fill="white"/>
<g font-family="Arial, Helvetica, sans-serif" fill="${colors.ink}">
${parts.join('\n')}
</g>
</svg>
`;
  await writeFile(new URL(`${figure.name}.svg`, directory), svg);
}
