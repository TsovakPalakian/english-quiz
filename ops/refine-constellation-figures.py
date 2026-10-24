"""Audit all atlas figures; apply only reviewed source overrides, never hand-drawn edges."""
import argparse
import csv
import hashlib
import importlib.util
import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('complete', ROOT / 'ops/complete-constellation-figures.py')
complete = importlib.util.module_from_spec(spec)
spec.loader.exec_module(complete)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lines', type=Path, required=True)
    parser.add_argument('--stars', type=Path, required=True)
    parser.add_argument('--hyg', type=Path, required=True)
    args = parser.parse_args()
    line_raw, star_raw = args.lines.read_bytes(), args.stars.read_bytes()
    lines, stars = json.loads(line_raw), json.loads(star_raw)
    rows = list(csv.DictReader(complete.checked_bytes(args.hyg, complete.stellar.BLOB).decode().splitlines()))
    by_hip = {int(r['hip']): r for r in rows if r['hip']}
    by_coordinate = {tuple(s['geometry']['coordinates']): int(s['id']) for s in stars['features']}
    collected = {}
    for f in lines['features']:
        collected.setdefault(f['id'], []).extend(f['geometry']['coordinates'])
    # These faint vertices are absent from the magnitude-limited stars.6 file.
    # Resolve explicit identities against pinned HYG coordinates, never the nearest bright neighbour.
    faint = [((-146.6341, 51.7879), 69481), ((131.6666, 28.7651), 43100), ((34.8366, -2.9776), 10826)]
    resolutions = []
    for position, hip in faint:
        row = by_hip[hip]
        ra, dec = float(row['ra'])*15, float(row['dec'])
        separation = math.hypot(((ra-position[0]+180)%360-180)*math.cos(math.radians(dec)), dec-position[1])*3600
        if separation > 1:
            raise ValueError('Faint vertex coordinate conflict: '+str(hip))
        by_coordinate[position] = hip
        resolutions.append({'positionDeg': position, 'hip': hip, 'separationArcsec': separation, 'source': 'HYG 4.1', 'reason': 'Fainter than stars.6 cutoff'})
    base_source = json.loads(complete.FIGURES.read_text())
    supplements = {int(hip) for hip in base_source['supplementalStars']}
    reviewed = sorted(collected)
    if len(reviewed) != 88:
        raise ValueError('Expected 88 constellation identities, merging both Serpens parts')
    overrides = {}
    for abbr in reviewed:
        paths = [[by_coordinate[tuple(p)] for p in line] for line in collected[abbr]]
        if any(hip not in by_hip and hip not in supplements for line in paths for hip in line):
            raise ValueError('Unresolved figure vertex: '+abbr)
        overrides[abbr] = {'id': 'D3-Celestial '+abbr, 'lines': paths}
    data = complete.stellar.dump
    source = {
        'provider': 'D3-Celestial / Olaf Frohn, constellation line dataset',
        'url': 'https://github.com/ofrohn/d3-celestial', 'license': 'BSD-3-Clause',
        'files': [{'url': 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/'+name,
                   'sha256': hashlib.sha256(raw).hexdigest()} for name,raw in [('constellations.lines.json',line_raw),('stars.6.json',star_raw)]],
        'reviewedOverrides': overrides,
        'faintVertexResolutions': resolutions,
        'fieldStars': {'For': {'hip': None, 'reason': 'Omega Fornacis: fourth-brightest star in Go Astronomy/HYG; shown without inventing a connection', 'reference': 'https://www.go-astronomy.com/constellations.php?Name=Fornax'}},
        'atlasComparison': [],
    }
    catalogue = complete.stellar.CATALOGUE
    baseline = {f['id'].split()[-1]: f for f in base_source['catalogue']['constellations']}
    entries = json.loads(catalogue.read_text())
    for c in entries:
        old = {hip for line in baseline[c['abbr']]['lines'] for hip in line}
        d3_vertices = {by_coordinate[tuple(p)] for line in collected[c['abbr']] for p in line if tuple(p) in by_coordinate}
        source['atlasComparison'].append({'abbr': c['abbr'], 'existingVertices': len(old), 'comparisonVertices': len(d3_vertices),
                                          'addedComparedToBaseline': sorted(d3_vertices-old), 'baselineOnlyVerticesRetained': sorted(old-d3_vertices),
                                          'unresolvedComparisonCoordinates': sum(tuple(p) not in by_coordinate for line in collected[c['abbr']] for p in line)})
        by_id = {s['catalogue']['hip']: s for s in c['stars']}
        if c['abbr'] == 'For':
            candidates = sorted((r for r in rows if r['con']=='For' and r['mag']), key=lambda r: float(r['mag']))
            fourth = candidates[3]
            if fourth['bayer'] != 'Ome':
                raise ValueError('Fourth Fornax star identity changed')
            source['fieldStars']['For']['hip'] = int(fourth['hip'])
            required = {int(fourth['hip'])} | {h for line in overrides['For']['lines'] for h in line}
        else:
            required = {h for line in overrides[c['abbr']]['lines'] for h in line}
        for hip in sorted(required-by_id.keys()):
            s = complete.make_star(by_hip[hip]);c['stars'].append(s);by_id[hip]=s
        if c['abbr'] in overrides:
            edges = complete.source_edges(overrides[c['abbr']])
            c['connections'] = [[by_id[a]['id'],by_id[b]['id']] for a,b in edges]
            connected = {hip for edge in edges for hip in edge}
            for s in c['stars']:
                s['isSkeleton'] = s['catalogue']['hip'] in connected
            c['figureSource']['override'] = 'constellation_refinements_source.json'
    complete.apply_display_photometry(entries)
    hyg = json.loads(complete.stellar.SOURCE.read_text())
    needed = {s['catalogue'].get('hygId') for c in entries for s in c['stars']}
    hyg['rows'] = [{k:r[k] for k in complete.stellar.FIELDS} for r in rows if int(r['id']) in needed]
    data(ROOT/'data/constellation_refinements_source.json', source)
    data(complete.stellar.SOURCE, hyg)
    data(catalogue, entries)
    if (ROOT/'data/constellation_go_astronomy_source.json').exists():
        # Rebuilding the comparison atlas must not replace later reviewed Go figures.
        subprocess.run([sys.executable,str(ROOT/'ops/complete-constellation-figures.py'),'--write'],check=True,capture_output=True)
    print(json.dumps({'reviewed': len(entries), 'updatedFigures': reviewed, 'FornaxStars': len(next(c for c in entries if c['abbr']=='For')['stars'])}))


if __name__ == '__main__':
    main()
