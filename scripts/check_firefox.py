"""Static compatibility checks only; this does not claim Android device validation."""
from pathlib import Path
import json
r = Path(__file__).resolve().parents[1]
f = json.loads((r / 'manifest.firefox.json').read_text(encoding='utf-8'))
c = json.loads((r / 'manifest.json').read_text(encoding='utf-8'))
assert f['manifest_version'] == 3
assert f['version'] == c['version']
assert f['background'] == {'scripts': ['background-firefox.js']}
assert 'service_worker' not in f['background']
assert f['browser_specific_settings']['gecko_android']['strict_min_version'] == '142.0'
assert f['permissions'] == ['storage', 'clipboardWrite']
assert f['content_scripts'] == c['content_scripts']
assert f['web_accessible_resources'] == c['web_accessible_resources']
print('PASS: Firefox manifest static checks (device testing still required)')
