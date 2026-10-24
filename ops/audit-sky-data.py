"""Read-only independent audit of astronomy data; writes only an optional audit report."""
import argparse
import csv
import hashlib
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
PINS = {
    'hyg': 'ba2dec4eb0f6768914c7fc1051258100214ddf84',
    'ngc': 'efa4b71036d8967c4c698a57fb0526288e201623',
    'addendum': '490b5b1274f9d83a18fa46b50a7babd1f219e80e',
    'atlas': '3130f685e7e6ae303b31fce0a0371b54e8810d49',
}


def load(name):
    return json.loads((DATA / name).read_text())


def numeric(value):
    return None if value in ('', None) else float(value)


def sexagesimal(value, hours=False):
    numbers = re.findall(r'\d+(?:\.\d+)?', value)
    if len(numbers) != 3:
        raise ValueError(f'Expected three sexagesimal components: {value}')
    first, minute, second = map(float, numbers)
    if minute >= 60 or second >= 60 or (hours and first >= 24) or (not hours and first > 90):
        raise ValueError(f'Invalid sexagesimal position: {value}')
    result = first + minute / 60 + second / 3600
    if not hours and result > 90:
        raise ValueError(f'Declination exceeds 90 degrees: {value}')
    return result * (15 if hours else 1) * (-1 if value.startswith('-') else 1)


def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', value).casefold() if c.isalnum())


class IauTable(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.cells, self.cell, self.skip = [], None, None, 0

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.cells = []
        elif tag == 'td' and self.cells is not None:
            self.cell = []
        if self.cell is not None and (self.skip or 'pronunciation' in dict(attrs).get('class', '').split()):
            self.skip += 1

    def handle_endtag(self, tag):
        if self.skip:
            self.skip -= 1
        elif tag == 'td' and self.cell is not None:
            self.cells.append(' '.join(''.join(self.cell).split()))
            self.cell = None
        elif tag == 'tr' and self.cells is not None:
            if len(self.cells) == 6 and re.fullmatch('[A-Za-z]{3}', self.cells[2]):
                self.rows.append({'name': self.cells[1], 'abbr': self.cells[2], 'genitive': self.cells[4]})
            self.cells = None

    def handle_data(self, text):
        if self.cell is not None and not self.skip:
            self.cell.append(text)


def audit(raw_paths=None):
    raw_paths = raw_paths or {}
    data = load('constellations_catalogue.json')
    star_source = load('constellations_hyg_source.json')
    object_source = load('deep_sky_catalogue_source.json')
    figure_source = load('constellation_figures_source.json')
    harris = load('deep_sky_photometry_source.json')
    references = load('deep_sky_references.json')
    errors, findings, verified_sources = [], [], []

    def check(condition, code, key, **details):
        if not condition:
            errors.append({'code': code, 'entry': key, **details})

    def finding(code, severity, key, **details):
        findings.append({'code': code, 'severity': severity, 'entry': key, **details})

    full = {}
    for key, path in raw_paths.items():
        raw = Path(path).read_bytes()
        digest = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        check(digest == PINS[key], 'source_hash_mismatch', key, actual=digest, expected=PINS[key])
        verified_sources.append({'key': key, 'gitBlobSha1': digest, 'matchesPin': digest == PINS[key]})
        full[key] = json.loads(raw) if key == 'atlas' else list(csv.DictReader(raw.decode().splitlines(), delimiter=',' if key == 'hyg' else ';'))
    if 'hyg' in full:
        originals = {r['id']: r for r in full['hyg']}
        for r in star_source['rows'] + object_source['stellarRows']:
            check(r['id'] in originals and all(originals[r['id']].get(k) == v for k, v in r.items()), 'hyg_snapshot_drift', r['id'])
    if 'ngc' in full and 'addendum' in full:
        originals = {r['Name']: r for r in full['ngc'] + full['addendum']}
        for r in object_source['rows']:
            check(originals.get(r['Name']) == r, 'opengnc_snapshot_drift', r['Name'])
    if 'atlas' in full:
        check(full['atlas'] == figure_source['catalogue'], 'atlas_snapshot_drift', 'all figures')
    hyg = {int(r['id']): r for r in star_source['rows'] + object_source['stellarRows']}
    ngc = {r['Name']: r for r in object_source['rows']}
    figures = {c['id'].split()[-1]: c for c in figure_source['catalogue']['constellations']}
    refinements=DATA/'constellation_refinements_source.json'
    if refinements.exists():
        figures.update(json.loads(refinements.read_text())['reviewedOverrides'])
    go_figures=DATA/'constellation_go_astronomy_source.json'
    if go_figures.exists():
        figures.update(json.loads(go_figures.read_text())['reviewedOverrides'])
    check(len(data) == 88 and len({c['abbr'] for c in data}) == 88, 'constellation_uniqueness', 'catalogue')
    check({c['abbr'] for c in data} == set(figures), 'constellation_coverage', 'catalogue')
    root_ids, hip_positions = [], defaultdict(list)
    legacy_mag, legacy_spectra, unknown_v, cross_boundary = [], [], [], []
    source_derived_fields = Counter()

    def position(p, key, expected=None):
        try:
            ra, dec = p['rightAscensionDeg'], p['declinationDeg']
            check(math.isfinite(ra) and math.isfinite(dec) and 0 <= ra < 360 and -90 <= dec <= 90, 'coordinate_domain', key)
            check(p['epoch'] == 'J2000.0' and p['equinox'] == 'J2000.0', 'coordinate_epoch', key)
            parsed_ra, parsed_dec = sexagesimal(p['rightAscension'], True), sexagesimal(p['declination'])
            check(abs((parsed_ra - ra + 180) % 360 - 180) < 1e-5 and abs(parsed_dec - dec) < 3e-6, 'coordinate_text_numeric_conflict', key)
            if expected:
                check(abs(ra - expected[0]) < 1e-8 and abs(dec - expected[1]) < 1e-8, 'coordinate_source_conflict', key, expected=expected, actual=[ra, dec])
            source_derived_fields['positions'] += 1
        except (KeyError, TypeError, ValueError) as error:
            errors.append({'code': 'invalid_position', 'entry': key, 'detail': str(error)})

    def stellar(s, key):
        meta, photo = s['catalogue'], s['photometry']
        if meta['provider'] == 'HYG 4.1':
            row = hyg.get(meta['hygId'])
            check(row is not None, 'missing_hyg_record', key)
            if row is None:
                return
            expected = [round(float(row['ra']) * 15, 9), float(row['dec'])]
            position(s['coordinates'], key, expected)
            check(str(meta['hip'] or '') == row['hip'], 'hip_identity_conflict', key)
            for field in ['hd', 'hr']:
                if field in meta:
                    check(str(meta[field] or '') == row[field], 'cross_identifier_conflict', key, field=field)
            mag = photo.get('apparentMagnitude', photo.get('magnitudeV'))
            check(mag == numeric(row['mag']), 'stellar_v_conflict', key)
            check(photo.get('colorIndexBV') == numeric(row['ci']), 'stellar_colour_conflict', key)
            if 'band' in photo:
                check(photo['band'] == 'V', 'stellar_band_conflict', key)
            if s.get('catalogueSpectralType'):
                check(s['catalogueSpectralType'] == row['spect'], 'catalogue_spectrum_conflict', key)
            if 'properMotion' in s:
                pm = s['properMotion']
                check(pm.get('unit') == 'mas/year' and pm.get('rightAscension') == numeric(row['pmra']) and pm.get('declination') == numeric(row['pmdec']), 'proper_motion_conflict', key)
            if 'variableMagnitudeRange' in photo:
                expected_range = [numeric(row['var_min']), numeric(row['var_max'])] if row['var'] else None
                check(photo['variableMagnitudeRange'] == expected_range and photo.get('variableDesignation') == (row['var'] or None), 'variable_photometry_conflict', key)
            if s.get('spectralType') and s['spectralType'] != row['spect']:
                legacy_spectra.append({'entry': key, 'legacy': s['spectralType'], 'source': row['spect']})
        else:
            ref = figure_source['supplementalStars'].get(str(meta['hip']))
            check(ref is not None, 'missing_supplement', key)
            if ref:
                position(s['coordinates'], key, [ref['raHours'] * 15, ref['decDeg']])
                check(photo['apparentMagnitude'] == ref['magnitudeV'], 'supplement_v_conflict', key)
        current = photo.get('apparentMagnitude', photo.get('magnitudeV'))
        if s.get('magnitude') is not None and s['magnitude'] != current:
            legacy_mag.append({'entry': key, 'legacy': s['magnitude'], 'catalogueV': current})
        source_derived_fields['stellarPhotometry'] += 1

    def object_part(part, key):
        row = ngc.get(part.get('identifier', part.get('catalogue', {}).get('identifier')))
        if row is None:
            errors.append({'code': 'missing_object_source', 'entry': key})
            return
        position(part['coordinates'], key, [sexagesimal(row['RA'], True), sexagesimal(row['Dec'])])
        check(part.get('catalogue', {}).get('type', part.get('type')) == row['Type'], 'object_type_conflict', key)
        photo = part['photometry']
        for field, column in [('magnitudeV', 'V-Mag'), ('magnitudeB', 'B-Mag')]:
            expected = numeric(row[column])
            ref = harris['records'].get(key.split('/')[-1]) if field == 'magnitudeV' else None
            if expected is None and ref and ref['identifier'] == row['Name']:
                expected = ref['magnitudeV']
            check(photo.get(field) == expected, 'object_photometry_conflict', key, field=field)
        size = part.get('angularSize', {})
        for field, column in [('majorAxis', 'MajAx'), ('minorAxis', 'MinAx'), ('positionAngleDeg', 'PosAng')]:
            check(size.get(field) == numeric(row[column]), 'object_size_conflict', key, field=field)
        source_derived_fields['objectPhotometryAndSizes'] += 1

    for c in data:
        abbr = c['abbr']
        ids = {s['id']: s for s in c['stars']}
        check(len(ids) == len(c['stars']), 'duplicate_star_id', abbr)
        hips = [s['catalogue']['hip'] for s in c['stars']]
        check(len(hips) == len(set(hips)), 'duplicate_hip_in_figure', abbr)
        for s in c['stars']:
            key = abbr + '/' + s['id']
            stellar(s, key)
            hip_positions[s['catalogue']['hip']].append((key, s['coordinates'], s['photometry']))
            actual = s['catalogue'].get('constellation', abbr)
            if actual != abbr:
                cross_boundary.append({'entry': key, 'catalogueConstellation': actual})
        expected = {tuple(sorted((a, b))) for line in figures[abbr]['lines'] for a, b in zip(line, line[1:]) if a != b}
        actual = set()
        for edge in c['connections']:
            check(len(edge) == 2 and set(edge) <= ids.keys(), 'broken_edge', abbr, edge=edge)
            if len(edge) == 2 and set(edge) <= ids.keys():
                actual.add(tuple(sorted(ids[i]['catalogue']['hip'] for i in edge)))
        check(actual == expected and len(actual) == len(c['connections']), 'atlas_edge_conflict', abbr)
        for o in c['deepSkyObjects']:
            key = abbr + '/' + o['id']
            root_ids.append(o['id'])
            provider = o['catalogue']['provider']
            if o.get('components'):
                check(o['coordinates'] is None and o['photometry'].get('magnitudeV') is None, 'fabricated_group_centre_or_magnitude', key)
                check([p['identifier'] for p in o['components']] == o['catalogue']['identifiers'], 'component_coverage', key)
                for part in o['components']:
                    object_part(part, key + ':' + part['identifier'])
            elif provider == 'HYG 4.1':
                stellar(o, key)
            elif provider in ['SIMBAD', 'D. A. Green SNR catalogue']:
                ref = references['records'][o['id']]
                position(o['coordinates'], key, [sexagesimal(ref['ra'], True), sexagesimal(ref['dec'])])
                check(o['catalogue']['identifier'] == ref['identifier'], 'supplement_identity_conflict', key)
                finding('manually_transcribed_source', 'info', key, url=ref['url'], scope=ref['scope'], note='Compared with retained cited record, not a fresh remote query')
            else:
                object_part(o, key)
            for part in [o] + o.get('components', []):
                measured = part['photometry'].get('magnitudeV')
                display = part.get('displayPhotometry', {})
                part_key = key + (':' + part['identifier'] if part is not o else '')
                check(display.get('estimated') == (measured is None), 'display_estimate_flag', part_key)
                if measured is None:
                    values = {s['catalogue']['hip']: s['photometry']['apparentMagnitude'] for s in c['stars'] if s['catalogue'].get('constellation', abbr) == abbr}
                    mean = -2.5 * math.log10(sum(10 ** (-.4 * v) for v in values.values()) / len(values))
                    check(abs(display.get('magnitudeV', math.inf) - mean) < 1e-10, 'display_mean_flux_conflict', part_key)
                    unknown_v.append(part_key)
                else:
                    check(display.get('magnitudeV') == measured, 'measured_display_conflict', part_key)
            if o['catalogue'].get('reviewRequired') and not o.get('components'):
                finding('excluded_from_renderer', 'medium', key, notes=o['catalogue'].get('reviewNotes'), cause='Builder excludes every reviewRequired singleton, including verified stars')
            assignment = o['catalogue'].get('constellation', references['records'].get(o['id'], {}).get('constellation', abbr))
            assignment = {'Se1': 'Ser', 'Se2': 'Ser'}.get(assignment, assignment)
            if assignment != abbr:
                finding('object_constellation_conflict', 'high', key, actual=assignment, confidence='high')
            source_type = o['catalogue'].get('type')
            if 'group' in o['type'] and source_type == 'G':
                finding('group_represented_by_one_galaxy', 'high', key, identifier=o['catalogue']['identifier'], confidence='high', note='Group name/type, but coordinates and photometry of one member only')
            if o.get('magnitude') != o['photometry'].get('magnitudeV'):
                finding('legacy_object_magnitude', 'info', key, legacy=o.get('magnitude'), catalogueV=o['photometry'].get('magnitudeV'), note='Legacy value is not used by the current renderer')
    for hip, records in hip_positions.items():
        first = records[0]
        check(all((coords, photo) == (first[1], first[2]) for _, coords, photo in records), 'shared_star_inconsistent', str(hip))
    check(len(root_ids) == len(set(root_ids)), 'duplicate_object_id', 'deepSkyObjects')
    for key, ref in harris['records'].items():
        check(float(ref['sourceRow'][40:46]) == ref['magnitudeV'], 'harris_column_error', key)
    if 'needle_galaxy' in root_ids:
        obj = next(o for c in data for o in c['deepSkyObjects'] if o['id'] == 'needle_galaxy')
        if obj['name'] == 'Needle Galaxy' and obj['catalogue']['identifier'] == 'NGC3115':
            finding('confirmed_wrong_object_name', 'high', 'Sex/needle_galaxy', expected='Spindle Galaxy / NGC 3115', actual=obj['name'], confidence='high', sources=['https://simbad.u-strasbg.fr/simbad/sim-id?Ident=NGC+3115', 'https://science.nasa.gov/missions/hubble/hubble-sees-the-needle-galaxy-edge-on-and-up-close/'])
    metadata_fields = ['genitive', 'pronunciation', 'meaning', 'family', 'hemisphere', 'quadrant', 'visibility', 'bestSeason', 'bestViewingMonth', 'areaSqDeg', 'sizeRank', 'brightestStar', 'starsWithPlanets', 'coordinates', 'wikimediaUrl']
    missing_metadata = [{'abbr': c['abbr'], 'fields': [field for field in metadata_fields if field not in c]} for c in data]
    missing_metadata = [c for c in missing_metadata if c['fields']]
    star_keys = {c['abbr'] + '/' + s['id'] for c in data for s in c['stars']}
    return {
        'checkedOn': '2026-10-24', 'scope': 'All active catalogue rows; no scientific data modified by this audit',
        'catalogueSha256': hashlib.sha256((DATA / 'constellations_catalogue.json').read_bytes()).hexdigest(),
        'counts': {'constellations': len(data), 'starEntries': sum(len(c['stars']) for c in data), 'uniqueHip': len(hip_positions),
                   'edges': sum(len(c['connections']) for c in data), 'objects': len(root_ids),
                   'galaxyLabelledObjects': sum('galaxy' in o['type'] for c in data for o in c['deepSkyObjects']),
                   'components': sum(len(o.get('components', [])) for c in data for o in c['deepSkyObjects']),
                   'conditionalVRecordsIncludingGroupContainers': len(unknown_v)},
        'sourceFiles': verified_sources, 'verifiedFields': dict(source_derived_fields), 'integrityErrors': errors,
        'findings': findings, 'legacyStellarMagnitudeDifferences': legacy_mag,
        'legacyStellarSpectrumDifferences': legacy_spectra, 'conditionalV': unknown_v,
        'legacyDifferenceCounts': {'constellationStarMagnitude': sum(row['entry'] in star_keys for row in legacy_mag),
                                  'allStellarEntriesMagnitudeIncludingFiveObjectStars': len(legacy_mag), 'spectralTypes': len(legacy_spectra)},
        'crossBoundaryFigureVertices': cross_boundary, 'missingConstellationMetadata': missing_metadata,
        'unverifiedMetadata': ['Historical summaries (area, rank, viewing season, visibility, translations, average coordinates) lack field-level sources.',
                               'Exoplanet-host star counts lack a reference date and cannot be declared current.',
                               'Pronunciation varies; family and hemisphere are descriptive conventions.',
                               'HYG names include aliases and some explicitly unofficial component names, not exclusively IAU WGSN names.',
                               'Position/magnitude validation checks the selected fixed catalogue, not current-date astrometry or variable-star light curves.',
                               'Object morphological subtypes are historical unless separately sourced; OpenNGC G only verifies galaxy, not spiral/elliptical subtype.'],
        'limits': ['No screenshots, publication, or remote writes.', 'Supplemental SIMBAD/Green data checked against saved cited records, not refreshed remotely.',
                   'Agreement with one source is not independent confirmation of every measurement by another observatory.',
                   'Read-only data audit; confirmed semantic problems remain pending correction.'],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in PINS:
        parser.add_argument('--' + key, type=Path)
    parser.add_argument('--iau', type=Path)
    parser.add_argument('--harris', type=Path)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    report = audit({key: getattr(args, key) for key in PINS if getattr(args, key)})
    if args.iau:
        raw = args.iau.read_bytes()
        table = IauTable()
        table.feed(raw.decode())
        iau = {r['abbr']: r for r in table.rows}
        report['iauNameCheck'] = {'url': 'https://www.iau.org/IAU/Astronomy-FAQs/Constellations.aspx', 'sha256': hashlib.sha256(raw).hexdigest(), 'rows': len(iau), 'conflicts': [], 'missingFields': []}
        if len(iau) != 88:
            report['integrityErrors'].append({'code': 'iau_table_coverage', 'entry': 'IAU', 'rows': len(iau)})
        for c in load('constellations_catalogue.json'):
            for field in ['name', 'genitive']:
                if field not in c:
                    report['iauNameCheck']['missingFields'].append({'abbr': c['abbr'], 'field': field, 'expected': iau.get(c['abbr'], {}).get(field)})
                elif c['abbr'] in iau and normalized(c[field]) != normalized(iau[c['abbr']][field]):
                    report['iauNameCheck']['conflicts'].append({'abbr': c['abbr'], 'field': field, 'actual': c[field], 'expected': iau[c['abbr']][field]})
    if args.harris:
        raw = args.harris.read_bytes()
        source = load('deep_sky_photometry_source.json')
        matches = hashlib.sha256(raw).hexdigest() == source['sha256']
        report['sourceFiles'].append({'key': 'harris', 'sha256': hashlib.sha256(raw).hexdigest(), 'matchesPin': matches})
        section = raw.decode().split('Part II:  Metallicity and Photometry')[1].split('Part III:')[0]
        if not matches or not all(ref['sourceRow'] in section.splitlines() for ref in source['records'].values()):
            report['integrityErrors'].append({'code': 'harris_source_conflict', 'entry': 'Harris'})
    if args.write:
        (DATA / 'sky_data_audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'counts': report['counts'], 'integrityErrors': report['integrityErrors'], 'findingsBySeverity': dict(Counter(f['severity'] for f in report['findings'])), 'iau': report.get('iauNameCheck')}, ensure_ascii=False))
    raise SystemExit(bool(report['integrityErrors']))


if __name__ == '__main__':
    main()
