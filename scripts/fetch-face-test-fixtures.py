"""Restore two public offline test fixtures with pinned size and SHA-256 checks."""
import hashlib
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent.parent
DIRECTORY = ROOT / 'face_service/tests/fixtures'
FIXTURES = ('face-a.png', 'face-b.jpg')


def verify(data, item):
    if len(data) != item['size_bytes'] or hashlib.sha256(data).hexdigest() != item['sha256']:
        raise ValueError('Pinned face test fixture integrity check failed: ' + item['file'])


def restore():
    manifest = json.loads((DIRECTORY / 'fixture-manifest.json').read_text())
    records = {item['file']: item for item in manifest['fixtures']}
    for name in FIXTURES:
        item = records[name]
        source = urlsplit(item['source_url'])
        commit = item['git_commit']
        if (source.scheme != 'https' or source.netloc != 'raw.githubusercontent.com'
                or source.query or source.fragment or not re.fullmatch(r'[0-9a-f]{40}', commit)
                or '/' + commit + '/' not in source.path
                or not re.fullmatch(r'[0-9a-f]{64}', item['sha256'])
                or type(item['size_bytes']) is not int or not 0 < item['size_bytes'] <= 2_000_000):
            raise ValueError('Use an immutable official fixture source: ' + name)
        target = DIRECTORY / name
        if target.is_file():
            verify(target.read_bytes(), item)
        else:
            with urlopen(item['source_url'], timeout=30) as response:
                data = response.read(item['size_bytes'] + 1)
            verify(data, item)
            temporary = target.with_name(name + '.download')
            created = False
            try:
                with temporary.open('xb') as output:
                    created = True
                    output.write(data)
                os.replace(temporary, target)
            finally:
                if created:
                    temporary.unlink(missing_ok=True)
        print('Verified public offline fixture: ' + name)


if __name__ == '__main__':
    restore()
