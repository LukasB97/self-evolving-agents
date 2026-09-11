import { execFileSync } from 'node:child_process';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const allowed = new Set(['lukas@lb-engineering.org', '28658521+LukasB97@users.noreply.github.com']);
const lines = process.argv.includes('--commit')
  ? [git('var', 'GIT_AUTHOR_IDENT'), git('var', 'GIT_COMMITTER_IDENT')]
  : git('log', '--format=%an <%ae>%n%cn <%ce>', process.argv[2] ?? 'HEAD').split('\n');
for (const line of lines) {
  const match = line.match(/^(.*?) <([^>]+)>/);
  const github = match?.[1] === 'GitHub' && match?.[2] === 'noreply@github.com';
  if (!github && (!match || match[1] !== 'Lukas Brückner' || !allowed.has(match[2]))) {
    console.error('Commit identity rejected. Use Lukas Brückner <lukas@lb-engineering.org>.');
    process.exit(1);
  }
}
console.log('Commit identities verified.');
