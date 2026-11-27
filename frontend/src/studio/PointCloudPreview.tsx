import { Suspense, useMemo } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader'
import { Vector3, type BufferGeometry } from 'three'

function Cloud({ url }: { url: string }) {
  const loaded = useLoader(PLYLoader, url) as BufferGeometry
  const geometry = useMemo(() => {
    const copy = loaded.clone()
    copy.computeBoundingBox()
    copy.center()
    const bounds = copy.boundingBox
    if (bounds) {
      const size = bounds.getSize(new Vector3())
      const maxDimension = Math.max(size.x, size.y, size.z, 0.001)
      copy.scale(2.6 / maxDimension, 2.6 / maxDimension, 2.6 / maxDimension)
    }
    return copy
  }, [loaded])
  const hasColors = Boolean(geometry.getAttribute('color'))
  return <points geometry={geometry}>
    <pointsMaterial size={0.022} sizeAttenuation vertexColors={hasColors} color={hasColors ? '#ffffff' : '#e5a47c'} />
  </points>
}

export function PointCloudPreview({ url }: { url: string }) {
  return <div className="point-cloud-preview">
    <Canvas camera={{ position: [3.2, 2.4, 3.2], fov: 48 }}>
      <color attach="background" args={['#10151a']} />
      <ambientLight intensity={1.1} />
      <Grid args={[5, 5]} cellSize={0.25} cellThickness={0.5} sectionSize={1} sectionThickness={1} fadeDistance={8} />
      <Suspense fallback={null}><Cloud url={url} /></Suspense>
      <OrbitControls makeDefault />
    </Canvas>
    <span className="point-cloud-label">SPARSE RECONSTRUCTION · ORBIT TO INSPECT</span>
  </div>
}
