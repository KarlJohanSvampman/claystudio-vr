import shutil
import subprocess
from fastapi import APIRouter

router = APIRouter(tags=["system"])


@router.get("/health")
def health():
    binary = shutil.which("colmap")
    version = None
    if binary:
        try:
            result = subprocess.run([binary, "-h"], capture_output=True, text=True, timeout=5, check=False)
            first_line = (result.stdout or result.stderr).splitlines()
            version = first_line[0][:160] if first_line else "available"
        except (OSError, subprocess.TimeoutExpired):
            version = "available"
    return {"status": "ok", "reconstruction_engine": "COLMAP" if binary else None, "colmap_available": bool(binary), "colmap_version": version}
