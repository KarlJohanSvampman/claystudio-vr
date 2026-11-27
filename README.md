# ClayStudio VR

A PC-first stop-motion and 3D capture workbench with VR as a spatial interface.

## Current MVP
- React + TypeScript + Three.js studio worktable
- FastAPI backend and health endpoint
- Browser camera access through `getUserMedia`
- Stop-motion capture, local IndexedDB storage, timeline, onion skin and playback
- Guided photogrammetry capture studio with 24 equator views and 12 elevated views
- CPU-based COLMAP structure-from-motion reconstruction with camera-pose estimation and a colored sparse point cloud
- Interactive Three.js PLY point-cloud preview and download
- Scan sessions and uploaded photographs stored under `/storage/scans`
- Resume saved scan sessions after restarting the browser
- Server-side image validation for format, minimum resolution and blur warnings
- Export complete scan photo sets as ZIP archives with angle metadata and a manifest

### 3D scanning workflow
1. Open **3D Scan** in the desktop workspace.
2. Create a scan session and connect a webcam or supported camera.
3. Keep the object stationary. Move the camera around it, keeping distance, focus and lighting as consistent as possible.
4. Capture the 24 equator positions, moving the camera about 15 degrees around the object between shots.
5. Capture the optional 12 elevated views, raising the camera and angling it down while maintaining overlap.
6. Select **Build 3D point cloud**. COLMAP extracts features, matches images, estimates camera poses and creates a sparse colored point cloud.
7. Inspect the point cloud in the embedded 3D viewer or download the PLY file. The original photo set can still be exported as ZIP.

The current integrated reconstruction runs COLMAP in CPU mode. It estimates camera poses and generates a **sparse colored point cloud**. Dense multi-view stereo, a watertight surface mesh and texture atlas are not included yet; those require a dense reconstruction stage and suitable GPU-enabled COLMAP support. The backend Docker image installs COLMAP from Debian Bookworm. Reconstruction jobs run in the FastAPI background task and write logs under each scan's `reconstruction/reconstruction.log`. Reflective, transparent, textureless or moving objects are difficult to reconstruct. Use diffuse lighting, a stable background and roughly 60–80% overlap between adjacent photos. Keep the object stationary while moving the camera; a turntable workflow with a fixed camera needs background masking, which this pipeline does not currently perform.

Scan photographs are stored on the backend host in the Docker-mounted `./storage/scans` directory. Stop-motion frames remain in the browser's IndexedDB storage.

## Development
Requirements: Node.js 20+, Python 3.11+.

Backend:
```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

The frontend defaults to API base URL http://localhost:8000.

## Docker
From the repository root:
```bash
docker compose up --build
```
Open http://localhost:5173.
