"""Log every change that reached main without a written change log entry.

Run by the Vaultleaf docs workflow with the push's before and after commits. For each commit in between
that changed Vaultleaf (anything under vault-leaf/ except files the build generates, or the docs workflow)
and didn't add to src/changelog.json, append an admin-only entry to src/changelog-auto.json.
Written entries in changelog.json stay the record of user-facing changes and drive What's new."""
import json, os, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO = ROOT.parent
AUTO = ROOT / 'src' / 'changelog-auto.json'
GENERATED = ('vault-leaf/index.html', 'vault-leaf/sw.js', 'vault-leaf/vercel.json', 'vault-leaf/CHANGELOG.md',
             'vault-leaf/tools/shots.json', 'vault-leaf/guide/', 'vault-leaf/src/changelog-auto.json')
BOTS = ('github-actions[bot]',)


def git(*args):
    env = dict(os.environ, TZ='America/New_York')
    return subprocess.run(['git', *args], cwd=REPO, capture_output=True, text=True, check=True, env=env).stdout.strip()


def main(before, after):
    if not before or set(before) == {'0'}:
        before = git('rev-parse', after + '~1')
    data = json.loads(AUTO.read_text()) if AUTO.exists() else {'about': '', 'entries': []}
    written = json.loads((ROOT / 'src' / 'changelog.json').read_text())['entries']
    known = {e.get('commit') for e in data['entries'] + written if e.get('commit')}
    added = 0
    for sha in git('rev-list', '--reverse', '--no-merges', f'{before}..{after}').split():
        author = git('log', '-1', '--format=%an', sha)
        if author in BOTS or sha[:7] in known:
            continue
        files = git('diff-tree', '--no-commit-id', '--name-only', '-r', sha).splitlines()
        relevant = [f for f in files if (f.startswith('vault-leaf/') and not f.startswith(GENERATED)) or f == '.github/workflows/vault-leaf-docs.yml']
        if not relevant or 'vault-leaf/src/changelog.json' in files:
            continue  # nothing of Vaultleaf's changed, or the author wrote an entry themselves
        data['entries'].append({'at': git('log', '-1', '--date=format-local:%Y-%m-%dT%H:%M', '--format=%ad', sha), 'type': 'maintenance', 'audience': 'admin',
                                'title': git('log', '-1', '--format=%s', sha), 'commit': sha[:7], 'auto': True})
        added += 1
    if added:
        data['entries'].sort(key=lambda e: e['at'])
        lines = ',\n'.join('    ' + json.dumps(e, ensure_ascii=False) for e in data['entries'])
        AUTO.write_text('{\n  "about": %s,\n  "entries": [\n%s\n  ]\n}\n' % (json.dumps(data['about'], ensure_ascii=False), lines))
    print(f'logged {added} change(s) automatically')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '', sys.argv[2] if len(sys.argv) > 2 else 'HEAD')
