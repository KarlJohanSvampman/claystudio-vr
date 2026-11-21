# ClayStudio VR

A PC-first stop-motion and 3D capture workbench, with VR as a spatial interface.

## MVP direction
- Desktop-first React/Three.js studio
- FastAPI backend
- External camera capture through OpenCV
- Stop-motion frame capture, onion skinning, timeline and playback
- Later: guided photogrammetry, mesh processing and facial blendshape workflows

## Requirements
- Node.js 20+
- Python 3.11+
- A webcam or supported USB camera for initial capture testing

## Development

### Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The frontend expects the API at `http://localhost:8000`.
