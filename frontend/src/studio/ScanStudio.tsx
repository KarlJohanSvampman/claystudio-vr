import { useEffect, useRef, useState } from 'react'
import { PointCloudPreview } from './PointCloudPreview'

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
type Ring = 'equator' | 'upper'
type ScanManifest = { id: string; name: string; status: string; images: Array<{ filename: string; angle: number; ring: string }>; reconstruction?: { status: string; stage?: string; error?: string; note?: string } }
type SavedScan = { id: string; name: string; status: string; image_count: number; created_at: string }

export function ScanStudio() {
  const [scanName, setScanName] = useState('ClayStudio scan')
  const [scan, setScan] = useState<ScanManifest | null>(null)
  const [savedScans, setSavedScans] = useState<SavedScan[]>([])
  const [ring, setRing] = useState<Ring>('equator')
  const [step, setStep] = useState(0)
  const [cameraReady, setCameraReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Create a scan session, connect a camera, then photograph the object from overlapping angles.')
  const [error, setError] = useState('')
  const [lastImage, setLastImage] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastImageUrlRef = useRef<string | null>(null)

  const ringSteps = ring === 'equator' ? 24 : 12
  const angle = Math.round(step * (360 / ringSteps))
  const ringCount = scan?.images.filter(image => image.ring === ring).length ?? 0
  const totalCount = scan?.images.length ?? 0
  const equatorCount = scan?.images.filter(image => image.ring === 'equator').length ?? 0
  const upperCount = scan?.images.filter(image => image.ring === 'upper').length ?? 0

  useEffect(() => {
    fetch(API + '/api/scans').then(response => response.ok ? response.json() : []).then(setSavedScans).catch(() => setSavedScans([]))
  }, [])

  useEffect(() => {
    if (!scan?.id || scan.reconstruction?.status !== 'running' && scan.reconstruction?.status !== 'queued') return
    const timer = window.setInterval(() => {
      fetch(API + '/api/scans/' + scan.id).then(response => response.ok ? response.json() : null).then((updated: ScanManifest | null) => {
        if (updated) setScan(updated)
      }).catch(() => undefined)
    }, 4000)
    return () => window.clearInterval(timer)
  }, [scan?.id, scan?.reconstruction?.status])

  useEffect(() => {
    if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current
  }, [cameraReady])

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    if (lastImageUrlRef.current) URL.revokeObjectURL(lastImageUrlRef.current)
  }, [])

  async function startScan() {
    setBusy(true); setError('')
    try {
      const response = await fetch(`${API}/api/scans`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: scanName.trim() || 'Untitled scan' }),
      })
      if (!response.ok) throw new Error((await response.json()).detail ?? 'Could not create scan session')
      const created = await response.json() as ScanManifest
      setScan(created)
      setSavedScans(current => [{ id: created.id, name: created.name, status: created.status, image_count: 0, created_at: new Date().toISOString() }, ...current])
      setRing('equator'); setStep(0)
      setMessage('Scan session created. Connect your camera and follow the angle guide.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create scan')
    } finally { setBusy(false) }
  }

  async function resumeScan(id: string) {
    setBusy(true); setError('')
    try {
      const response = await fetch(API + '/api/scans/' + id)
      if (!response.ok) throw new Error('Could not open saved scan')
      const loaded = await response.json() as ScanManifest
      setScan(loaded)
      const equator = loaded.images.filter(image => image.ring === 'equator').length
      const upper = loaded.images.filter(image => image.ring === 'upper').length
      const nextRing: Ring = equator < 24 ? 'equator' : 'upper'
      setRing(nextRing)
      setStep(nextRing === 'equator' ? equator % 24 : upper % 12)
      setMessage('Saved scan reopened. Continue capturing or export the photo set.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reopen scan')
    } finally { setBusy(false) }
  }

  async function connectCamera() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access requires localhost or HTTPS in a supported browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
      })
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraReady(true)
      setMessage('Camera ready. Keep the camera and lighting fixed; rotate the object between captures.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not access camera')
    }
  }

  function disconnectCamera() {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraReady(false)
  }

  async function captureView() {
    const video = videoRef.current
    if (!scan || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return
    setBusy(true); setError('')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Could not prepare camera frame')
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.94))
      if (!blob) throw new Error('Could not encode camera image')
      const form = new FormData()
      form.append('file', blob, `view_${ring}_${String(angle).padStart(3, '0')}.jpg`)
      form.append('angle', String(angle))
      form.append('ring', ring)
      const response = await fetch(`${API}/api/scans/${scan.id}/images`, { method: 'POST', body: form })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.detail ?? 'Could not upload scan image')
      }
      const result = await response.json()
      setScan(current => current ? { ...current, images: [...current.images, result.image] } : current)
      setSavedScans(current => current.map(item => item.id === scan.id ? { ...item, image_count: result.image_count } : item))
      if (lastImageUrlRef.current) URL.revokeObjectURL(lastImageUrlRef.current)
      const previewUrl = URL.createObjectURL(blob)
      lastImageUrlRef.current = previewUrl
      setLastImage(previewUrl)
      const nextStep = (step + 1) % ringSteps
      setStep(nextStep)
      setMessage(result.quality_warning || `Saved view at ${angle}°. Rotate the object approximately ${Math.round(360 / ringSteps)}° for the next overlapping view.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Capture failed')
    } finally { setBusy(false) }
  }

  async function completeScan() {
    if (!scan) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`${API}/api/scans/${scan.id}/complete`, { method: 'POST' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.detail ?? 'Could not complete scan')
      }
      const completed = await response.json() as ScanManifest
      setScan(completed)
      setSavedScans(current => current.map(item => item.id === completed.id ? { ...item, status: completed.status, image_count: completed.images.length } : item))
      setMessage('Photo set complete and saved on the ClayStudio host. Export it for photogrammetry reconstruction.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete scan')
    } finally { setBusy(false) }
  }

  async function startReconstruction() {
    if (!scan) return
    setBusy(true); setError('')
    try {
      const response = await fetch(API + '/api/scans/' + scan.id + '/reconstruct', { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.detail ?? 'Could not start reconstruction')
      setScan(body as ScanManifest)
      setMessage('Reconstruction queued. COLMAP is extracting features, matching views and solving camera positions. This can take several minutes.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start reconstruction')
    } finally { setBusy(false) }
  }

  async function exportScan() {
    if (!scan) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`${API}/api/scans/${scan.id}/export`)
      if (!response.ok) throw new Error('Could not export scan')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = `${scan.name.replace(/[^a-z0-9._-]+/gi, '_')}_photogrammetry.zip`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export failed')
    } finally { setBusy(false) }
  }

  return <section className="scan-studio">
    <div className="scan-header">
      <div><div className="panel-heading">3D WORKSHOP / PHOTOGRAMMETRY</div><h2>Object scanning</h2><p className="muted">Capture a set of overlapping photographs to reconstruct a 3D object.</p></div>
      <span className="stage-badge">DESKTOP SCAN MODE</span>
    </div>
    <div className="scan-notice"><strong>Photogrammetry capture</strong><span>Capture overlapping photographs, then run CPU-based COLMAP reconstruction to estimate camera poses and create a sparse colored point cloud. Dense surface and textured mesh generation will follow in a later GPU-enabled milestone.</span></div>
    {!scan ? <div className="scan-start-card">
      <div className="scan-start-icon">⬡</div>
      <h3>Start a new scan</h3>
      <p>Place a textured object on a steady surface. Keep the camera fixed and rotate the object between photographs.</p>
      <label className="field-label" htmlFor="scan-name">Scan name</label>
      <input id="scan-name" value={scanName} onChange={event => setScanName(event.target.value)} maxLength={120}/>
      <button className="capture-button" onClick={startScan} disabled={busy}>Create scan session</button>
      {savedScans.length > 0 && <div className="saved-scans"><div className="panel-heading">SAVED SCAN SESSIONS</div>{savedScans.map(item => <button key={item.id} className="saved-scan-row" onClick={() => resumeScan(item.id)} disabled={busy}><span><strong>{item.name}</strong><small>{item.image_count} photos · {item.status.replace("_", " ")}</small></span><em>OPEN →</em></button>)}</div>}
    </div> : <>
      <div className="scan-workspace">
        <div className="scan-camera-column">
          <div className="scan-camera-preview">
            <video ref={videoRef} autoPlay muted playsInline/>
            {!cameraReady && <div className="camera-placeholder"><span>◎</span><strong>Camera not connected</strong><small>Connect a camera to capture scan views.</small></div>}
            <div className="scan-angle-marker"><span>{ring === 'equator' ? 'EQUATOR' : 'UPPER RING'}</span><strong>{String(angle).padStart(3, '0')}°</strong><small>VIEW {step + 1} / {ringSteps}</small></div>
          </div>
          <div className="camera-actions">
            {cameraReady
              ? <button className="secondary-button" onClick={disconnectCamera}>Disconnect camera</button>
              : <button className="secondary-button" onClick={connectCamera}>Connect camera</button>}
            <button className="capture-button" onClick={captureView} disabled={!cameraReady || busy || scan.status !== 'capturing'}>● Capture scan view</button>
          </div>
          {lastImage && <div className="last-capture"><img src={lastImage} alt="Last captured scan view"/><span>Last uploaded view</span></div>}
        </div>
        <div className="scan-guide">
          <div className="panel-heading">CAPTURE PLAN</div>
          <div className="scan-progress"><div><span>Equator ring</span><strong>{equatorCount} / 24</strong></div><div className="progress-track"><i style={{ width: `${Math.min(100, equatorCount / 24 * 100)}%` }}/></div></div>
          <div className="scan-progress"><div><span>Upper ring</span><strong>{upperCount} / 12</strong></div><div className="progress-track"><i style={{ width: `${Math.min(100, upperCount / 12 * 100)}%` }}/></div></div>
          <div className="ring-selector">
            <button className={ring === 'equator' ? 'ring-choice active' : 'ring-choice'} onClick={() => { setRing('equator'); setStep(equatorCount % 24) }}>Equator · 15° steps</button>
            <button className={ring === 'upper' ? 'ring-choice active' : 'ring-choice'} onClick={() => { setRing('upper'); setStep(upperCount % 12) }}>Upper · 30° steps</button>
          </div>
          <div className="angle-wheel" aria-label={`Capture position ${angle} degrees`}>
            {Array.from({ length: ringSteps }, (_, index) => <span key={index} className={index < ringCount ? 'angle-dot done' : index === step ? 'angle-dot current' : 'angle-dot'} style={{ transform: `rotate(${index * 360 / ringSteps}deg) translateY(-75px)` }}/>)}
            <div className="angle-wheel-center"><strong>{totalCount}</strong><small>PHOTOS</small></div>
          </div>
          <p className="muted scan-instruction">{message}</p>
          <div className="scan-tips"><strong>For a good reconstruction</strong><ul><li>Use soft, even lighting; avoid moving shadows.</li><li>Choose a matte object with visible surface texture.</li><li>Keep the object fully in frame and avoid changing zoom.</li><li>Overlap adjacent views by roughly 60–80%.</li><li>Use a plain, non-reflective background.</li></ul></div>
          <div className="scan-footer-actions">
            <button className="secondary-button" onClick={completeScan} disabled={busy || totalCount < 8 || scan.status === 'capture_complete'}>Finish photo set</button>
            <button className="capture-button" onClick={exportScan} disabled={busy || totalCount === 0}>Export photos (.zip)</button>
          </div>
          <div className="reconstruction-actions">
            <div className="panel-heading">3D RECONSTRUCTION</div>
            <p className="muted">{scan.reconstruction?.stage ?? 'Run COLMAP to estimate camera positions and generate a sparse 3D point cloud from the captured views.'}</p>
            {scan.reconstruction?.status === 'failed' && <p className="error-message">{scan.reconstruction.error}</p>}
            <button className="capture-button" onClick={startReconstruction} disabled={busy || totalCount < 8 || scan.reconstruction?.status === 'running' || scan.reconstruction?.status === 'queued'}>
              {scan.reconstruction?.status === 'running' || scan.reconstruction?.status === 'queued' ? 'Reconstruction running…' : scan.reconstruction?.status === 'complete' ? 'Rebuild 3D point cloud' : 'Build 3D point cloud'}
            </button>
            {scan.reconstruction?.status === 'complete' && <>
              <p className="muted">{scan.reconstruction.note}</p>
              <a className="model-download" href={API + '/api/scans/' + scan.id + '/point-cloud'} download>Download point cloud (.ply)</a>
              <PointCloudPreview key={scan.id} url={API + '/api/scans/' + scan.id + '/point-cloud'} />
            </>}
          </div>
        </div>
      </div>
      <div className="scan-session-footer"><span>SESSION {scan.id.slice(0, 8).toUpperCase()} · {scan.status.toUpperCase()}</span><span>{totalCount} uploaded images · saved to backend storage</span></div>
    </>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>
}
