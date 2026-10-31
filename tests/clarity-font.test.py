"""Binary and native glyph checks for recovered identity; no browser assertions."""
from hashlib import sha256
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from fontTools.ttLib import TTFont
from PIL import ImageFont

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    'brand/Lumo-Wordmark-Black.svg': 'e6a2e95d213dad264d1f01b277c6f8924004a0167a2bb01056b56b8398e80712',
    'brand/Lumo-Wordmark-White.svg': '82b5c0a63df5fdd89b0b28b5e437f81d76502dcb260ef5314172d9b2f016c739',
    'brand/geometry.json': '5c5f8c464ec425cadd67262d370d3ffa6bf258ef51d6195ab7cb6e76e0fa10d4',
    'fonts/LumoSans-Regular.ttf': '4247abe8b6be05315334ba17974ae8da4a89c35c44342219258de0e60c94ed59',
    'fonts/LumoSans-Regular.woff2': 'b5d60e8fd10f1d1a17448f678ff5dc5982723de6945f772f86e3bf37936d1a3a',
    'fonts/LumoSans-Medium.ttf': 'fc9f513f9abe92c5c43b1d57ef2cc4beba77bf4049cc25d7c3668da1d8960083',
    'fonts/LumoSans-Medium.woff2': '73cf3b4597bc9486ad5b34949ebf813c03015700c1c9d816068d6e1ec659c3ce',
    'fonts/LumoSans-Semibold.ttf': 'b7fbf8e6e8be5963d465cea3f8d3ac490f7aa43be7126c4fa1802d23f09ec6ba',
    'fonts/LumoSans-Semibold.woff2': '2031bc32245f2b380fa44d39713088c543ef988c5a69bdd4dc12f090653ffdfb',
    'fonts/LumoSans-Bold.ttf': '6131c133e3db6f3cae3f2985ac64d07f44921fd561a2c34335873e5f1e713326',
    'fonts/LumoSans-Bold.woff2': '0dd7f2fe8d361af84a4e3cbda63c156e1abd65e02b0723707d37478248b12c11',
    'fonts/lumo-sans.css': '431965a97e8a17a868374e09cf72c42aaee79986e5227dcac88ea896fffc976d',
}

for relative, digest in EXPECTED.items():
    assert sha256((ROOT / 'dist' / relative).read_bytes()).hexdigest() == digest, relative
print('PASS: 12 original identity files match recovered-source SHA-256 hashes.')

for weight, value in [('Regular', 400), ('Medium', 500), ('Semibold', 600), ('Bold', 700)]:
    for ext in ['ttf']:
        font = TTFont(ROOT / 'dist' / 'fonts' / f'LumoSans-{weight}.{ext}')
        assert font['OS/2'].usWeightClass == value
        assert 'Lumo Sans' in font['name'].getDebugName(1)
        assert abs(font['head'].fontRevision - 1.12) < .0001
        cmap = font.getBestCmap()
        for character in 'GH₵0123456789−.,-':
            glyph = cmap.get(ord(character))
            assert glyph and glyph != '.notdef', (weight, character)
            assert font['hmtx'].metrics[glyph][0] > 0, (weight, character)
            assert font['glyf'][glyph].numberOfContours != 0, (weight, character)
        mappings = {}
        for feature in font['GSUB'].table.FeatureList.FeatureRecord:
            if feature.FeatureTag == 'tnum':
                for index in feature.Feature.LookupListIndex:
                    for subtable in font['GSUB'].table.LookupList.Lookup[index].SubTable:
                        mappings.update(getattr(subtable, 'mapping', {}))
        tabular_widths = [font['hmtx'].metrics[mappings[cmap[ord(str(digit))]]][0] for digit in range(10)]
        assert set(tabular_widths) == {640}, (weight, tabular_widths)
    # FreeType reads WOFF2 natively. This also proves the shipped web binary
    # renders like the audited TTF without requiring a separate Brotli module.
    for size in [13, 15, 16, 24, 48]:
        ttf = ImageFont.truetype(str(ROOT / 'dist' / 'fonts' / f'LumoSans-{weight}.ttf'), size)
        web = ImageFont.truetype(str(ROOT / 'dist' / 'fonts' / f'LumoSans-{weight}.woff2'), size)
        sample = 'GH₵0123456789.00 − GH₵350.00'
        assert ttf.getlength(sample, features=['tnum']) == web.getlength(sample, features=['tnum'])
        assert bytes(ttf.getmask(sample, features=['tnum'])) == bytes(web.getmask(sample, features=['tnum']))
        assert len({web.getlength(str(digit), features=['tnum']) for digit in range(10)}) == 1
print('PASS: authentic weights, GH₵, minus, digits and equal-width tnum; WOFF2 matches TTF at 13/15/16/24/48px.')

ns = {'s': 'http://www.w3.org/2000/svg'}
wordmarks = []
for colour, fill in [('Black', '#111413'), ('White', '#FFFFFF')]:
    svg = ET.parse(ROOT / 'dist' / 'brand' / f'Lumo-Wordmark-{colour}.svg').getroot()
    assert svg.get('viewBox') == '0 0 2502 712'
    assert svg.find('s:g', ns).get('fill') == fill
    assert not svg.findall('.//s:text', ns)
    assert [path.get('id') for path in svg.findall('.//s:path', ns)] == ['letter-L', 'letter-u', 'letter-m', 'clarity-ring']
    wordmarks.append([path.get('d') for path in svg.findall('.//s:path', ns)])
assert wordmarks[0] == wordmarks[1]
print('PASS: both original path-based capital-L wordmarks retain identical letter geometry and proportions.')

css = (ROOT / 'dist' / 'clarity-type.css').read_text()
for weight, value in [('Regular', 400), ('Medium', 500), ('Semibold', 600), ('Bold', 700)]:
    assert re.search(r"src:\s*url\('/fonts/LumoSans-" + weight + r"\.woff2'\)[^}]+font-weight:\s*" + str(value), css)
assert 'font-synthesis: none' in css
assert "--font-ui: 'Lumo Sans'" in css
assert 'tabular-nums' in css
print('PASS: interface declares only real Lumo Sans weights and requests native tabular figures without synthesis.')
