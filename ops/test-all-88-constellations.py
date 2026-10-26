import json
import math
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = json.loads((ROOT / 'data/constellations_catalogue.json').read_text())

# Prominent navigation anchor stars
KNOWN_ANCHORS = {
    'Aql': ('alpha_aql', 'Altair', 1.0),
    'Aur': ('capella', 'Capella', 0.5),
    'Boo': ('arcturus', 'Arcturus', 0.2),
    'CMa': ('sirius', 'Sirius', -1.0),
    'CMi': ('procyon', 'Procyon', 0.5),
    'Car': ('canopus', 'Canopus', -0.5),
    'Cen': ('hadar', 'Hadar', 1.0),
    'Cyg': ('deneb', 'Deneb', 1.5),
    'Eri': ('achernar', 'Achernar', 0.6),
    'Gem': ('pollux', 'Pollux', 1.5),
    'Leo': ('regulus', 'Regulus', 1.5),
    'Lyr': ('vega', 'Vega', 0.1),
    'Ori': ('betelgeuse', 'Betelgeuse', 1.0),
    'PsA': ('fomalhaut', 'Fomalhaut', 1.3),
    'Sco': ('antares', 'Antares', 1.2),
    'Tau': ('aldebaran', 'Aldebaran', 1.0),
    'UMi': ('polaris', 'Polaris', 2.1),
    'Vir': ('spica', 'Spica', 1.1),
}


class IndividualConstellationTests(unittest.TestCase):
    pass


def make_test(c):
    def test_method(self):
        abbr = c['abbr']
        name = c['name']
        stars = c['stars']
        conns = c.get('connections', [])
        dsos = c.get('deepSkyObjects', [])

        # 1. Identity & metadata
        self.assertTrue(len(abbr) == 3, f'{abbr} must be 3-letter code')
        self.assertTrue(bool(name), f'{abbr} must have name')
        self.assertTrue(bool(c.get('genitive')), f'{abbr} must have genitive')
        if c.get('hemisphere'):
            self.assertIn(c.get('hemisphere', '').lower(), ('northern', 'southern', 'equatorial'), f'{abbr} hemisphere')
        if c.get('areaSqDeg') is not None:
            self.assertGreaterEqual(c.get('areaSqDeg', 0), 0, f'{abbr} areaSqDeg')

        # 2. Stars
        self.assertGreaterEqual(len(stars), 2, f'{abbr} must have at least 2 stars')
        star_map = {}
        for s in stars:
            sid = s['id']
            self.assertTrue(bool(sid), f'{abbr} star has empty id')
            self.assertNotIn(sid, star_map, f'{abbr} duplicate star id: {sid}')
            star_map[sid] = s

            # Coordinates
            coords = s['coordinates']
            self.assertGreaterEqual(coords['rightAscensionDeg'], 0)
            self.assertLess(coords['rightAscensionDeg'], 360)
            self.assertGreaterEqual(coords['declinationDeg'], -90)
            self.assertLessEqual(coords['declinationDeg'], 90)

            # Photometry
            mag = s['photometry']['apparentMagnitude']
            self.assertGreater(mag, -2)
            self.assertLess(mag, 15)

            # Catalogue info
            cat_info = s['catalogue']
            self.assertTrue(bool(cat_info.get('provider')), f'{abbr} star has empty provider')

        # 3. Connections & Topology
        self.assertGreaterEqual(len(conns), 1, f'{abbr} must have at least 1 connection')
        seen_edges = set()
        adj = {}
        for edge in conns:
            self.assertEqual(len(edge), 2, f'{abbr} edge {edge} must have 2 vertices')
            u, v = edge[0], edge[1]
            self.assertNotEqual(u, v, f'{abbr} self-loop on {u}')
            self.assertIn(u, star_map, f'{abbr} edge references unknown star {u}')
            self.assertIn(v, star_map, f'{abbr} edge references unknown star {v}')
            normalized = tuple(sorted([u, v]))
            self.assertNotIn(normalized, seen_edges, f'{abbr} duplicate edge {edge}')
            seen_edges.add(normalized)

            adj.setdefault(u, set()).add(v)
            adj.setdefault(v, set()).add(u)

            # Angular distance check (> 0)
            c1 = star_map[u]['coordinates']
            c2 = star_map[v]['coordinates']
            dra = math.radians(c1['rightAscensionDeg'] - c2['rightAscensionDeg'])
            ddec = math.radians(c1['declinationDeg'] - c2['declinationDeg'])
            dist = math.hypot(dra, ddec)
            self.assertGreater(dist, 0.0, f'{abbr} edge {u}-{v} has zero angular length')

        # Graph connected components: Cru has 2 crossing bars, all other 87 have 1 connected component
        visited = set()
        comps = 0
        for node in adj:
            if node not in visited:
                comps += 1
                queue = [node]
                visited.add(node)
                while queue:
                    curr = queue.pop(0)
                    for nxt in adj[curr]:
                        if nxt not in visited:
                            visited.add(nxt)
                            queue.append(nxt)
        expected_comps = 2 if abbr == 'Cru' else 1
        self.assertEqual(comps, expected_comps, f'{abbr} graph topology: expected {expected_comps} component(s), got {comps}')

        # 4. Anchor star validation
        if abbr in KNOWN_ANCHORS:
            anchor_id, anchor_name, max_mag = KNOWN_ANCHORS[abbr]
            self.assertIn(anchor_id, star_map, f'{abbr} must contain anchor star {anchor_id}')
            s = star_map[anchor_id]
            self.assertLessEqual(s['photometry']['apparentMagnitude'], max_mag, f'{abbr} anchor {anchor_id} must have magnitude <= {max_mag}')

        # 5. Deep-Sky Objects
        for dso in dsos:
            self.assertTrue(bool(dso.get('id')), f'{abbr} DSO has empty id')
            self.assertTrue(bool(dso.get('name')), f'{abbr} DSO has empty name')
            self.assertTrue(bool(dso.get('type')), f'{abbr} DSO has empty type')
            c_dso = dso.get('coordinates') or (dso.get('components') and dso['components'][0].get('coordinates'))
            self.assertIsNotNone(c_dso, f'{abbr} DSO has no coordinates')
            self.assertGreaterEqual(c_dso['rightAscensionDeg'], 0)
            self.assertLess(c_dso['rightAscensionDeg'], 360)
            self.assertGreaterEqual(c_dso['declinationDeg'], -90)
            self.assertLessEqual(c_dso['declinationDeg'], 90)

    test_method.__doc__ = f"Individual test for constellation {c['abbr']} ({c['name']})"
    return test_method


for idx, c in enumerate(sorted(CATALOGUE, key=lambda x: x['abbr']), 1):
    safe_name = c['name'].replace(' ', '_').replace('ö', 'o').replace("'", '')
    method_name = f"test_{idx:02d}_{c['abbr']}_{safe_name}"
    setattr(IndividualConstellationTests, method_name, make_test(c))

if __name__ == '__main__':
    unittest.main()
