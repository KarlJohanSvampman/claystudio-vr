from __future__ import annotations

import json
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import cv2
import numpy as np

router = APIRouter(prefix="/scans", tags=["3D scanning"])
SCAN_ROOT = Path("/storage/scans")
MAX_IMAGES = 120
MAX_FILE_BYTES = 25 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


class ScanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


def _scan_dir(scan_id: str) -> Path:
    if not re.fullmatch(r"[a-f0-9-]{36}", scan_id):
        raise HTTPException(status_code=400, detail="Invalid scan id")
    path = SCAN_ROOT / scan_id
    if not path.is_dir():
        raise HTTPException(status_code=404, detail="Scan session not found")
    return path


def _read_manifest(path: Path) -> dict:
    manifest_path = path / "manifest.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Scan manifest not found")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def _write_manifest(path: Path, manifest: dict) -> None:
    (path / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


@router.post("")
def create_scan(payload: ScanCreate):
    scan_id = str(uuid4())
    path = SCAN_ROOT / scan_id
    (path / "images").mkdir(parents=True, exist_ok=True)
    manifest = {
        "id": scan_id,
        "name": payload.name.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "images": [],
        "status": "capturing",
        "capture_plan": "24 overlapping views around the object, plus optional elevated views",
    }
    _write_manifest(path, manifest)
    return manifest


@router.get("/{scan_id}")
def get_scan(scan_id: str):
    return _read_manifest(_scan_dir(scan_id))


@router.post("/{scan_id}/images")
async def upload_scan_image(
    scan_id: str,
    file: UploadFile = File(...),
    angle: int = Form(..., ge=0, le=359),
    ring: str = Form("equator"),
):
    path = _scan_dir(scan_id)
    manifest = _read_manifest(path)
    if len(manifest["images"]) >= MAX_IMAGES:
        raise HTTPException(status_code=413, detail=f"A scan can contain at most {MAX_IMAGES} images")
    suffix = ALLOWED_TYPES.get(file.content_type or "")
    if not suffix:
        raise HTTPException(status_code=415, detail="Use JPEG, PNG or WebP images")
    content = await file.read(MAX_FILE_BYTES + 1)
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 25 MB limit")
    if len(content) < 128:
        raise HTTPException(status_code=400, detail="Image file is too small or empty")
    decoded = cv2.imdecode(np.frombuffer(content, dtype=np.uint8), cv2.IMREAD_COLOR)
    if decoded is None:
        raise HTTPException(status_code=400, detail="Uploaded file is not a readable image")
    height, width = decoded.shape[:2]
    if width < 320 or height < 240:
        raise HTTPException(status_code=400, detail="Scan images must be at least 320 x 240 pixels")
    sharpness = round(float(cv2.Laplacian(cv2.cvtColor(decoded, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var()), 2)

    image_id = str(uuid4())
    filename = f"{len(manifest['images']) + 1:03d}_{ring}_{angle:03d}_{image_id[:8]}{suffix}"
    image_path = path / "images" / filename
    image_path.write_bytes(content)
    record = {
        "filename": filename,
        "angle": angle,
        "ring": ring,
        "bytes": len(content),
        "width": width,
        "height": height,
        "sharpness_score": sharpness,
        "quality_warning": "Image may be blurred; keep the camera or object steady." if sharpness < 35 else None,
        "content_type": file.content_type,
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }
    manifest["images"].append(record)
    manifest["updated_at"] = datetime.now(timezone.utc).isoformat()
    _write_manifest(path, manifest)
    return {"image": record, "image_count": len(manifest["images"]), "quality_warning": record["quality_warning"]}


@router.post("/{scan_id}/complete")
def complete_scan(scan_id: str):
    path = _scan_dir(scan_id)
    manifest = _read_manifest(path)
    if len(manifest["images"]) < 8:
        raise HTTPException(status_code=400, detail="Capture at least 8 overlapping images before completing a scan")
    manifest["status"] = "capture_complete"
    manifest["completed_at"] = datetime.now(timezone.utc).isoformat()
    _write_manifest(path, manifest)
    return manifest


@router.get("/{scan_id}/export")
def export_scan(scan_id: str):
    path = _scan_dir(scan_id)
    manifest = _read_manifest(path)
    export_path = path / f"{scan_id}_photogrammetry_images.zip"
    with zipfile.ZipFile(export_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, indent=2))
        for image in manifest["images"]:
            source = path / "images" / image["filename"]
            if source.exists():
                archive.write(source, f"images/{image['filename']}")
        archive.writestr(
            "README.txt",
            "ClayStudio photogrammetry capture set.\n"
            "Images are original camera frames with capture-angle metadata in manifest.json.\n"
            "Use a photogrammetry application such as COLMAP or Meshroom to align images, "
            "build a dense point cloud and generate a mesh.\n"
            "For best results use diffuse, fixed lighting, a matte textured object, and "
            "60-80 percent overlap between adjacent views.\n",
        )
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", manifest["name"]).strip("._") or "scan"
    return FileResponse(export_path, media_type="application/zip", filename=f"{safe_name}_photogrammetry.zip")


@router.delete("/{scan_id}")
def delete_scan(scan_id: str):
    path = _scan_dir(scan_id)
    shutil.rmtree(path)
    return {"deleted": True, "id": scan_id}


@router.get("")
def list_scans():
    SCAN_ROOT.mkdir(parents=True, exist_ok=True)
    scans = []
    for manifest_path in SCAN_ROOT.glob("*/manifest.json"):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            scans.append({
                "id": manifest["id"],
                "name": manifest["name"],
                "created_at": manifest.get("created_at"),
                "status": manifest.get("status", "capturing"),
                "image_count": len(manifest.get("images", [])),
            })
        except (OSError, ValueError, KeyError):
            continue
    return sorted(scans, key=lambda item: item.get("created_at") or "", reverse=True)
