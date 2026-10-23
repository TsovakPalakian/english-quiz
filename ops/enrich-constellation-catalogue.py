"""Enrich existing stars from a version-checked HYG 4.1 snapshot; never invent positions."""
import argparse
import csv
import hashlib
import io
import json
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / 'data/constellations_catalogue.json'
SOURCE = ROOT / 'data/constellations_hyg_source.json'
AUDIT = ROOT / 'data/constellations_catalogue.audit.json'
URL = 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv'
BLOB = 'ba2dec4eb0f6768914c7fc1051258100214ddf84'
GREEK = dict(zip('αβγδεζηθικλμνξοπρστυφχψω',
                 'Alp Bet Gam Del Eps Zet Eta The Iot Kap Lam Mu Nu Xi Omi Pi Rho Sig Tau Ups Phi Chi Psi Ome'.split()))
FIELDS = 'id hip hd hr proper ra dec mag spect ci bayer flam con pmra pmdec var var_min var_max'.split()
# Unqualified double-star designations need an explicit representative, not a guessed match.
REPRESENTATIVES = {
    'γ Ari': '8813', 'μ Boo': '75182', 'ι Cnc': '42984', 'α Cen': '71456',
    'α Com': '64037', 'γ CrA': '93530', 'α Cru': '60530', 'β Cyg': '95648',
    'θ Eri': '13813', 'α Gem': '36744', 'α Her': '84086', 'κ Lup': '74148',
    'ζ UMa': '65173', 'γ Vel': '39840', 'γ Vir': '61748', 'γ Vol': '34389',
}


def number(value):
    return float(value) if value not in ('', None) else None


def candidates(star, rows):
    prefix, constellation = unicodedata.normalize('NFKC', star['bayer']).split()
    if prefix.isdigit():
        return [r for r in rows if r['con'] == constellation and r['flam'] == prefix]
    designation = GREEK[prefix[0]] + ('-' + prefix[1:] if len(prefix) > 1 else '')
    exact = [r for r in rows if r['con'] == constellation and r['bayer'] == designation]
    if exact:
        return exact
    if len(prefix) > 1:
        return []
    return [r for r in rows if r['con'] == constellation and r['bayer'].split('-')[0] == designation]


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def coordinates(row):
    ra, dec = number(row['ra']), number(row['dec'])
    if ra is None or dec is None or not 0 <= ra < 24 or not -90 <= dec <= 90:
        raise ValueError(f"Invalid coordinates for HYG {row['id']}")
    # Work in integer milliseconds/centiseconds so sexagesimal values carry correctly.
    ra_ms = round(ra * 3600000) % 86400000
    h, rem = divmod(ra_ms, 3600000)
    m, ms = divmod(rem, 60000)
    dec_cs = round(abs(dec) * 360000)
    d, rem = divmod(dec_cs, 360000)
    dm, cs = divmod(rem, 6000)
    return {
        'frame': 'equatorial', 'equinox': 'J2000.0', 'epoch': 'J2000.0',
        'rightAscension': f'{h:02d}h {m:02d}m {ms / 1000:06.3f}s',
        'declination': f'{"-" if dec < 0 else "+"}{d:02d}° {dm:02d}′ {cs / 100:05.2f}″',
        'rightAscensionDeg': round(ra * 15, 9), 'declinationDeg': dec,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-csv', type=Path)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    catalogue = json.loads(CATALOGUE.read_text())
    stars = [s for c in catalogue for s in c['stars']]
    if args.source_csv:
        raw = args.source_csv.read_bytes()
        digest = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        if digest != BLOB:
            raise ValueError('HYG file differs from the audited 4.1 release')
        rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8'))))
        selected = {r['id'] for s in stars for r in candidates(s, rows)}
        source = {
            'provider': 'HYG 4.1 (Astronexus; Hipparcos, Yale, Gliese)',
            'url': URL, 'gitBlobSha1': BLOB,
            'documentation': 'https://github.com/astronexus/HYG-Database/blob/main/hyg/README.md',
            'license': 'CC-BY-SA-4.0',
            'licenseUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
            'retrievedAt': datetime.now(timezone.utc).isoformat(),
            'rows': [{k: r[k] for k in FIELDS} for r in rows if r['id'] in selected],
        }
    else:
        source = json.loads(SOURCE.read_text())
        if source['gitBlobSha1'] != BLOB:
            raise ValueError('Unexpected source snapshot version')
    rows = source['rows']
    previous = json.loads(AUDIT.read_text()) if AUDIT.exists() else {}
    corrections = previous.get('corrections', []) if previous.get('sourceBlobSha1') == BLOB else []
    warnings, missing = [], []
    seen = set()
    for index, c in enumerate(catalogue):
        if c['abbr'] in seen:
            warnings.append({'entry': index, 'constellation': c['abbr'], 'issue': 'Duplicate constellation. Ophiuchus is missing; retained original rather than inventing its metadata.'})
        seen.add(c['abbr'])
        for old, new in [('Sga', 'Sge'), ('Tra', 'TrA')]:
            if c['abbr'] == old:
                c['abbr'] = new
                corrections.append({'entry': index, 'field': 'abbr', 'old': old, 'new': new})
        for key in ['goAstronomyUrl', 'wikimediaUrl']:
            if c[key].startswith('[https://') and '](' in c[key]:
                old = c[key]
                c[key] = old[1:old.index('](')]
                corrections.append({'entry': index, 'field': key, 'old': old, 'new': c[key]})
        ids = {s['id'] for s in c['stars']}
        if len(ids) != len(c['stars']):
            raise ValueError(f"Duplicate star id in {c['name']}")
        for edge in c['connections']:
            if len(edge) != 2 or any(s not in ids for s in edge):
                raise ValueError(f"Broken connection in {c['name']}: {edge}")
        for s in c['stars']:
            hits = candidates(s, rows)
            representative = REPRESENTATIVES.get(s['bayer'])
            if representative:
                chosen = [r for r in hits if r['id'] == representative]
            else:
                chosen = hits if len(hits) == 1 else []
            if len(chosen) != 1:
                missing.append({'constellation': c['abbr'], 'star': s['id'], 'candidates': [r['id'] for r in hits]})
                continue
            r = chosen[0]
            s['coordinates'] = coordinates(r)
            s['catalogue'] = {
                'provider': 'HYG 4.1', 'hygId': int(r['id']),
                'hip': int(r['hip']) if r['hip'] else None,
                'hd': int(r['hd']) if r['hd'] else None,
                'hr': int(r['hr']) if r['hr'] else None,
                'bayer': r['bayer'], 'constellation': r['con'],
                'properName': r['proper'] or None,
                'source': 'constellations_hyg_source.json',
                'positionScope': 'representative component/catalogue entry; not a system barycentre' if representative else 'matched catalogue entry',
            }
            s['photometry'] = {
                'band': 'V', 'apparentMagnitude': number(r['mag']),
                'colorIndexBV': number(r['ci']),
                'variableDesignation': r['var'] or None,
                'variableMagnitudeRange': [number(r['var_min']), number(r['var_max'])] if r['var'] else None,
            }
            s['catalogueSpectralType'] = r['spect'] or None
            s['properMotion'] = {'unit': 'mas/year', 'rightAscension': number(r['pmra']), 'declination': number(r['pmdec'])}
            if representative:
                s['catalogue']['candidateHygIds'] = [int(h['id']) for h in hits]
                warnings.append({'constellation': c['abbr'], 'star': s['id'], 'issue': 'Unqualified multiple-star designation: explicit representative retained; inspect components before resolved rendering.', 'hygId': int(r['id'])})
            if abs(s['magnitude'] - float(r['mag'])) > 0.15:
                warnings.append({'constellation': c['abbr'], 'star': s['id'], 'issue': 'Historical magnitude differs from HYG V by >0.15; preserved original (variability/components/band may differ).', 'original': s['magnitude'], 'hygV': float(r['mag'])})
            if c['abbr'] == 'Boo' and s['bayer'] == 'β Boo' and s['name'] == 'Nusakan':
                s['name'] = r['proper']
                corrections.append({'constellation': 'Boo', 'star': s['id'], 'field': 'name', 'old': 'Nusakan', 'new': s['name']})
    if missing:
        print(json.dumps({'unresolved': missing}, ensure_ascii=False, indent=2))
        raise ValueError('Unresolved stars; catalogue not written')
    # Do not silently claim validation of unrelated constellation summaries or DSOs.
    report = {
        'verifiedAt': source['retrievedAt'], 'source': source['url'], 'sourceBlobSha1': BLOB,
        'license': source['license'], 'licenseUrl': source['licenseUrl'],
        'constellationEntries': len(catalogue), 'uniqueConstellations': len({c['abbr'] for c in catalogue}),
        'starEntries': len(stars), 'matchedStars': len(stars) - len(missing),
        'scope': 'Existing Bayer/Flamsteed stars: J2000 positions, V magnitude, B-V colour, spectral types, proper motions. Schematic x/y/radius and historical magnitudes preserved. No website integration.',
        'limitations': ['Not a complete stellar census of each constellation.', 'Constellation summaries, star aliases, nonstellar objects and drawn connections are not fully verified.', 'Historical averages do not describe instantaneous variable-star brightness.', 'HYG coordinates are not propagated to the current date.'],
        'corrections': corrections, 'warnings': warnings,
    }
    if args.write:
        if args.source_csv:
            dump(SOURCE, source)
        dump(CATALOGUE, catalogue)
        dump(AUDIT, report)
    print(json.dumps({'stars': len(stars), 'sourceRows': len(rows), 'corrections': len(corrections), 'warnings': len(warnings), 'written': args.write}))


if __name__ == '__main__':
    main()
