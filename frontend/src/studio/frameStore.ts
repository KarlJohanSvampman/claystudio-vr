export interface StoredFrame {
  id: string
  projectName: string
  createdAt: number
  blob: Blob
}

const DB_NAME = 'claystudio-local'
const STORE_NAME = 'frames'
const DB_VERSION = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('projectName', 'projectName', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open frame storage'))
  })
}

export async function loadFrames(projectName: string): Promise<StoredFrame[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).index('projectName').getAll(projectName)
    request.onsuccess = () => resolve((request.result as StoredFrame[]).sort((a, b) => a.createdAt - b.createdAt))
    request.onerror = () => reject(request.error ?? new Error('Could not load frames'))
    tx.oncomplete = () => db.close()
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Frame read failed')) }
  })
}

export async function saveFrame(frame: StoredFrame): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(frame)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Could not save frame')) }
  })
}

export async function removeFrame(id: string): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Could not delete frame')) }
  })
}
