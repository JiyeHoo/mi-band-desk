#!/usr/bin/env python3
import stat
import sys
import zipfile
from pathlib import Path


def main() -> None:
    app = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    root = app.parent
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(app.rglob("*")):
            if not path.is_file():
                continue
            name = path.relative_to(root).as_posix()
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            mode = path.stat().st_mode
            info.external_attr = (stat.S_IFREG | stat.S_IMODE(mode)) << 16
            archive.writestr(info, path.read_bytes())
    print(output)


if __name__ == "__main__":
    main()
