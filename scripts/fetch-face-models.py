"""Fetch immutable public model bytes and verify both size and SHA-256."""
import hashlib
import json
import os
from pathlib import Path
from urllib.request import urlopen

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'face_service/model-manifest.json').read_text())
directory = root / 'face_service/models'
directory.mkdir(exist_ok=True)
for item in manifest['models']:
    target = directory / item['file']
    if target.is_file():
        data = target.read_bytes()
    else:
        with urlopen(item['url'], timeout=60) as source:
            data = source.read(item['bytes'] + 1)
    if len(data) != item['bytes'] or hashlib.sha256(data).hexdigest() != item['sha256']:
        raise SystemExit('Pinned face model integrity check failed: ' + item['file'])
    if not target.is_file():
        temporary = target.with_suffix('.download')
        with temporary.open('xb') as output:
            output.write(data)
        os.replace(temporary, target)
    print('Verified pinned model: ' + item['file'])
