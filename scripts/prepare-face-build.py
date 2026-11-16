"""Install pinned dependencies and verified models before Python bundling."""
import os
from pathlib import Path
import runpy
import subprocess
import sys


root = Path(__file__).resolve().parent.parent
venv = os.environ.get('VERCEL_PYTHON_VENV_PATH')
if not venv or Path(sys.prefix).resolve() != Path(venv).resolve():
    raise SystemExit('Run this preparation through the Vercel Python build hook.')

# A failed download or checksum must fail the build before a function is emitted.
runpy.run_path(str(root / 'scripts/fetch-face-models.py'), run_name='__main__')
subprocess.run(
    [sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check',
     '--no-cache-dir', '-r', str(root / 'requirements.txt')],
    cwd=root,
    check=True,
)
