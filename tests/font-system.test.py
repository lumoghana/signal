"""Everyday's actual Campus font and approved wordmark contract.

These inspect native font tables and shipped CSS, not browser rendering.
The retained Clarity font binaries have a separate historical identity test.
"""
from hashlib import sha256
from pathlib import Path
import re
import unittest
import xml.etree.ElementTree as ET

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / 'dist/assets/fonts/PlusJakartaSans-v2.071.woff'
EXPECTED = {
    'assets/fonts/PlusJakartaSans-v2.071.woff': '544f24a30716c85c425cd2c37e9fbcf4b8134290815742d512bfe3e633aae4ef',
    'brand/Lumo-Wordmark-Black.svg': 'e6a2e95d213dad264d1f01b277c6f8924004a0167a2bb01056b56b8398e80712',
    'brand/Lumo-Wordmark-White.svg': '82b5c0a63df5fdd89b0b28b5e437f81d76502dcb260ef5314172d9b2f016c739',
}


class LumoFontTest(unittest.TestCase):
    def test_current_campus_font_and_approved_wordmarks_keep_their_original_bytes(self):
        for relative, digest in EXPECTED.items():
            self.assertEqual(sha256((ROOT / 'dist' / relative).read_bytes()).hexdigest(), digest, relative)
        self.assertEqual(FONT.read_bytes()[:4], b'wOFF')
        ns = {'s': 'http://www.w3.org/2000/svg'}
        outlines = []
        for colour in ['Black', 'White']:
            svg = ET.parse(ROOT / f'dist/brand/Lumo-Wordmark-{colour}.svg').getroot()
            self.assertEqual(svg.get('viewBox'), '0 0 2502 712')
            self.assertFalse(svg.findall('.//s:text', ns), 'Approved wordmarks are original paths, not live text')
            outlines.append([node.get('d') for node in svg.findall('.//s:path', ns)])
        self.assertEqual(outlines[0], outlines[1])

    def test_real_variable_weights_have_native_currency_and_tabular_figures(self):
        font = TTFont(FONT)
        self.assertEqual(font['name'].getDebugName(1), 'Plus Jakarta Sans')
        axis = next(axis for axis in font['fvar'].axes if axis.axisTag == 'wght')
        self.assertLessEqual(axis.minValue, 400)
        self.assertGreaterEqual(axis.maxValue, 700)
        outlines = []
        for weight in [400, 500, 600, 700]:
            native = instantiateVariableFont(font, {'wght': weight}, inplace=False)
            self.assertNotIn('fvar', native, 'Each requested native weight resolves without synthetic styling')
            self.assertEqual(native['OS/2'].usWeightClass, weight)
            cmap = native.getBestCmap()
            for character in 'GH₵0123456789,.−':
                glyph = cmap.get(ord(character))
                self.assertIsNotNone(glyph, (weight, character))
                self.assertNotEqual(glyph, '.notdef')
                self.assertGreater(native['hmtx'][glyph][0], 0)
                self.assertNotEqual(native['glyf'][glyph].numberOfContours, 0)
            substitutions = {}
            for feature in native['GSUB'].table.FeatureList.FeatureRecord:
                if feature.FeatureTag == 'tnum':
                    for index in feature.Feature.LookupListIndex:
                        for table in native['GSUB'].table.LookupList.Lookup[index].SubTable:
                            substitutions.update(getattr(table, 'mapping', {}))
            self.assertTrue(substitutions, 'Native tabular substitutions must exist')
            widths = [native['hmtx'][substitutions.get(cmap[ord(str(i))], cmap[ord(str(i))])][0] for i in range(10)]
            self.assertEqual(len(set(widths)), 1, (weight, widths))
            outlines.append(tuple(native['glyf'][cmap[ord('G')]].getCoordinates(native['glyf'])[0]))
        self.assertEqual(len(set(outlines)), 4, 'Four interface weights must resolve to distinct native outlines')

    def test_shipped_cascade_preloads_and_uses_the_current_font_without_synthesis(self):
        html = (ROOT / 'dist/index.html').read_text()
        self.assertRegex(html, r'<link rel="preload" href="/assets/fonts/PlusJakartaSans-v2\.071\.woff"[^>]*as="font"[^>]*type="font/woff"[^>]*crossorigin')
        styles = re.findall(r'<link[^>]*rel="stylesheet"[^>]*href="/([^"?]+)', html)
        self.assertGreater(styles.index('everyday-edition.css'), styles.index('clarity-type.css'))
        sources = [(ROOT / 'dist' / name).read_text() for name in styles]
        declarations = re.findall(r'--font-ui\s*:\s*([^;]+)', '\n'.join(sources))
        self.assertEqual(declarations[-1].replace(' ', ''), "'LumoJakarta',Arial,sans-serif")
        css = (ROOT / 'dist/everyday-edition.css').read_text()
        self.assertRegex(css, r"@font-face\s*\{[^}]*font-family:'Lumo Jakarta';[^}]*src:url\('/assets/fonts/PlusJakartaSans-v2\.071\.woff'\) format\('woff'\);[^}]*font-style:normal;[^}]*font-weight:400 700;")
        self.assertRegex(css, r'html\s*\{font-synthesis:none\}')
        self.assertIn('font-variant-numeric:lining-nums tabular-nums', css)
        self.assertIn('button,input,select,textarea{font-family:var(--font-ui)}', css)
        self.assertNotRegex(css, r'(?:https?:)?//')
        weights = {int(value) for value in re.findall(r'font-weight:\s*(\d+)', css)}
        self.assertTrue(weights.issubset({400, 500, 600, 700}), weights)
        for colour in ['Black', 'White']:
            self.assertIn(f'/brand/Lumo-Wordmark-{colour}.svg', html)


if __name__ == '__main__':
    unittest.main(verbosity=2)
