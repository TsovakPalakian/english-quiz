import importlib.util
import hashlib
import json
import math
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('enrich_catalogue', ROOT / 'ops/enrich-constellation-catalogue.py')
enrich = importlib.util.module_from_spec(spec)
spec.loader.exec_module(enrich)


class CatalogueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(enrich.CATALOGUE.read_text())
        cls.source = json.loads(enrich.SOURCE.read_text())
        cls.report = json.loads(enrich.AUDIT.read_text())
        cls.figures = json.loads((ROOT / 'data/constellation_figures_source.json').read_text())
        cls.figure_report = json.loads((ROOT / 'data/constellation_figures.audit.json').read_text())

    def test_source_matches_every_star(self):
        count = 0
        for constellation in self.data:
            ids = {s['id'] for s in constellation['stars']}
            self.assertEqual(len(ids), len(constellation['stars']))
            for edge in constellation['connections']:
                self.assertEqual(len(edge), 2)
                self.assertTrue(set(edge) <= ids)
            for star in constellation['stars']:
                count += 1
                if star['catalogue']['provider'] != 'HYG 4.1':
                    self.assertEqual(star['catalogue']['hip'], 55203)
                    ref = self.figures['supplementalStars']['55203']
                    self.assertEqual(star['coordinates'], enrich.coordinates({'id': '55203', 'ra': ref['raHours'], 'dec': ref['decDeg']}))
                    self.assertEqual(star['photometry']['apparentMagnitude'], ref['magnitudeV'])
                    continue
                hits = self.source['rows']
                chosen = [r for r in hits if int(r['id']) == star['catalogue']['hygId']]
                self.assertEqual(len(chosen), 1)
                self.assertEqual(star['coordinates'], enrich.coordinates(chosen[0]))
                self.assertEqual(star['catalogue']['constellation'], chosen[0]['con'])
                self.assertEqual(star['photometry']['apparentMagnitude'], float(chosen[0]['mag']))
                self.assertEqual(star['photometry']['colorIndexBV'], enrich.number(chosen[0]['ci']))
                self.assertTrue(math.isfinite(star['photometry']['apparentMagnitude']))
        self.assertGreaterEqual(count, 769)
        self.assertEqual(count, self.figure_report['stars'])

    def test_delta_andromeda_not_wrong_declination(self):
        star = next(s for s in self.data[0]['stars'] if s['id'] == 'delta_and')
        self.assertAlmostEqual(star['coordinates']['declinationDeg'], 30.861, places=3)
        self.assertAlmostEqual(star['coordinates']['rightAscensionDeg'], 9.832, places=3)

    def test_greek_mu_is_not_variable_star_mu(self):
        star = next(s for s in self.data[0]['stars'] if s['id'] == 'mu_and')
        self.assertEqual(star['catalogue']['bayer'], 'Mu')
        self.assertAlmostEqual(star['coordinates']['rightAscensionDeg'], 14.1883, places=3)

    def test_component_and_flamsteed_matching(self):
        for label, constellation, bayer, flam in [('γ1 And', 'And', 'Gam-1', ''), ('α² CVn', 'CVn', 'Alp-2', ''), ('51 And', 'And', '', '51')]:
            row = {'con': constellation, 'bayer': bayer, 'flam': flam}
            self.assertEqual(enrich.candidates({'bayer': label}, [row]), [row])
        self.assertEqual(enrich.candidates({'bayer': 'γ2 And'}, [{'con': 'And', 'bayer': 'Gam-1', 'flam': ''}]), [])

    def test_sexagesimal_carry_and_invalid_coordinates(self):
        coords = enrich.coordinates({'id': 'test', 'ra': '23.99999999999', 'dec': '-12.9999999999'})
        self.assertEqual(coords['rightAscension'], '00h 00m 00.000s')
        self.assertEqual(coords['declination'], '-13° 00′ 00.00″')
        for ra, dec in [('24', '0'), ('-1', '0'), ('0', '91'), ('nan', '0')]:
            with self.assertRaises(ValueError):
                enrich.coordinates({'id': 'bad', 'ra': ra, 'dec': dec})

    def test_known_limitations_are_disclosed(self):
        self.assertEqual(len({c['abbr'] for c in self.data}), 88)
        self.assertEqual(self.figure_report['constellations'], 88)
        self.assertEqual(len(self.figure_report['archivedDuplicateConstellations']), 1)
        self.assertTrue(self.report['corrections'])
        self.assertEqual(self.source['license'], 'CC-BY-SA-4.0')

    def test_original_stars_and_objects_are_preserved_or_archived(self):
        original = json.loads(subprocess.check_output(
            ['git', 'show', 'HEAD:data/constellations_catalogue.json'], cwd=ROOT))
        self.assertEqual(len(original), len(self.data))
        archive = self.figure_report['archivedDuplicateConstellations']
        for index, (before, after) in enumerate(zip(original, self.data)):
            if after['abbr'] == 'Oph' and before['abbr'] == 'Ser':
                after = archive[0]
            self.assertEqual([o['id'] for o in before['deepSkyObjects']], [o['id'] for o in after['deepSkyObjects']])
            for old, new in zip(before['deepSkyObjects'], after['deepSkyObjects']):
                for key in ['x', 'y', 'radius', 'magnitude', 'type']:
                    self.assertEqual(old[key], new[key])
            by_id = {s['id']: s for s in after['stars']}
            self.assertTrue({s['id'] for s in before['stars']} <= by_id.keys())
            for old in before['stars']:
                new = by_id[old['id']]
                if before['abbr'] == 'Cam' and old['id'] == 'cs_cam':
                    self.assertEqual(new['catalogue']['hip'], 16228)
                    self.assertEqual(new['photometry']['variableDesignation'], 'CS')
                    self.assertTrue(self.figure_report['starIdentityCorrections'])
                    continue
                for key in ['x', 'y', 'radius', 'magnitude', 'spectralType', 'bayer']:
                    self.assertEqual(old.get(key), new.get(key))

    def test_every_atlas_edge_and_vertex_is_present(self):
        by_abbr = {c['abbr']: c for c in self.data}
        figures={f['id'].split()[-1]: f for f in self.figures['catalogue']['constellations']}
        refined=ROOT/'data/constellation_refinements_source.json'
        if refined.exists():figures.update(json.loads(refined.read_text())['reviewedOverrides'])
        figures.update(json.loads((ROOT/'data/constellation_go_astronomy_source.json').read_text())['reviewedOverrides'])
        for figure in figures.values():
            c = by_abbr[figure['id'].split()[-1]]
            stars = {s['id']: s['catalogue']['hip'] for s in c['stars']}
            self.assertEqual(len(set(stars.values())), len(stars), c['abbr']+' duplicate HIP')
            expected = {tuple(sorted((a, b))) for line in figure['lines'] for a, b in zip(line, line[1:]) if a != b}
            actual = {tuple(sorted(stars[s] for s in edge)) for edge in c['connections']}
            self.assertEqual(actual, expected, c['abbr'])
            self.assertEqual(len(actual), len(c['connections']))
            self.assertTrue({hip for pair in expected for hip in pair} <= set(stars.values()))
        hor = by_abbr['Hor']
        self.assertEqual(len(hor['connections']), 5)
        self.assertEqual(len(hor['stars']), 7)  # Six figure vertices plus retained delta.
        self.assertEqual(len(by_abbr['Gem']['connections']), 15)
        self.assertEqual(len(by_abbr['For']['stars']), 4)
        self.assertEqual(len(by_abbr['For']['connections']), 4)
        self.assertGreaterEqual(len(by_abbr['Mic']['stars']), 5)
        self.assertEqual({s['catalogue']['hip'] for s in by_abbr['Men']['stars']}, {29271, 25918, 23467, 22871})
        self.assertEqual(len(by_abbr['Men']['connections']), 3)

    def test_figures_against_pinned_d3_and_reviewed_go_sources(self):
        refined = json.loads((ROOT/'data/constellation_refinements_source.json').read_text())
        raw_lines = (ROOT/'data/constellation_lines_d3_source.json').read_bytes()
        raw_stars = (ROOT/'data/constellation_stars_d3_source.json').read_bytes()
        for raw, source in zip([raw_lines, raw_stars], refined['files']):
            self.assertEqual(hashlib.sha256(raw).hexdigest(), source['sha256'])
        coordinates = {tuple(s['geometry']['coordinates']): int(s['id']) for s in json.loads(raw_stars)['features']}
        coordinates.update({(-146.6341,51.7879):69481, (131.6666,28.7651):43100, (34.8366,-2.9776):10826})
        expected = {}
        for feature in json.loads(raw_lines)['features']:
            target = expected.setdefault(feature['id'], set())
            for line in feature['geometry']['coordinates']:
                hips = [coordinates[tuple(p)] for p in line]
                target.update(tuple(sorted(pair)) for pair in zip(hips, hips[1:]) if pair[0] != pair[1])
        self.assertEqual(len(expected), 88)
        go = json.loads((ROOT/'data/constellation_go_astronomy_source.json').read_text())
        evidence = json.loads((ROOT/'docs/reports/2026-10-24-go-astronomy-audit-sources.json').read_text())
        reviewed = {s['abbr']:s for s in evidence['sources'] if s['status']=='different'}
        self.assertEqual(set(go['reviewedOverrides']), set(reviewed))
        for abbr, figure in go['reviewedOverrides'].items():
            self.assertEqual(figure['imageSha256'], reviewed[abbr]['sha256'])
            self.assertEqual(figure['page'], reviewed[abbr]['page'])
            expected[abbr] = {tuple(sorted(pair)) for line in figure['lines'] for pair in zip(line,line[1:]) if pair[0]!=pair[1]}
        for c in self.data:
            hips = {s['id']:s['catalogue']['hip'] for s in c['stars']}
            self.assertEqual({tuple(sorted(hips[s] for s in edge)) for edge in c['connections']}, expected[c['abbr']], c['abbr'])
            self.assertTrue({h for pair in expected[c['abbr']] for h in pair} <= set(hips.values()))
        self.assertEqual(len(refined['reviewedOverrides']), 88)
        self.assertTrue(all(row['unresolvedComparisonCoordinates']==0 for row in refined['atlasComparison']))

    def test_nonselected_figures_and_existing_positions_were_not_changed(self):
        original = json.loads(subprocess.check_output(['git','show','HEAD:data/constellations_catalogue.json'],cwd=ROOT))
        go = json.loads((ROOT/'data/constellation_go_astronomy_source.json').read_text())['reviewedOverrides']
        for before, after in zip(original, self.data):
            if before['abbr'] not in go:
                self.assertEqual(before['connections'], after['connections'], after['abbr'])
            stars = {s['id']:s for s in after['stars']}
            for old in before['stars']:
                self.assertEqual(old['coordinates'], stars[old['id']]['coordinates'])
                self.assertEqual(old['photometry'], stars[old['id']]['photometry'])

    def test_go_designations_resolve_to_the_pinned_stellar_rows(self):
        spec = importlib.util.spec_from_file_location('go_figures', ROOT/'ops/import-go-astronomy-figures.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        paths = json.loads((ROOT/'data/constellation_go_astronomy_paths.json').read_text())
        source = json.loads((ROOT/'data/constellation_go_astronomy_source.json').read_text())['reviewedOverrides']
        for c in self.data:
            if c['abbr'] not in paths:
                continue
            existing = {s['catalogue']['hip'] for s in c['stars']}
            resolved = [[module.resolve(t,c['abbr'],self.source['rows'],existing) for t in p.split()] for p in paths[c['abbr']]]
            self.assertEqual(source[c['abbr']]['lines'],resolved)
        with self.assertRaises(ValueError):
            module.resolve('not-a-star','For',self.source['rows'],set())

    def test_import_is_idempotent(self):
        paths = [enrich.CATALOGUE, enrich.SOURCE, ROOT / 'data/constellation_figures_source.json', ROOT / 'data/constellation_figures.audit.json']
        before = {p: p.read_bytes() for p in paths}
        subprocess.run(['python3', str(ROOT / 'ops/complete-constellation-figures.py'), '--write'], check=True, capture_output=True)
        for p in paths:
            self.assertEqual(p.read_bytes(), before[p], str(p))


if __name__ == '__main__':
    unittest.main()
