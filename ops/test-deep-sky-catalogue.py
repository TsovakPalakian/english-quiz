import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('deep_sky', ROOT / 'ops/enrich-deep-sky-catalogue.py')
dso = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dso)


class DeepSkyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(dso.CATALOGUE.read_text())
        cls.objects = [o for c in cls.data for o in c['deepSkyObjects']]
        cls.source = json.loads(dso.SOURCE.read_text())
        cls.archive = json.loads((ROOT / 'data/constellation_figures.audit.json').read_text())['archivedDuplicateConstellations']

    def test_no_new_objects_or_layout_changes(self):
        before = json.loads(subprocess.check_output(['git', 'show', 'HEAD:data/constellations_catalogue.json'], cwd=ROOT))
        self.assertEqual(len(self.objects), 157)
        self.assertEqual(len(self.objects) + sum(len(c['deepSkyObjects']) for c in self.archive), 159)
        for old, new in zip(before, self.data):
            if new['abbr'] == 'Oph' and old['abbr'] == 'Ser':
                new = self.archive[0]
            self.assertEqual([o['id'] for o in old['deepSkyObjects']], [o['id'] for o in new['deepSkyObjects']])
            for a, b in zip(old['deepSkyObjects'], new['deepSkyObjects']):
                for key in ['x', 'y', 'radius', 'magnitude', 'type']:
                    self.assertEqual(a[key], b[key])

    def test_every_existing_object_has_sourced_coordinates(self):
        for obj in self.objects:
            self.assertTrue(obj['catalogue']['source'])
            parts = obj.get('components', [])
            coords = [obj['coordinates']] if obj['coordinates'] else [p['coordinates'] for p in parts]
            self.assertTrue(coords, obj['id'])
            for position in coords:
                self.assertTrue(0 <= position['rightAscensionDeg'] < 360)
                self.assertTrue(-90 <= position['declinationDeg'] <= 90)
                self.assertEqual(position['epoch'], 'J2000.0')
            if parts:
                self.assertIsNone(obj['coordinates'])
                self.assertIsNone(obj['photometry']['magnitudeV'])

    def test_aliases_do_not_conflate_messier_and_planetary_nebula(self):
        self.assertNotEqual(dso.canonical('M2-9'), dso.canonical('M29'))
        self.assertEqual(dso.canonical('NGC 00404'), dso.canonical('NGC404'))
        self.assertEqual(dso.canonical('C 028'), dso.canonical('C28'))

    def test_sourced_object_not_wrong_alias(self):
        lookup = {o['id']: o for o in self.objects}
        ghost = lookup['mirachs_ghost']
        self.assertEqual(ghost['catalogue']['identifier'], 'NGC0404')
        self.assertNotIn('components', ghost)
        self.assertAlmostEqual(ghost['coordinates']['rightAscensionDeg'], 17.36258, places=3)
        stingray = lookup['stingray_nebula']
        self.assertIn('Hen 3-1357', stingray['catalog'])
        self.assertLess(stingray['coordinates']['declinationDeg'], -59)
        self.assertEqual(lookup['hind_crimson_star']['catalogue']['hygId'], 23149)
        self.assertEqual(lookup['witch_head_nebula']['catalogue']['type'], 'RfN')

    def test_group_members_and_missing_photometry(self):
        lookup = {o['id']: o for o in self.objects}
        self.assertEqual([p['identifier'] for p in lookup['robert_quartet']['components']], ['NGC0087', 'NGC0088', 'NGC0089', 'NGC0092'])
        self.assertIsNone(lookup['sagittarius_a']['photometry']['magnitudeV'])
        self.assertEqual(lookup['vela_snr']['angularSize']['majorAxis'], 255)
        self.assertTrue(lookup['abell_2151']['catalogue']['reviewRequired'])

    def test_sexagesimal_invalid_values(self):
        for ra, dec in [('24:00:00', '+00:00:00'), ('00:60:00', '+00:00:00'), ('00:00:00', '-91:00:00')]:
            with self.assertRaises(ValueError):
                dso.position(ra, dec)

    def test_rebuild_is_idempotent(self):
        before = {p: p.read_bytes() for p in [dso.CATALOGUE, dso.SOURCE, dso.AUDIT]}
        subprocess.run([sys.executable, str(ROOT / 'ops/enrich-deep-sky-catalogue.py'), '--write'], check=True, capture_output=True)
        for path, raw in before.items():
            self.assertEqual(path.read_bytes(), raw, str(path))

    def test_missing_v_is_only_estimated_for_display(self):
        import math
        for c in self.data:
            stars = {s['catalogue'].get('hip') or ('hyg', s['catalogue'].get('hygId')): s for s in c['stars']
                     if s['catalogue'].get('constellation', c['abbr']) == c['abbr']}
            mean = -2.5 * math.log10(sum(10 ** (-.4 * s['photometry']['apparentMagnitude']) for s in stars.values()) / len(stars))
            for obj in c['deepSkyObjects']:
                for part in [obj] + obj.get('components', []):
                    measured = part['photometry'].get('magnitudeV')
                    display = part['displayPhotometry']
                    self.assertEqual(display['estimated'], measured is None)
                    self.assertAlmostEqual(display['magnitudeV'], mean if measured is None else measured)
                    if measured is None:
                        self.assertEqual(display['method'], 'constellation-mean-linear-V-flux')
                        self.assertNotEqual(display['note'], 'measured')

    def test_harris_integrated_v_is_not_horizontal_branch(self):
        lookup = {o['id']: o for o in self.objects}
        for key, value in [('ngc6101', 9.16), ('ngc1851', 7.14), ('ngc6541', 6.30), ('ngc6934', 8.83), ('ngc4833', 6.91), ('m71', 8.19)]:
            obj = lookup[key]
            self.assertEqual(obj['photometry']['magnitudeV'], value)
            self.assertEqual(obj['photometry']['magnitudeVSource'], 'deep_sky_photometry_source.json')
            self.assertFalse(obj['displayPhotometry']['estimated'])


if __name__ == '__main__':
    unittest.main()
