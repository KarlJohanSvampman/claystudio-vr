import { Canvas } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'

function Worktable() {
  return (
    <group>
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <boxGeometry args={[4.8, 0.16, 3.2]} />
        <meshStandardMaterial color="#77736d" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[1.05, 0.24, 1.05]} />
        <meshStandardMaterial color="#b9a58e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <sphereGeometry args={[0.34, 32, 24]} />
        <meshStandardMaterial color="#b86f5a" roughness={0.95} />
      </mesh>
      <Grid position={[0, 0.005, 0]} args={[10, 10]} cellSize={0.25} cellThickness={0.5} sectionSize={1} sectionThickness={1} fadeDistance={12} />
    </group>
  )
}

export function StudioViewport() {
  return (
    <div className="viewport">
      <Canvas camera={{ position: [5, 4, 6], fov: 42 }} shadows>
        <color attach="background" args={['#171b20']} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[4, 7, 5]} intensity={2} castShadow />
        <Worktable />
        <OrbitControls makeDefault target={[0, 0.5, 0]} />
      </Canvas>
      <div className="viewport-label">WORKTABLE · 3D PREVIEW</div>
    </div>
  )
}
