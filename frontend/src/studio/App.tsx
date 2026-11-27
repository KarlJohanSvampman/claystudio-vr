import { useEffect, useMemo, useRef, useState } from 'react'
import { StudioViewport } from './StudioViewport'
import { ScanStudio } from './ScanStudio'
import { loadFrames, removeFrame, saveFrame, type StoredFrame } from './frameStore'

type FrameView = StoredFrame & { url: string }
const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

function makeFrameView(frame: StoredFrame): FrameView {
  return { ...frame, url: URL.createObjectURL(frame.blob) }
}

export default function App() {
  const [apiStatus, setApiStatus] = useState('Checking…')
  const [workspaceMode, setWorkspaceMode] = useState<'animation' | 'scan'>('animation')
  const [projectName, setProjectName] = useState('My first animation')
  const [frames, setFrames] = useState<FrameView[]>([])
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null)
  const [cameraStatus, setCameraStatus] = useState('Camera disconnected')
  const [cameraError, setCameraError] = useState('')
  const [onionOpacity, setOnionOpacity] = useState(35)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackIndex, setPlaybackIndex] = useState(0)
  const [fps, setFps] = useState(12)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const selectedIndex = frames.findIndex(frame => frame.id === selectedFrameId)
  const onionFrame = selectedIndex > 0 ? frames[selectedIndex - 1] : selectedIndex === 0 ? null : frames[frames.length - 1]
  const playbackFrame = frames[playbackIndex]
  const displayedPlaybackFrame = isPlaying ? playbackFrame : null
  const frameCountLabel = `${frames.length} ${frames.length === 1 ? 'FRAME' : 'FRAMES'}`

  useEffect(() => {
    fetch(`${API}/api/health`).then(response => {
      if (!response.ok) throw new Error('API unavailable')
      return response.json()
    }).then(data => setApiStatus(data.colmap_available ? 'API · COLMAP READY' : 'API · COLMAP MISSING')).catch(() => setApiStatus('Offline'))
  }, [])

  useEffect(() => {
    let active = true
    loadFrames(projectName).then(records => {
      if (!active) return
      const views = records.map(makeFrameView)
      setFrames(views)
      setSelectedFrameId(views.length ? views[views.length - 1].id : null)
      setPlaybackIndex(0)
    }).catch(error => setCameraError(error instanceof Error ? error.message : 'Could not load saved frames'))
    return () => {
      active = false
      setFrames(current => {
        current.forEach(frame => URL.revokeObjectURL(frame.url))
        return current
      })
    }
  }, [projectName])

  useEffect(() => {
    if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current
  }, [cameraStatus])

  useEffect(() => {
    if (!isPlaying || frames.length < 2) return
    const timer = window.setInterval(() => {
      setPlaybackIndex(index => (index + 1) % frames.length)
    }, 1000 / fps)
    return () => window.clearInterval(timer)
  }, [isPlaying, frames.length, fps])

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop())
  }, [])

  async function connectCamera() {
    setCameraError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access requires a secure browser context (localhost or HTTPS).')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'environment' },
        audio: false,
      })
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraStatus('Camera ready')
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : 'Could not access camera')
    }
  }

  function disconnectCamera() {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraStatus('Camera disconnected')
  }

  async function captureFrame() {
    const video = videoRef.current
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
      setCameraError('Wait for the camera preview before capturing.')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) {
      setCameraError('The browser could not encode this frame.')
      return
    }
    const record: StoredFrame = {
      id: crypto.randomUUID(),
      projectName,
      createdAt: Date.now(),
      blob,
    }
    try {
      await saveFrame(record)
      const view = makeFrameView(record)
      setFrames(current => [...current, view])
      setSelectedFrameId(record.id)
      setIsPlaying(false)
      setCameraError('')
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : 'Could not save frame')
    }
  }

  async function deleteSelectedFrame() {
    if (!selectedFrameId) return
    const frame = frames.find(item => item.id === selectedFrameId)
    if (!frame) return
    await removeFrame(frame.id)
    URL.revokeObjectURL(frame.url)
    const remaining = frames.filter(item => item.id !== frame.id)
    setFrames(remaining)
    setSelectedFrameId(remaining.length ? remaining[remaining.length - 1].id : null)
  }

  function togglePlayback() {
    if (frames.length < 2) return
    if (!isPlaying) setPlaybackIndex(0)
    setIsPlaying(value => !value)
  }

  const timelineFrames = useMemo(() => frames.map((frame, index) => ({ ...frame, number: index + 1 })), [frames])

  return <main className={workspaceMode === 'scan' ? 'app-shell scan-mode' : 'app-shell'}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark">C</span><div><strong>ClayStudio</strong><small>STOP MOTION · SCAN · SCULPT</small></div></div>
      <div className="project-title"><span>PROJECT</span><input aria-label="Project name" value={projectName} onChange={event => setProjectName(event.target.value)} /></div>
      <div className="mode-switch"><button className={workspaceMode === 'animation' ? 'mode-button active' : 'mode-button'} onClick={() => setWorkspaceMode('animation')}>Animation</button><button className={workspaceMode === 'scan' ? 'mode-button active' : 'mode-button'} onClick={() => setWorkspaceMode('scan')}>3D Scan</button></div>
      <div className="status"><i className={apiStatus !== 'Offline' && apiStatus !== 'Checking…' ? 'online' : ''}/>API {apiStatus}</div>
    </header>

    {workspaceMode === 'scan' ? <ScanStudio/> : <section className="workspace">
      <aside className="left-panel">
        <div className="panel-heading">WORKSPACE</div>
        <button className={workspaceMode === 'animation' ? 'nav-item active' : 'nav-item'} onClick={() => setWorkspaceMode('animation')}>▣ <span>Animation Studio</span></button>
        <button className="nav-item" disabled>◉ <span>Capture Studio</span><em>SOON</em></button>
        <button className={workspaceMode === 'scan' ? 'nav-item active' : 'nav-item'} onClick={() => setWorkspaceMode('scan')}>⬡ <span>3D Scanning</span></button>
        <button className="nav-item" disabled>☺ <span>Facial Studio</span><em>SOON</em></button>
        <div className="panel-divider"/>
        <div className="panel-heading">PROJECT</div>
        <p className="muted">Frames are saved locally in this browser and grouped by project name.</p>
        <div className="panel-divider"/>
        <div className="panel-heading">STAGE</div>
        <p className="muted">Use the 3D worktable to plan your set. Camera capture uses your browser's selected camera.</p>
      </aside>

      <section className="center-stage">
        <div className="stage-toolbar"><span>ANIMATION STAGE</span><span className="stage-badge">DESKTOP PREVIEW</span></div>
        <StudioViewport/>
        <div className="stage-hint">Orbit: drag · Zoom: scroll · Pan: right-drag</div>
      </section>

      <aside className="right-panel capture-panel">
        <div className="panel-heading">CAMERA CAPTURE</div>
        <div className="camera-preview">
          <video ref={videoRef} autoPlay muted playsInline className={isPlaying ? 'video-hidden' : ''}/>
          {displayedPlaybackFrame && <img className="camera-playback" src={displayedPlaybackFrame.url} alt="Animation playback"/>}
          {!isPlaying && onionFrame && frames.length > 1 && <img className="onion-overlay" src={onionFrame.url} style={{ opacity: onionOpacity / 100 }} alt="Previous frame onion skin"/>}
          {cameraStatus !== 'Camera ready' && !isPlaying && <div className="camera-placeholder"><span>◎</span><strong>Camera not connected</strong><small>Connect a webcam or camera to begin.</small></div>}
          {isPlaying && <div className="playback-badge">PLAYBACK · {fps} FPS</div>}
        </div>
        <div className="camera-actions">
          {cameraStatus === 'Camera ready'
            ? <button className="secondary-button" onClick={disconnectCamera}>Disconnect camera</button>
            : <button className="secondary-button" onClick={connectCamera}>Connect camera</button>}
          <button className="capture-button" onClick={captureFrame} disabled={cameraStatus !== 'Camera ready' || isPlaying}>● Capture frame</button>
        </div>
        {cameraError && <p className="error-message">{cameraError}</p>}
        <div className="panel-divider"/>
        <div className="panel-heading">ONION SKIN</div>
        <label className="field-label">Previous frame opacity <strong>{onionOpacity}%</strong></label>
        <input type="range" min="0" max="100" value={onionOpacity} onChange={event => setOnionOpacity(Number(event.target.value))}/>
        <p className="muted">The previous frame is overlaid on the live camera preview.</p>
        <div className="panel-divider"/>
        <div className="panel-heading">SELECTED FRAME</div>
        {selectedIndex >= 0 ? <div className="selected-frame-card">
          <img src={frames[selectedIndex].url} alt={`Frame ${selectedIndex + 1}`}/>
          <div><strong>Frame {selectedIndex + 1}</strong><small>{new Date(frames[selectedIndex].createdAt).toLocaleTimeString()}</small></div>
          <button className="icon-button" title="Delete selected frame" onClick={deleteSelectedFrame}>×</button>
        </div> : <p className="muted">Select a frame in the timeline.</p>}
      </aside>
    </section>

    <footer className="timeline">
      <div className="timeline-title"><strong>TIMELINE</strong><span>{frameCountLabel}</span></div>
      <div className="timeline-track">
        {timelineFrames.length ? <div className="frame-strip">{timelineFrames.map(frame =>
          <button key={frame.id} className={frame.id === selectedFrameId ? 'frame-thumb selected' : 'frame-thumb'} onClick={() => { setIsPlaying(false); setSelectedFrameId(frame.id) }} title={`Select frame ${frame.number}`}>
            <img src={frame.url} alt=""/><span>{frame.number}</span>
          </button>
        )}</div> : <span>Capture frames to begin building your animation</span>}
      </div>
      <div className="timeline-controls">
        <span>FPS</span>
        <select value={fps} onChange={event => setFps(Number(event.target.value))}><option value="8">8</option><option value="12">12</option><option value="15">15</option><option value="24">24</option><option value="30">30</option></select>
        <button onClick={togglePlayback} disabled={frames.length < 2}>{isPlaying ? 'Ⅱ PAUSE' : '▶ PLAY'}</button>
      </div>
    </footer>}
  </main>
}
