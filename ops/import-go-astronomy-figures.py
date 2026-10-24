"""Resolve reviewed Go Astronomy paths against pinned HYG, without moving stars."""
import argparse
import csv
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('complete', ROOT/'ops/complete-constellation-figures.py')
complete = importlib.util.module_from_spec(spec)
spec.loader.exec_module(complete)


def resolve(token, abbr, rows, existing):
    if token.startswith('HIP'):
        return int(token[3:])
    name, _, con = token.partition('.')
    con = con or abbr
    # Preserve explicitly selected components; never use nearest-coordinate matching.
    def matches(r):
        return r['con'] == con and name in (r['bayer'], r['flam'], r['var'])
    hits = {int(r['hip']) for r in rows if r['hip'] and matches(r)}
    retained = hits & existing
    if len(retained) == 1:
        return retained.pop()
    if len(hits) != 1:
        raise ValueError(f'Ambiguous designation {abbr}/{token}: {sorted(hits)}')
    return hits.pop()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hyg', type=Path, required=True)
    args = parser.parse_args()
    raw = complete.checked_bytes(args.hyg, complete.stellar.BLOB)
    rows = list(csv.DictReader(raw.decode().splitlines()))
    by_hip = {int(r['hip']): r for r in rows if r['hip']}
    paths = json.loads((ROOT/'data/constellation_go_astronomy_paths.json').read_text())
    evidence = json.loads((ROOT/'docs/reports/2026-10-24-go-astronomy-audit-sources.json').read_text())
    expected = {s['abbr'] for s in evidence['sources'] if s['status'] == 'different'}
    if set(paths) != expected or len(expected) != 41:
        raise ValueError('Reviewed scope must contain exactly the 41 audited figures')
    catalogue = json.loads(complete.stellar.CATALOGUE.read_text())
    overrides = {}
    for c in catalogue:
        if c['abbr'] not in paths:
            continue
        existing = {s['catalogue']['hip'] for s in c['stars']}
        lines = [[resolve(t, c['abbr'], rows, existing) for t in line.split()] for line in paths[c['abbr']]]
        for hip in {h for line in lines for h in line} - existing:
            if hip not in by_hip:
                raise ValueError(f'No pinned stellar row: {hip}')
            c['stars'].append(complete.make_star(by_hip[hip]))
        source = next(s for s in evidence['sources'] if s['abbr'] == c['abbr'])
        overrides[c['abbr']] = {
            'id': 'Go-Astronomy '+c['abbr'], 'lines': lines,
            'page': source['page'], 'image': source['image'], 'imageSha256': source['sha256'],
            'designationPaths': paths[c['abbr']],
        }
    used = {s['catalogue'].get('hygId') for c in catalogue for s in c['stars']}
    hyg = json.loads(complete.stellar.SOURCE.read_text())
    hyg['rows'] = [{k: r[k] for k in complete.stellar.FIELDS} for r in rows if int(r['id']) in used]
    complete.stellar.dump(ROOT/'data/constellation_go_astronomy_source.json', {
        'provider': 'Go Astronomy, visually reviewed line figures',
        'reviewedOn': '2026-10-24', 'reviewedOverrides': overrides,
        'coordinates': 'Pinned HYG 4.1; no image-derived or manually displaced coordinates',
        'hygSha256': hashlib.sha256(raw).hexdigest(),
        'notes': [
            'Source images are referenced, not redistributed. Connection conventions are not IAU boundaries.',
            'Unlabelled bright vertices were cross-checked with HYG positions and neighbouring labelled stars; no faint nearest-neighbour imports.',
            'Puppis southern vertex is sigma (HIP36377); the chart labels it delta, which is not its HYG designation.',
            'Carina chart rho corresponds to V337 Car (HIP50371); the intermediate iota-epsilon vertex is HIP42568.',
            'Vela southern branch is HIP46701, not lambda/Suhail (HIP44816).',
            'Sagittarius omega is retained at its HYG coordinates, not replaced by 52 Sgr to imitate the raster position. The chart position is not an astrometric measurement; this part cannot be promised pixel-identical. The tail includes HIP98162/HIP98688 and both theta stars.',
            'Seven unresolved binary-component cases from the audit were not replaced.',
        ],
    })
    complete.stellar.dump(complete.stellar.SOURCE, hyg)
    complete.stellar.dump(complete.stellar.CATALOGUE, catalogue)
    print(json.dumps({'reviewed': len(overrides), 'stars': sum(len(c['stars']) for c in catalogue)}))


if __name__ == '__main__':
    main()
