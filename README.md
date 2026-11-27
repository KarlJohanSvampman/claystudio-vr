# ClayStudio VR

A PC-first stop-motion and 3D capture workbench with VR as a spatial interface.

## Current MVP
- React + TypeScript + Three.js studio worktable
- FastAPI backend and health endpoint
- Browser camera access through `getUserMedia`
- Stop-motion capture, local IndexedDB storage, timeline, onion skin and playback
- Guided photogrammetry capture studio with 24 equator views and 12 elevated views
- Scan sessions and uploaded photographs stored under `/storage/scans`
- Export complete scan photo sets as ZIP archives with angle metadata and a manifest

### 3D scanning workflow
1. Open **3D Scan** in the desktop workspace.
2. Create a scan session and connect a webcam or supported camera.
3. Keep the camera, focus and lighting fixed. Place a textured, matte object in view.
4. Capture the 24 equator positions, rotating the object by about 15 degrees between shots.
5. Capture the optional 12 elevated views, tilting the object or changing its elevation while keeping overlap.
6. Finish the photo set and export the ZIP archive.

The current scanning milestone acquires, stores and packages photogrammetry images. It does **not yet** calculate camera poses, generate a point cloud or create a mesh inside ClayStudio. Use the exported images with a photogrammetry tool such as COLMAP or Meshroom until the integrated reconstruction pipeline is implemented. Reflective, transparent, textureless or moving objects are difficult to reconstruct. Use diffuse lighting, a stable background and roughly 60–80% overlap between adjacent photos.

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
