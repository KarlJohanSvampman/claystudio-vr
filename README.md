# ClayStudio VR

A PC-first stop-motion and 3D capture workbench with VR as a spatial interface.

## Current MVP
- React + TypeScript + Three.js studio worktable
- FastAPI backend and health endpoint
- Browser camera connection through `getUserMedia` (works with a webcam or supported camera exposed to the browser)
- Capture still frames from the live camera preview
- Local IndexedDB frame storage, grouped by project name
- Timeline thumbnails, frame selection and deletion
- Onion-skin overlay using the previous frame
- Basic frame playback at selectable 8, 12, 15, 24 or 30 FPS

Captured frames are stored in the current browser profile on the current machine. They are not uploaded to the backend or synchronized between devices. Camera access requires localhost or HTTPS and browser permission.

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
The frontend development container installs dependencies on startup because its source directory is bind-mounted into the container. Open http://localhost:5173.
