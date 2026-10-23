"""Import pinned atlas figures and derive explicitly non-measured DSO display brightness."""
import argparse
import copy
import csv
import hashlib
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
FIGURES = DATA / 'constellation_figures_source.json'
AUDIT = DATA / 'constellation_figures.audit.json'
SOURCE_BLOB = '3130f685e7e6ae303b31fce0a0371b54e8810d49'
URL = 'https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/modern_st/index.json'
PHOTOMETRY = DATA / 'deep_sky_photometry_source.json'
spec = importlib.util.spec_from_file_location('stellar', ROOT / 'ops/enrich-constellation-catalogue.py')
stellar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stellar)


def checked_bytes(path, pin):
    raw = path.read_bytes()
    if hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() != pin:
        raise ValueError(f'Unreviewed source version: {path}')
    return raw


def source_edges(figure):
    # A polyline is consecutive pairs, not a clique. Repeated reverse edges draw once.
    result, seen = [], set()
    for line in figure['lines']:
        for a, b in zip(line, line[1:]):
            key = tuple(sorted((a, b)))
            if a == b:
                continue  # Source repeats some polyline vertices; no nonzero segment exists.
            if key not in seen:
                result.append((a, b))
                seen.add(key)
    return result


def figure_map(source):
    figures={f['id'].split()[-1]: f for f in source['catalogue']['constellations']}
    path=DATA/'constellation_refinements_source.json'
    if path.exists():
        figures.update(json.loads(path.read_text())['reviewedOverrides'])
    return figures


def make_star(row):
    hip = int(row['hip'])
    prefix = row['bayer'] or row['flam'] or row['var']
    designation = (prefix + ' ' + row['con']).strip() if prefix else ''
    return {
        'id': 'hip_' + str(hip), 'name': row['proper'] or designation or f'HIP {hip}',
        'bayer': designation, 'spectralType': row['spect'] or None,
        'magnitude': stellar.number(row['mag']), 'isSkeleton': True,
        'coordinates': stellar.coordinates(row),
        'catalogue': {'provider': 'HYG 4.1', 'hygId': int(row['id']), 'hip': hip,
                      'hd': int(row['hd']) if row['hd'] else None,
                      'hr': int(row['hr']) if row['hr'] else None,
                      'bayer': row['bayer'], 'constellation': row['con'],
                      'properName': row['proper'] or None, 'source': 'constellations_hyg_source.json'},
        'photometry': {'band': 'V', 'apparentMagnitude': stellar.number(row['mag']),
                       'colorIndexBV': stellar.number(row['ci']),
                       'variableDesignation': row['var'] or None,
                       'variableMagnitudeRange': [stellar.number(row['var_min']), stellar.number(row['var_max'])] if row['var'] else None},
    }


def apply_display_photometry(catalogue):
    counts = {'measured': 0, 'estimated': 0}
    for c in catalogue:
        unique = {s['catalogue'].get('hip') or ('hyg', s['catalogue'].get('hygId')): s
                  for s in c['stars'] if math.isfinite(s['photometry']['apparentMagnitude'])
                  and s['catalogue'].get('constellation', c['abbr']) == c['abbr']}
        magnitudes = [s['photometry']['apparentMagnitude'] for s in unique.values()]
        mean = -2.5 * math.log10(sum(10 ** (-.4 * m) for m in magnitudes) / len(magnitudes))
        for obj in c['deepSkyObjects']:
            for part in [obj] + obj.get('components', []):
                measured = part.get('photometry', {}).get('magnitudeV')
                estimated = measured is None
                part['displayPhotometry'] = {
                    'magnitudeV': mean if estimated else measured, 'estimated': estimated,
                    'method': 'constellation-mean-linear-V-flux' if estimated else 'catalogue-V',
                    'constellation': c['abbr'], 'sampleSize': len(magnitudes) if estimated else None,
                    'sampleScope': 'unique catalogued stars assigned to this constellation' if estimated else None,
                    'note': 'Conditional marker brightness, not measured object photometry' if estimated else 'Integrated magnitude is not surface brightness',
                }
                counts['estimated' if estimated else 'measured'] += 1
    return counts


def apply_measured_photometry(catalogue):
    if not PHOTOMETRY.exists():
        return
    source = json.loads(PHOTOMETRY.read_text())
    for c in catalogue:
        for obj in c['deepSkyObjects']:
            ref = source['records'].get(obj['id'])
            if ref and obj['catalogue'].get('identifier') == ref['identifier'] and obj['photometry'].get('magnitudeV') is None:
                obj['photometry']['magnitudeV'] = ref['magnitudeV']
                obj['photometry']['magnitudeVSource'] = PHOTOMETRY.name
                obj['photometry']['scope'] = 'Integrated cluster V_t, Harris 1996 (2010 edition), Part II column 7'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--atlas', type=Path)
    parser.add_argument('--hyg', type=Path)
    parser.add_argument('--harris', type=Path)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    source = json.loads(FIGURES.read_text()) if not args.atlas else {
        'provider': 'Stellarium Modern (Sky & Telescope)', 'url': URL,
        'gitBlobSha1': SOURCE_BLOB, 'license': 'CC-BY-SA-2.0',
        'credit': 'Paul Krizak, Jonathan E. Piskor; extended by G. Zotti',
        'documentation': URL.replace('index.json', 'description.md'),
        'comparisonPages': ['https://www.go-astronomy.com/constellations.php?Name=Horologium', 'https://www.go-astronomy.com/constellations.php?Name=Gemini'],
        'catalogue': json.loads(checked_bytes(args.atlas, SOURCE_BLOB)),
        'supplementalStars': {
            '55203': {
                'name': 'HIP 55203', 'raHours': 11.3031, 'decDeg': 31.5308, 'magnitudeV': 3.8,
                'reference': '2021A&A...649A.112V, Appendix A, Table A.1',
                'url': 'https://www.aanda.org/articles/aa/pdf/2021/05/aa40332-21.pdf',
                'scope': 'Published J2000 HIPPARCOS supplement entry; rounded source precision; not an HYG match',
            }
        },
    }
    if source['gitBlobSha1'] != SOURCE_BLOB:
        raise ValueError('Unexpected atlas version')
    hyg = json.loads(stellar.SOURCE.read_text())
    if args.hyg:
        rows = list(csv.DictReader(checked_bytes(args.hyg, stellar.BLOB).decode().splitlines()))
    else:
        rows = hyg['rows']
    by_hip = {}
    for row in rows:
        if row['hip']:
            hip = int(row['hip'])
            if hip in by_hip:
                raise ValueError(f'Ambiguous HIP {hip}')
            by_hip[hip] = row
    catalogue = json.loads(stellar.CATALOGUE.read_text())
    if args.harris:
        raw = args.harris.read_bytes()
        section = raw.decode().split('Part II:  Metallicity and Photometry')[1].split('Part III:')[0]
        records = {}
        for line in section.splitlines():
            if not line.startswith(' NGC '):
                continue
            identifier = 'NGC' + line[1:11].replace(' ', '')[3:].zfill(4)
            for c in catalogue:
                for obj in c['deepSkyObjects']:
                    if obj['catalogue'].get('identifier') == identifier and obj['photometry'].get('magnitudeV') is None and line[40:46].strip():
                        records[obj['id']] = {'identifier': identifier, 'magnitudeV': float(line[40:46]), 'sourceRow': line.rstrip()}
        if args.write:
            stellar.dump(PHOTOMETRY, {
                'provider': 'William E. Harris, McMaster University', 'reference': 'Harris 1996, AJ 112, 1487 (2010 edition)',
                'url': 'https://physwww.mcmaster.ca/~harris/mwgc.dat',
                'sha256': hashlib.sha256(raw).hexdigest(), 'field': 'Part II, column 7, integrated V_t (not V_HB)',
                'reuse': 'Data supplied free of charge; redistribution must credit the original university website and be free of charge.',
                'records': records,
            })
    old_audit = json.loads(AUDIT.read_text()) if AUDIT.exists() else {}
    archived = old_audit.get('archivedDuplicateConstellations', [])
    if len({c['abbr'] for c in catalogue}) != len(catalogue):
        duplicate = next(i for i, c in enumerate(catalogue) if c['abbr'] == 'Ser')
        archived.append(copy.deepcopy(catalogue[duplicate]))
        # This erroneous entry occupied Ophiuchus's alphabetical slot. The genuine Serpens
        # already contains M16 and M5; archive the duplicate without assigning them to Oph.
        catalogue[duplicate] = {
            'name': 'Ophiuchus', 'abbr': 'Oph', 'meaning': 'Serpent Bearer',
            'stars': [], 'connections': [], 'deepSkyObjects': [],
            'goAstronomyUrl': 'https://www.go-astronomy.com/constellations.php?Name=Ophiuchus',
            'metadataSource': 'constellation_figures_source.json',
        }
    figures = figure_map(source)
    if set(figures) != {c['abbr'] for c in catalogue} or len(catalogue) != 88:
        raise ValueError('Constellation list differs from the 88 source figures')
    changes, needed = [], set()
    identities = old_audit.get('starIdentityCorrections', [])
    for c in catalogue:
        if c['abbr'] == 'Cam':
            wrong = next((s for s in c['stars'] if s['id'] == 'cs_cam' and s['catalogue']['hip'] == 22783), None)
            if wrong:
                row = by_hip[16228]
                if row['var'] != 'CS' or row['con'] != 'Cam':
                    raise ValueError('CS Cam identity is not confirmed by HYG')
                identities.append({'abbr': 'Cam', 'star': 'cs_cam', 'before': copy.deepcopy(wrong),
                                   'issue': 'CS Cam was incorrectly designated 9 Cam (= alpha Cam); HYG variable CS is HIP16228/HD21291.',
                                   'source': 'constellations_hyg_source.json'})
                corrected = make_star(row)
                corrected.update({'id': 'cs_cam', 'name': 'CS Camelopardalis'})
                for key in ['x', 'y', 'radius']:
                    if key in wrong:
                        corrected[key] = wrong[key]
                c['stars'] = [corrected if s is wrong else s for s in c['stars'] if s['id'] != 'hip_16228']
        for s in c['stars']:
            if s['id'].startswith('hip_') and s['catalogue']['provider'] == 'HYG 4.1':
                verified = make_star(by_hip[s['catalogue']['hip']])
                s['name'], s['bayer'] = verified['name'], verified['bayer']
        edges = source_edges(figures[c['abbr']])
        by_existing_hip = {}
        for s in c['stars']:
            if s['catalogue'].get('hip'):
                by_existing_hip.setdefault(s['catalogue']['hip'], s)
        before = len(c['stars'])
        previous_edges = c.get('figureSource', {}).get('previousConnections', c['connections'])
        for hip in dict.fromkeys(h for edge in edges for h in edge):
            if hip not in by_existing_hip:
                if hip in by_hip:
                    s = make_star(by_hip[hip])
                else:
                    ref = source['supplementalStars'][str(hip)]
                    s = {
                        'id': f'hip_{hip}', 'name': ref['name'], 'bayer': None,
                        'magnitude': ref['magnitudeV'], 'isSkeleton': True,
                        'coordinates': stellar.coordinates({'id': str(hip), 'ra': ref['raHours'], 'dec': ref['decDeg']}),
                        'catalogue': {'provider': ref['reference'], 'hip': hip, 'source': 'constellation_figures_source.json', 'positionScope': ref['scope']},
                        'photometry': {'band': 'V', 'apparentMagnitude': ref['magnitudeV'], 'colorIndexBV': None},
                    }
                c['stars'].append(s)
                by_existing_hip[hip] = s
        connected = {hip for edge in edges for hip in edge}
        for s in c['stars']:
            s['isSkeleton'] = s['catalogue'].get('hip') in connected
            if s['catalogue'].get('hygId'):
                needed.add(str(s['catalogue']['hygId']))
        c['connections'] = [[by_existing_hip[a]['id'], by_existing_hip[b]['id']] for a, b in edges]
        c['figureSource'] = {'provider': source['provider'], 'source': FIGURES.name,
                             'sourceId': figures[c['abbr']]['id'], 'gitBlobSha1': SOURCE_BLOB,
                             'previousConnections': previous_edges}
        if figures[c['abbr']]['id'].startswith('D3-Celestial'):
            c['figureSource']['override']='constellation_refinements_source.json'
        changes.append({'abbr': c['abbr'], 'addedStars': len(c['stars']) - before,
                        'stars': len(c['stars']), 'connections': len(edges)})
    hyg['rows'] = [{k: r[k] for k in stellar.FIELDS} for r in rows if r['id'] in needed]
    apply_measured_photometry(catalogue)
    display_counts = apply_display_photometry(catalogue)
    audit = {
        'source': source['url'], 'sourceBlobSha1': SOURCE_BLOB,
        'constellations': len(catalogue), 'stars': sum(len(c['stars']) for c in catalogue),
        'connections': sum(len(c['connections']) for c in catalogue),
        'ignoredZeroLengthSourceEdges': [{'abbr': f['id'].split()[-1], 'hip': a}
                                        for f in figures.values() for line in f['lines']
                                        for a, b in zip(line, line[1:]) if a == b],
        'crossBoundaryFigureVertices': [{'figure': c['abbr'], 'star': s['id'], 'catalogueConstellation': s['catalogue']['constellation']}
                                       for c in catalogue for s in c['stars']
                                       if s['catalogue'].get('constellation', c['abbr']) != c['abbr']],
        'changes': changes, 'archivedDuplicateConstellations': archived,
        'starIdentityCorrections': identities,
        'displayPhotometry': display_counts,
        'photometrySearch': 'Pinned OpenNGC NGC/addendum, HYG, existing individually checked SIMBAD/Green references and Harris 1996 (2010 edition). SIMBAD NGC1851 basic page has no V; Harris supplies integrated V_t. SIMBAD TAP mirror unavailable. No exhaustive literature claim.',
        'limitations': ['Atlas lines are Sky & Telescope conventions, not official IAU connection rules.',
                       'Supplement HIP55203 uses published rounded J2000 coordinates and V, not fabricated HYG metadata.',
                       'Existing unconnected stars retained; not an exhaustive stellar census.',
                       'Measured missing V values remain null. Display estimates are not object measurements.',
                       'Original duplicate Serpens metadata/objects archived; unique M16 and M5 retained in Serpens.'],
    }
    if old_audit:
        previous_added = {x['abbr']: x['addedStars'] for x in old_audit['changes']}
        for change in changes:
            change['addedStars'] += previous_added.get(change['abbr'], 0)
    if args.write:
        stellar.dump(FIGURES, source)
        stellar.dump(stellar.SOURCE, hyg)
        stellar.dump(stellar.CATALOGUE, catalogue)
        stellar.dump(AUDIT, audit)
    print(json.dumps({k: audit[k] for k in ['constellations', 'stars', 'connections', 'displayPhotometry']}))


if __name__ == '__main__':
    main()
