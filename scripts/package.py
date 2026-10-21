"""Deterministic runtime allowlist; Chromium ZIP, unsigned Firefox ZIP and Safari conversion source."""
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parents[1]
common = ["profile.js", "model.js", "content.js", "popup.html", "popup.css", "popup.js", "README.md", "LICENSE"]
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
firefox = json.loads((root / "manifest.firefox.json").read_text(encoding="utf-8"))
package = json.loads((root / "package.json").read_text(encoding="utf-8"))
assert manifest["version"] == package["version"] == firefox["version"]
# Firefox does not implement MV3 service_worker. This classic background has no module imports.
background = (root / "model.js").read_text(encoding="utf-8").replace("export ", "") + "\n" + (root / "background.js").read_text(encoding="utf-8").split("\n", 1)[1]
for target in ["chromium", "firefox", "safari-source"]:
    filename = {"chromium": "x-mention-saver.zip", "firefox": "x-mention-saver-firefox-unsigned.zip", "safari-source": "x-mention-saver-safari-source.zip"}[target]
    payload = {name: (root / name).read_bytes() for name in common}
    payload["manifest.json"] = json.dumps(firefox if target == "firefox" else manifest, ensure_ascii=False, indent=2).encode()
    payload["background-firefox.js" if target == "firefox" else "background.js"] = background.encode() if target == "firefox" else (root / "background.js").read_bytes()
    output = root / "dist" / filename
    output.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in payload.items(): archive.writestr(name, data)
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(payload)
    print(f"Packaged v{manifest['version']}: {output}")
