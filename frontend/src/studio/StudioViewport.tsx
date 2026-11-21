import { Canvas } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'

function ClayHead() {
  return <group position={[0, 0.92, 0]}>
    <mesh castShadow><sphereGeometry args={[0.34, 32, 24]} /><meshStandardMaterial color="#bd8067" roughness={0.92} /></mesh>
    <mesh position={[-0.13, 0.06, 0.285]}><sphereGeometry args={[0.035, 16, 12]} /><meshStandardMaterial color="#282522" /></mesh>
    <mesh position={[0.13, 0.06, 0.285]}><sphereGeometry args={[0.035, 16, 12]} /><meshStandardMaterial color="#282522" /></mesh>
    <mesh position={[0, -0.09, 0.315]}><boxGeometry args={[0.16, 0.025, 0.025]} /><meshStandardMaterial color="#684238" /></mesh>
  </group>
}
function Worktable() {
  return <group>
    <mesh position={[0,-0.08,0]} receiveShadow><boxGeometry args={[4.8,0.16,3.2]} /><meshStandardMaterial color="#77736d" roughness={0.85} /></mesh>
    <mesh position={[0,0.12,0]}><boxGeometry args={[1.05,0.24,1.05]} /><meshStandardMaterial color="#b9a58e" roughness={0.9} /></mesh>
    <ClayHead />
    <Grid position={[0,0.005,0]} args={[10,10]} cellSize={0.25} cellThickness={0.5} sectionSize={1} sectionThickness={1} fadeDistance={12} />
  </group>
}
export function StudioViewport() {
  return <div className="viewport"><Canvas shadows camera={{position:[5,4,6],fov:42}}>
    <color attach="background" args={['#171b20']} /><ambientLight intensity={1.05}/><directionalLight position={[4,7,5]} intensity={2} castShadow/>
    <Worktable/><OrbitControls makeDefault target={[0,0.8,0]}/>
  </Canvas><div className="viewport-label">WORKTABLE · 3D PREVIEW</div></div>
}
