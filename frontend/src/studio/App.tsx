import { useEffect, useState } from 'react'
import { StudioViewport } from './StudioViewport'
const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
export default function App() {
 const [apiStatus,setApiStatus]=useState('Checking…')
 const [projectName,setProjectName]=useState('My first animation')
 const [cameraCount,setCameraCount]=useState<number|null>(null)
 useEffect(()=>{fetch(`${API}/api/health`).then(r=>r.json()).then(()=>setApiStatus('Connected')).catch(()=>setApiStatus('Offline'))},[])
 async function detectCameras(){try{const r=await fetch(`${API}/api/cameras`);const d=await r.json();setCameraCount(d.devices.length)}catch{setCameraCount(0)}}
 return <main className="app-shell">
  <header className="topbar"><div className="brand"><span className="brand-mark">C</span><div><strong>ClayStudio</strong><small>STOP MOTION · SCAN · SCULPT</small></div></div><div className="project-title"><span>PROJECT</span><strong>{projectName}</strong></div><div className="status"><i className={apiStatus==='Connected'?'online':''}/>API {apiStatus}</div></header>
  <section className="workspace"><aside className="left-panel"><div className="panel-heading">WORKSPACE</div>
   <button className="nav-item active">▣ <span>Animation Studio</span></button><button className="nav-item" disabled>◉ <span>Capture Studio</span><em>SOON</em></button><button className="nav-item" disabled>⬡ <span>3D Workshop</span><em>SOON</em></button><button className="nav-item" disabled>☺ <span>Facial Studio</span><em>SOON</em></button>
   <div className="panel-divider"/><div className="panel-heading">PROJECT</div><label className="field-label">Project name</label><input value={projectName} onChange={e=>setProjectName(e.target.value)}/>
   <div className="panel-divider"/><div className="panel-heading">CAMERA</div><button className="secondary-button" onClick={detectCameras}>Detect cameras</button>{cameraCount!==null&&<p className="muted">{cameraCount} camera(s) detected</p>}<p className="muted">External camera capture will be enabled in the next milestone.</p>
  </aside><section className="center-stage"><div className="stage-toolbar"><span>ANIMATION STAGE</span><span className="stage-badge">DESKTOP PREVIEW</span></div><StudioViewport/><div className="stage-hint">Orbit: drag · Zoom: scroll · Pan: right-drag</div></section>
  <aside className="right-panel"><div className="panel-heading">CAPTURE</div><div className="empty-card"><div className="empty-icon">◎</div><strong>No frames yet</strong><p>Connect a camera and capture your first frame.</p></div><div className="panel-divider"/><div className="panel-heading">ONION SKIN</div><label className="field-label">Previous frame opacity</label><input type="range" min="0" max="100" defaultValue="45"/><p className="muted">Onion skin becomes available after the first capture.</p></aside></section>
  <footer className="timeline"><div className="timeline-title"><strong>TIMELINE</strong><span>0 FRAMES</span></div><div className="timeline-track"><span>Capture frames to begin building your animation</span></div><div className="timeline-controls"><span>FPS</span><select defaultValue="12"><option>8</option><option>12</option><option>15</option><option>24</option><option>30</option></select><button disabled>▶ PLAY</button></div></footer>
 </main>
}
