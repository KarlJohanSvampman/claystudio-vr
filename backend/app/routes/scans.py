from __future__ import annotations

import json
import re
import shutil
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import cv2
import numpy as np

router = APIRouter(prefix="/scans", tags=["3D scanning"])
SCAN_ROOT = Path("/storage/scans")
MAX_IMAGES = 120
MIN_RECONSTRUCTION_IMAGES = 12
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
    if manifest.get("status") != "capturing":
        raise HTTPException(status_code=409, detail="This scan is no longer accepting images")
    if ring not in {"equator", "upper"}:
        raise HTTPException(status_code=400, detail="Ring must be equator or upper")
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


def _run_colmap(scan_id: str) -> None:
    path = SCAN_ROOT / scan_id
    manifest_path = path / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        image_count = len(manifest.get("images", []))
        if image_count < MIN_RECONSTRUCTION_IMAGES:
            raise RuntimeError(f"At least {MIN_RECONSTRUCTION_IMAGES} images are required for reconstruction")
        binary = shutil.which("colmap")
        if not binary:
            raise RuntimeError("COLMAP is not installed in the backend container. Rebuild with docker compose up --build.")

        images_dir = path / "images"
        work_dir = path / "reconstruction"
        if work_dir.exists():
            shutil.rmtree(work_dir)
        sparse_dir = work_dir / "sparse"
        sparse_dir.mkdir(parents=True, exist_ok=True)
        database = work_dir / "database.db"
        log_path = work_dir / "reconstruction.log"
        commands = [
            ("Feature extraction", [
                binary, "feature_extractor", "--database_path", str(database),
                "--image_path", str(images_dir), "--ImageReader.single_camera", "1",
                "--FeatureExtraction.use_gpu", "0",
                "--SiftExtraction.max_num_features", "8192",
            ]),
            ("Feature matching", [
                binary, "exhaustive_matcher", "--database_path", str(database),
                "--FeatureMatching.use_gpu", "0",
            ]),
            ("Sparse reconstruction", [
                binary, "mapper", "--database_path", str(database),
                "--image_path", str(images_dir), "--output_path", str(sparse_dir),
            ]),
        ]
        manifest["reconstruction"] = {
            "status": "running",
            "stage": "Preparing",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "image_count": image_count,
            "output": "sparse point cloud",
        }
        _write_manifest(path, manifest)

        with log_path.open("a", encoding="utf-8") as log:
            for stage, command in commands:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                manifest["reconstruction"]["stage"] = stage
                _write_manifest(path, manifest)
                log.write("\\n$ " + " ".join(command) + "\\n")
                log.flush()
                completed = subprocess.run(
                    command, cwd=str(work_dir), stdout=log, stderr=subprocess.STDOUT,
                    text=True, timeout=7200, check=False,
                )
                if completed.returncode != 0:
                    raise RuntimeError(f"{stage} failed (exit code {completed.returncode}). Check reconstruction.log in the scan storage folder.")

        models = sorted(
            (item for item in sparse_dir.iterdir() if item.is_dir() and item.name.isdigit()),
            key=lambda item: int(item.name),
        )
        if not models:
            raise RuntimeError("COLMAP could not register enough overlapping images to create a 3D model. Try more textured views with stronger overlap.")
        model = models[-1]
        ply_path = work_dir / "sparse_point_cloud.ply"
        converter = [binary, "model_converter", "--input_path", str(model), "--output_path", str(ply_path), "--output_type", "PLY"]
        with log_path.open("a", encoding="utf-8") as log:
            log.write("\\n$ " + " ".join(converter) + "\\n")
            log.flush()
            converted = subprocess.run(converter, cwd=str(work_dir), stdout=log, stderr=subprocess.STDOUT, text=True, timeout=600, check=False)
        if converted.returncode != 0 or not ply_path.exists():
            raise RuntimeError("COLMAP reconstructed the cameras but could not export the point cloud.")

        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["status"] = "reconstruction_complete"
        manifest["reconstruction"] = {
            "status": "complete",
            "stage": "Sparse point cloud ready",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "image_count": image_count,
            "model": "sparse_point_cloud.ply",
            "model_type": "sparse",
            "note": "Camera poses and a colored sparse point cloud were reconstructed. Dense surface and textured mesh generation require a CUDA-enabled COLMAP build and are not included in this CPU pipeline.",
        }
        _write_manifest(path, manifest)
    except Exception as error:
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["status"] = "reconstruction_failed"
            manifest["reconstruction"] = {
                "status": "failed",
                "stage": "Reconstruction failed",
                "failed_at": datetime.now(timezone.utc).isoformat(),
                "error": str(error)[:1200],
            }
            _write_manifest(path, manifest)
        except Exception:
            pass


@router.post("/{scan_id}/reconstruct")
def start_reconstruction(scan_id: str, background_tasks: BackgroundTasks):
    path = _scan_dir(scan_id)
    manifest = _read_manifest(path)
    if len(manifest.get("images", [])) < MIN_RECONSTRUCTION_IMAGES:
        raise HTTPException(status_code=400, detail=f"Capture at least {MIN_RECONSTRUCTION_IMAGES} images before reconstruction")
    if manifest.get("reconstruction", {}).get("status") in {"queued", "running"}:
        raise HTTPException(status_code=409, detail="Reconstruction is already queued or running")
    if manifest.get("status") == "capturing":
        manifest["status"] = "capture_complete"
    manifest["status"] = "reconstructing"
    manifest["reconstruction"] = {
        "status": "queued",
        "stage": "Waiting for reconstruction worker",
        "queued_at": datetime.now(timezone.utc).isoformat(),
        "image_count": len(manifest["images"]),
    }
    _write_manifest(path, manifest)
    background_tasks.add_task(_run_colmap, scan_id)
    return manifest


@router.get("/{scan_id}/point-cloud")
def get_point_cloud(scan_id: str):
    path = _scan_dir(scan_id)
    manifest = _read_manifest(path)
    if manifest.get("reconstruction", {}).get("status") != "complete":
        raise HTTPException(status_code=404, detail="Point cloud is not ready")
    ply_path = path / "reconstruction" / "sparse_point_cloud.ply"
    if not ply_path.exists():
        raise HTTPException(status_code=404, detail="Point cloud file is missing")
    return FileResponse(ply_path, media_type="application/octet-stream", filename="claystudio-sparse-point-cloud.ply")


@router.get("/{scan_id}/reconstruction-log")
def get_reconstruction_log(scan_id: str):
    path = _scan_dir(scan_id)
    log_path = path / "reconstruction" / "reconstruction.log"
    if not log_path.exists():
        raise HTTPException(status_code=404, detail="No reconstruction log available yet")
    return FileResponse(log_path, media_type="text/plain", filename="reconstruction.log")


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
