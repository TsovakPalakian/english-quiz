"""Enrich only existing deepSkyObjects from pinned catalogue snapshots."""
import argparse
import csv
import hashlib
import importlib.util
import io
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
CATALOGUE = DATA / 'constellations_catalogue.json'
SOURCE = DATA / 'deep_sky_catalogue_source.json'
AUDIT = DATA / 'deep_sky_catalogue.audit.json'
REFERENCES = DATA / 'deep_sky_references.json'
spec = importlib.util.spec_from_file_location('stellar_enrichment', ROOT / 'ops/enrich-constellation-catalogue.py')
stellar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stellar)
PINS = {'NGC.csv': 'efa4b71036d8967c4c698a57fb0526288e201623',
        'addendum.csv': '490b5b1274f9d83a18fa46b50a7babd1f219e80e',
        'hygdata_v41.csv': stellar.BLOB}
BINDINGS = {
    'circinus_galaxy': ['ESO097-013'], 'large_magellanic_cloud': ['ESO056-115'],
    'lmc_edge': ['ESO056-115'], 'fornax_dwarf': ['ESO356-004'],
    'horsehead_nebula': ['B033'], 'hyades': ['C041'], 'cr_399': ['Cl399'],
    'double_cluster': ['C014'], 'spindle_galaxy': ['NGC5866'],
    'mirachs_ghost': ['NGC0404'], 'witch_head_nebula': ['NGC1909'],
    'robert_quartet': ['NGC0087', 'NGC0088', 'NGC0089', 'NGC0092'],
}
STELLAR_IDS = {'garnet_star': '106916', 'hind_crimson_star': '23149',
               'kapteyn_star': '24129', 'lacaille_9352': '113687', 'cygnus_x1': '97987'}


def canonical(value):
    value = value.strip().upper()
    match = re.fullmatch(r'(NGC|IC|M|C|HCG|MEL|B|CL)\s*0*(\d+)', value)
    return match[1] + str(int(match[2])) if match else value


def read_pinned(path, name, delimiter):
    raw = path.read_bytes()
    digest = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    if digest != PINS[name]:
        raise ValueError(f'Unreviewed source version: {name}')
    return list(csv.DictReader(io.StringIO(raw.decode()), delimiter=delimiter))


def index_rows(rows):
    index = {}
    for row in rows:
        aliases = [row['Name']] + row['Identifiers'].split(',')
        if row['M']:
            aliases.append('M' + row['M'])
        for alias in aliases:
            if alias.strip():
                index.setdefault(canonical(alias), {})[row['Name']] = row
    return index


def resolve(obj, index):
    targets = BINDINGS.get(obj['id'], obj['catalog'].split(' / '))
    hits = {}
    for target in targets:
        hits.update(index.get(canonical(target), {}))
    return list(hits.values())


def position(ra, dec, frame='equatorial', scope='catalogue reference position'):
    def sexagesimal(value):
        parts = value.lstrip('+-').split(':')
        if len(parts) != 3:
            raise ValueError(f'Invalid sexagesimal value: {value}')
        h, m, s = map(float, parts)
        if not 0 <= m < 60 or not 0 <= s < 60:
            raise ValueError(f'Invalid sexagesimal value: {value}')
        return (h + m / 60 + s / 3600) * (-1 if value.startswith('-') else 1)
    ra_hours, dec_deg = sexagesimal(ra), sexagesimal(dec)
    result = stellar.coordinates({'id': 'DSO', 'ra': str(ra_hours), 'dec': str(dec_deg)})
    # Preserve the precision actually published, rather than padded precision.
    result.update(frame=frame, rightAscension=ra, declination=dec, positionScope=scope)
    return result


def component(row):
    return {
        'identifier': row['Name'], 'type': row['Type'],
        'constellation': row['Const'],
        'coordinates': position(row['RA'], row['Dec']),
        'photometry': {'magnitudeV': stellar.number(row['V-Mag']), 'magnitudeB': stellar.number(row['B-Mag'])},
        'angularSize': {'unit': 'arcmin', 'majorAxis': stellar.number(row['MajAx']),
                        'minorAxis': stellar.number(row['MinAx']), 'positionAngleDeg': stellar.number(row['PosAng'])},
        'source': 'deep_sky_catalogue_source.json', 'provider': 'OpenNGC / Mattia Verga',
        'fieldReferences': row['Sources'],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ngc', type=Path)
    parser.add_argument('--addendum', type=Path)
    parser.add_argument('--hyg', type=Path)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    if any([args.ngc, args.addendum, args.hyg]) and not all([args.ngc, args.addendum, args.hyg]):
        parser.error('Supply all three source paths together')
    data = json.loads(CATALOGUE.read_text())
    objects = [o for c in data for o in c['deepSkyObjects']]
    supplemental = json.loads(REFERENCES.read_text())
    if args.ngc:
        rows = read_pinned(args.ngc, 'NGC.csv', ';') + read_pinned(args.addendum, 'addendum.csv', ';')
        index = index_rows(rows)
        needed = {r['Name'] for obj in objects if obj['id'] not in supplemental['records'] and obj['id'] not in STELLAR_IDS for r in resolve(obj, index)}
        hyg = read_pinned(args.hyg, 'hygdata_v41.csv', ',')
        source = {
            'provider': 'OpenNGC / Mattia Verga; HYG 4.1 / Astronexus',
            'license': 'CC-BY-SA-4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
            'files': [{'url': 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/' + name, 'gitBlobSha1': PINS[name]} for name in ['NGC.csv', 'addendum.csv']],
            'hygSource': {'url': stellar.URL, 'gitBlobSha1': stellar.BLOB},
            'documentation': 'https://github.com/mattiaverga/OpenNGC/blob/master/NGC_guide.txt',
            'rows': [r for r in rows if r['Name'] in needed],
            'stellarRows': [{k: r[k] for k in stellar.FIELDS} for r in hyg if r['id'] in STELLAR_IDS.values()],
        }
    else:
        source = json.loads(SOURCE.read_text())
    index = index_rows(source['rows'])
    hyg = {r['id']: r for r in source['stellarRows']}
    warnings, unresolved = [], []
    old_report = json.loads(AUDIT.read_text()) if AUDIT.exists() else {}
    corrections = old_report.get('corrections', [])
    def correct(obj, field, new, url):
        if obj[field] != new:
            corrections.append({'id': obj['id'], 'field': field, 'old': obj[field], 'new': new, 'source': url})
            obj[field] = new
    for c in data:
        for obj in c['deepSkyObjects']:
            key = obj['id']
            for field in ['coordinates', 'catalogue', 'photometry', 'angularSize', 'components', 'displayPhotometry']:
                obj.pop(field, None)
            if key in supplemental['records']:
                ref = supplemental['records'][key]
                obj['coordinates'] = position(ref['ra'], ref['dec'], ref['frame'], ref['scope'])
                obj['catalogue'] = {'provider': 'D. A. Green SNR catalogue' if key in ['sn_1006', 'vela_snr'] else 'SIMBAD', 'identifier': ref['identifier'], 'url': ref['url'], 'reference': ref['reference'], 'source': 'deep_sky_references.json'}
                obj['photometry'] = {'magnitudeV': None, 'magnitudeB': None, 'status': 'not verified; original magnitude retained separately'}
                if 'majorAxisArcmin' in ref:
                    obj['angularSize'] = {'unit': 'arcmin', 'majorAxis': ref['majorAxisArcmin'], 'minorAxis': ref['minorAxisArcmin']}
                if 'correctedCatalog' in ref:
                    correct(obj, 'catalog', ref['correctedCatalog'], ref.get('identitySource', ref['url']))
                if ref.get('constellation', c['abbr']) != c['abbr']:
                    warnings.append({'constellation': c['abbr'], 'id': key, 'issue': 'Listed under the wrong constellation; original grouping preserved.', 'catalogueConstellation': ref['constellation']})
            elif key in STELLAR_IDS:
                r = hyg[STELLAR_IDS[key]]
                obj['coordinates'] = stellar.coordinates(r)
                obj['coordinates']['positionScope'] = 'optical companion of the X-ray binary, not an isolated black hole' if key == 'cygnus_x1' else 'stellar catalogue position'
                obj['catalogue'] = {'provider': 'HYG 4.1', 'hygId': int(r['id']), 'hip': r['hip'] or None, 'hd': r['hd'] or None, 'source': 'deep_sky_catalogue_source.json'}
                obj['photometry'] = {'magnitudeV': stellar.number(r['mag']), 'colorIndexBV': stellar.number(r['ci']), 'scope': 'stellar optical photometry'}
                warnings.append({'constellation': c['abbr'], 'id': key, 'issue': 'Existing deepSkyObjects entry is a star or optical binary counterpart, not a diffuse DSO; retained in place.'})
            else:
                rows = resolve(obj, index)
                if not rows:
                    unresolved.append({'constellation': c['abbr'], 'id': key, 'catalog': obj['catalog']})
                    continue
                if key == 'robert_quartet':
                    correct(obj, 'catalog', 'NGC 87 / NGC 88 / NGC 89 / NGC 92', 'https://eso.org/public/news/eso0535/')
                if key == 'cr_399':
                    correct(obj, 'catalog', 'Collinder 399', source['documentation'])
                if key == 'mirachs_ghost':
                    correct(obj, 'catalog', 'NGC 404', source['documentation'])
                parts = [component(r) for r in rows]
                if len(parts) > 1:
                    obj['components'] = parts
                    # Do not manufacture an authoritative group centroid from individual galaxies.
                    obj['coordinates'] = None
                    obj['catalogue'] = {'provider': 'OpenNGC', 'identifiers': [r['Name'] for r in rows], 'positionScope': 'multiple objects: use component coordinates; no verified group centre', 'source': 'deep_sky_catalogue_source.json'}
                    obj['photometry'] = {'magnitudeV': None, 'magnitudeB': None, 'scope': 'component measurements only; no verified integrated group magnitude'}
                    warnings.append({'constellation': c['abbr'], 'id': key, 'issue': 'Multiple referenced objects; individual coordinates retained without inventing a group centre.'})
                else:
                    p = parts[0]
                    obj['coordinates'] = p['coordinates']
                    obj['photometry'] = p['photometry']
                    obj['angularSize'] = p['angularSize']
                    obj['catalogue'] = {k: p[k] for k in ['provider', 'identifier', 'type', 'constellation', 'source', 'fieldReferences']}
                    actual = {'Se1': 'Ser', 'Se2': 'Ser'}.get(rows[0]['Const'], rows[0]['Const'])
                    if actual != c['abbr']:
                        warnings.append({'constellation': c['abbr'], 'id': key, 'issue': 'Catalogue position is in another constellation; original grouping retained.', 'catalogueConstellation': actual})
                    if rows[0]['Type'] in ['Dup', 'NonEx']:
                        warnings.append({'constellation': c['abbr'], 'id': key, 'issue': 'OpenNGC marks this entry as duplicate/nonexistent; review master identification.', 'type': rows[0]['Type']})
            if key == 'lmc_edge':
                warnings.append({'constellation': c['abbr'], 'id': key, 'issue': 'Coordinates refer to the whole LMC, not a separately measured extension in Mensa.'})
            if key == 'm110':
                correct(obj, 'name', 'Messier 110 (NGC 205)', 'https://science.nasa.gov/image-article/apod-2008-september-9-m110-satellite-of-the-andromeda-galaxy/')
            if key == 'm74_galaxy_note':
                correct(obj, 'name', 'Skull Nebula (NGC 246)', 'https://www.eso.org/public/images/eso2019a/')
    report = {'checkedOn': supplemental['checkedOn'], 'entries': len(objects), 'matched': len(objects) - len(unresolved), 'unresolved': unresolved, 'corrections': corrections, 'warnings': warnings,
              'scope': 'Only pre-existing deepSkyObjects entries. Source positions, available B/V photometry and angular sizes. Original x/y/radius/magnitude/type retained. Missing photometry is null, never guessed.',
              'limitations': ['A catalogue reference position may differ from a nebular geometric centre.', 'Published photometry is band-dependent and may be absent or variable.', 'Group components are not substituted for an authoritative group centre.', 'Constellation assignments with conflicts remain flagged rather than silently moved.']}
    if unresolved:
        print(json.dumps(unresolved, ensure_ascii=False, indent=2))
        raise ValueError('Unresolved objects; output not written')
    for c in data:
        for obj in c['deepSkyObjects']:
            notes = [w['issue'] for w in warnings if w['constellation'] == c['abbr'] and w['id'] == obj['id']]
            obj['catalogue']['reviewRequired'] = bool(notes)
            obj['catalogue']['reviewNotes'] = notes
    # Keep later measured supplements and explicitly derived display values reproducible.
    display_spec = importlib.util.spec_from_file_location('complete_figures', ROOT / 'ops/complete-constellation-figures.py')
    display = importlib.util.module_from_spec(display_spec)
    display_spec.loader.exec_module(display)
    display.apply_measured_photometry(data)
    display.apply_display_photometry(data)
    if args.write:
        if args.ngc:
            stellar.dump(SOURCE, source)
        stellar.dump(CATALOGUE, data)
        stellar.dump(AUDIT, report)
    print(json.dumps({'entries': len(objects), 'matched': report['matched'], 'corrections': len(corrections), 'warnings': len(warnings), 'written': args.write}))


if __name__ == '__main__':
    main()
