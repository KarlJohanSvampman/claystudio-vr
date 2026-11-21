# ClayStudio VR

A PC-first stop-motion and 3D capture workbench, with VR as a spatial interface.

## MVP
- React, TypeScript and Three.js desktop studio
- FastAPI backend and OpenCV camera discovery
- Stop-motion capture, onion skinning, frame timeline and playback
- Later: guided photogrammetry, mesh processing and facial blendshape workflows

## Development

Backend: Python 3.11+
```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend: Node.js 20+
```bash
cd frontend
npm install
npm run dev
```

Frontend API base URL defaults to http://localhost:8000.
