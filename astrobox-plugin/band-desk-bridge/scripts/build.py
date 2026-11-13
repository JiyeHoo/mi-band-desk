#!/usr/bin/env python3
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = "wasm32-wasip2"


def main():
    subprocess.run(["cargo", "build", "--release", "--target", TARGET], cwd=ROOT, check=True)
    wasm = ROOT / "target" / TARGET / "release" / "band_desk_bridge.wasm"
    if not wasm.exists():
        raise SystemExit(f"missing build output: {wasm}")
    dist = ROOT / "dist"
    if dist.exists():
        shutil.rmtree(dist)
    dist.mkdir()
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    shutil.copy2(ROOT / "manifest.json", dist / "manifest.json")
    shutil.copy2(ROOT / "icon.png", dist / "icon.png")
    shutil.copy2(wasm, dist / manifest["entry"])
    package = dist / "Band Desk Bridge.abp"
    with zipfile.ZipFile(package, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in ["manifest.json", "icon.png", manifest["entry"]]:
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, (dist / name).read_bytes())
    print(package)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.exit(error.returncode)
