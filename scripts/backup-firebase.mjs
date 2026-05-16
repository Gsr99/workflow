import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp, getApps } from 'firebase/app'
import { getFirestore, doc, getDoc, terminate } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCnCoTJEo9SN0Zszw7aAfdhzPH2uNCy93A',
  authDomain: 'team-dashboard-grg.firebaseapp.com',
  databaseURL: 'https://team-dashboard-grg-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'team-dashboard-grg',
  storageBucket: 'team-dashboard-grg.firebasestorage.app',
  messagingSenderId: '433901758957',
  appId: '1:433901758957:web:f29973298cf5a9a8891fe4',
  measurementId: 'G-9598T4Y6LB',
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
const db = getFirestore(app)

const readDoc = async (...path) => {
  const snap = await getDoc(doc(db, ...path))
  return snap.exists() ? snap.data() : null
}

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-')

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(projectRoot, process.argv[2] || 'backups')

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

try {
  const backup = {
    meta: {
      projectId: firebaseConfig.projectId,
      createdAt: new Date().toISOString(),
      source: 'flowhub Firestore backup',
    },
    docs: {
      appdata: await readDoc('flowhub', 'appdata'),
      canvas: await readDoc('flowhub', 'canvas'),
      tasknotes: await readDoc('flowhub', 'tasknotes'),
    },
  }

  const filename = `flowhub-backup-${timestamp()}.json`
  const outputPath = resolve(outDir, filename)

  writeFileSync(outputPath, JSON.stringify(backup, null, 2))

  const count = {
    members: backup.docs.appdata?.members?.length || 0,
    tasks: backup.docs.appdata?.tasks?.length || 0,
    messages: backup.docs.appdata?.messages?.length || 0,
    timeLogs: backup.docs.appdata?.timeLogs?.length || 0,
  }

  console.log(`Backup written: ${outputPath}`)
  console.log(`Members: ${count.members}, tasks: ${count.tasks}, messages: ${count.messages}, time logs: ${count.timeLogs}`)
} finally {
  await terminate(db)
}
