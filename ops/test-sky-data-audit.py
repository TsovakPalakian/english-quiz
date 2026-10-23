"""Regression tests for the independent read-only data audit, including negative cases."""
import copy
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('sky_audit', Path(__file__).with_name('audit-sky-data.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditTests(unittest.TestCase):
    def test_current_data_integrity_and_honest_findings(self):
        report = audit.audit()
        self.assertEqual(report['integrityErrors'], [])
        self.assertGreaterEqual(report['counts']['starEntries'], 769)
        self.assertGreaterEqual(report['counts']['uniqueHip'], 757)
        self.assertEqual(report['counts']['objects'], 157)
        self.assertEqual(report['counts']['components'], 8)
        self.assertEqual(report['legacyDifferenceCounts']['constellationStarMagnitude'], 66)
        high = {r['entry'] for r in report['findings'] if r['severity'] == 'high'}
        self.assertEqual(high, {'CrB/abell_2151', 'Gru/grus_quadartet', 'LMi/hickson_44', 'Men/lmc_edge', 'Sex/needle_galaxy'})

    def modified_report(self, mutate):
        original = audit.load
        data = copy.deepcopy(original('constellations_catalogue.json'))
        mutate(data)
        with patch.object(audit, 'load', side_effect=lambda name: data if name == 'constellations_catalogue.json' else original(name)):
            return {e['code'] for e in audit.audit()['integrityErrors']}

    def test_wrong_hip_is_detected_not_just_right_hyg_id(self):
        def mutate(data):
            data[0]['stars'][0]['catalogue']['hip'] = 99999
        self.assertIn('hip_identity_conflict', self.modified_report(mutate))

    def test_wrong_coordinates_and_magnitudes_are_detected(self):
        def mutate(data):
            data[0]['stars'][0]['coordinates']['rightAscensionDeg'] += 1
            data[0]['stars'][0]['photometry']['apparentMagnitude'] += 1
        codes = self.modified_report(mutate)
        self.assertTrue({'coordinate_source_conflict', 'stellar_v_conflict'} <= codes)

    def test_component_photometry_and_dimension_errors_are_detected(self):
        def mutate(data):
            obj = next(o for c in data for o in c['deepSkyObjects'] if o.get('components'))
            obj['components'][0]['photometry']['magnitudeV'] = -10
            obj['components'][0]['angularSize']['majorAxis'] = 999
        codes = self.modified_report(mutate)
        self.assertTrue({'object_photometry_conflict', 'object_size_conflict'} <= codes)

    def test_estimates_cannot_be_claimed_as_measurements(self):
        def mutate(data):
            obj = next(o for c in data for o in c['deepSkyObjects'] if o['displayPhotometry']['estimated'])
            obj['displayPhotometry']['estimated'] = False
        self.assertIn('display_estimate_flag', self.modified_report(mutate))

    def test_iau_parser_excludes_pronunciation(self):
        table = audit.IauTable()
        table.feed('<table><tr><td></td><td><strong>Andromeda</strong><span class="pronunciation">wrong name</span></td><td>And</td><td>The Princess</td><td>Andromedae<span class="pronunciation">wrong genitive</span></td><td>links</td></tr></table>')
        self.assertEqual(table.rows, [{'name': 'Andromeda', 'abbr': 'And', 'genitive': 'Andromedae'}])

    def test_coordinate_ranges_and_ra_units(self):
        self.assertEqual(audit.sexagesimal('12:00:00', True), 180)
        self.assertAlmostEqual(audit.sexagesimal('-00:30:00'), -.5)
        for text, hours in [('24:00:00', True), ('23:60:00', True), ('+90:00:01', False)]:
            with self.assertRaises(ValueError):
                audit.sexagesimal(text, hours)


if __name__ == '__main__':
    unittest.main()
