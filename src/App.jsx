// ─────────────────────────────────────────────────────────────────────────────
//  Daylighting v3 — Complete React Productivity Dashboard
//  Single-file, export default FlowHub
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useContext, createContext, useCallback, useMemo } from "react"
import { initializeApp, getApps } from "firebase/app"
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, sendPasswordResetEmail, verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth"
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, addDoc } from "firebase/firestore"
import { canShowFirstRun, getDbErrorMessage, getLoginErrorMessage, cacheMembersToStorage, getCachedMembers } from './authHelpers'
import { createSaveScheduler } from './syncHelpers'
import { clearStoredBreakState, resolveInitialBreakState, setStoredBreakState } from './breakState'
import { canSeeMember, visibleMemberIdsForUser, visibleMembersForUser } from './memberVisibility'
import { BREAK_LIMIT_SECS, IDLE_LIMIT_SECS, PRODUCTIVE_GOAL_SECS, getProductivityAdjustment } from './productivityRules'
import { advanceTimeState, getActiveTimerMode, getTodayTaskTimerSeconds } from './timeTracking'

// ── Firebase Setup ────────────────────────────────────────────────────────────
// Replace these values with your own from Firebase Console →
// Project Settings → Your apps → SDK setup and configuration
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCnCoTJEo9SN0Zszw7aAfdhzPH2uNCy93A",
  authDomain: "team-dashboard-grg.firebaseapp.com",
  databaseURL: "https://team-dashboard-grg-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "team-dashboard-grg",
  storageBucket: "team-dashboard-grg.firebasestorage.app",
  messagingSenderId: "433901758957",
  appId: "1:433901758957:web:f29973298cf5a9a8891fe4",
  measurementId: "G-9598T4Y6LB"
}
const firebaseApp = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG)
const firebaseAuth = getAuth(firebaseApp)
const googleProvider = new GoogleAuthProvider()
const db = getFirestore(firebaseApp)
const FH_DOC = doc(db, 'flowhub', 'appdata')
const BASE_URL = import.meta.env.BASE_URL
const asset = (p) => `${BASE_URL}${p.replace(/^\/+/, '')}`

const BRAND_IMAGE = asset('bg.png')
const LOGIN_PHOTOS = [
  { src: asset('login-photos/ganesh.jpeg'), alt: 'Ganesh' },
  { src: asset('login-photos/adnan.jpeg'), alt: 'Adnan' },
  { src: asset('login-photos/rishi.jpeg'), alt: 'Rishi' },
  { src: asset('login-photos/rohit.jpeg'), alt: 'Rohit' },
  { src: asset('login-photos/chandu.jpeg'), alt: 'Chandu' },
  { src: asset('login-photos/gau.jpeg'), alt: 'Gau' },
]

// ── Google Calendar Integration ───────────────────────────────────────────────
// Fill in your Client ID from: Google Cloud Console → APIs & Services → Credentials
// Enable the "Google Calendar API" for your project first.
// Authorized JavaScript origins: https://team-dashboard-grg.web.app
// Leave blank to disable Google Calendar sync (app still works fully without it).
const GOOGLE_CAL_CLIENT_ID = '' // e.g. '1234567890-abc.apps.googleusercontent.com'

// ── Firebase "Trigger Email" Extension ───────────────────────────────────────
// Task assignment emails are written here; the Firebase Extension sends them.
// Install: Firebase Console → Extensions → "Trigger Email from Firestore"
// Configure with your SendGrid API key or SMTP credentials.
const MAIL_COL = collection(db, 'mail')

// ── Theme ─────────────────────────────────────────────────────────────────────
const DARK = {
  bg: '#0d1117', bg2: '#161b22', bg3: '#1c2128', bg4: '#21262d',
  t1: '#e6edf3', t2: '#8b949e', t3: '#656d76',
  acc: '#58a6ff', acc2: '#1f6feb', red: '#f85149', grn: '#3fb950',
  yl: '#d29922', brd: '#30363d', shadow: 'rgba(0,0,0,0.5)'
}
const LIGHT = {
  bg: '#f6f8fa', bg2: '#ffffff', bg3: '#f0f3f6', bg4: '#e8ecf0',
  t1: '#1f2328', t2: '#57606a', t3: '#8c959f',
  acc: '#0969da', acc2: '#54aeff', red: '#cf222e', grn: '#1a7f37',
  yl: '#9a6700', brd: '#d0d7de', shadow: 'rgba(0,0,0,0.12)'
}

const TC = createContext(null)
const useT = () => useContext(TC)

// ── Responsive breakpoint hook ────────────────────────────────────────────────
// Returns 'mobile' | 'tablet' | 'desktop' and updates on resize.
// mobile  < 640   → bottom nav + slide-in drawer
// tablet  640-1023→ icon-only collapsed sidebar
// desktop ≥ 1024  → full sidebar with labels (unchanged)
function useBreakpoint() {
  const get = () => {
    const w = window.innerWidth
    return w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop'
  }
  const [bp, setBp] = useState(get)
  useEffect(() => {
    const handler = () => setBp(get())
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return bp
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10)
const fmtS = s => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${m}:${String(ss).padStart(2, '0')}`
}
const PRODUCTIVE_LIMIT_SECS = 9 * 3600
const EMPTY_TIME_STATE = { task: 0, break: 0, idle: 0 }
const getLogTimeState = l => ({
  task: l?.taskSeconds !== undefined ? (l.taskSeconds || 0) : (l?.seconds || 0),
  break: l?.breakSeconds || 0,
  idle: l?.idleSeconds || 0,
})
const getLogBucketSeconds = l => totalTimeStateSeconds(getLogTimeState(l))
const getLogTotalSeconds = l => Math.max(l?.seconds || 0, getLogBucketSeconds(l))
const getLogDisplayTimeState = l => {
  const state = getLogTimeState(l)
  const total = getLogTotalSeconds(l)
  const bucketTotal = totalTimeStateSeconds(state)
  return bucketTotal < total ? { ...state, idle: (state.idle || 0) + (total - bucketTotal) } : state
}
const getLogsTotalSeconds = logs => (logs || []).reduce((sum, l) => sum + getLogTotalSeconds(l), 0)
const getSessionGroupKey = l => {
  const loginKey = l?.loginAt || l?.id || 'unknown'
  return `${l?.userId || ''}__${l?.date || ''}__${loginKey}`
}
const getCanonicalSessionLog = (logs = []) => {
  if (!logs.length) return null
  const largest = [...logs].sort((a, b) => getLogTotalSeconds(b) - getLogTotalSeconds(a))[0]
  const state = getLogDisplayTimeState(largest)
  return {
    ...largest,
    seconds: getLogTotalSeconds(largest),
    taskSeconds: state.task,
    breakSeconds: state.break,
    idleSeconds: state.idle,
    logoutAt: logs.some(l => !l.logoutAt) ? null : largest.logoutAt,
    sourceLogs: logs,
  }
}
const canonicalizeSessionLogs = (logs = []) => {
  const canonical = []
  const sessionGroups = new Map()
  logs.forEach(l => {
    if (!l?.manual) {
      const key = getSessionGroupKey(l)
      const list = sessionGroups.get(key) || []
      list.push(l)
      sessionGroups.set(key, list)
    } else {
      canonical.push(l)
    }
  })
  sessionGroups.forEach(list => {
    const session = getCanonicalSessionLog(list)
    if (session) canonical.push(session)
  })
  return canonical
}
const sumTimeStates = states => states.reduce((sum, state) => ({
  task: sum.task + (state.task || 0),
  break: sum.break + (state.break || 0),
  idle: sum.idle + (state.idle || 0),
}), { ...EMPTY_TIME_STATE })
const normalizeDayTimeState = state => {
  const task = Math.min(state.task || 0, PRODUCTIVE_LIMIT_SECS)
  const breakTime = Math.min(state.break || 0, BREAK_LIMIT_SECS)
  const idle = (state.idle || 0)
    + Math.max(0, (state.task || 0) - PRODUCTIVE_LIMIT_SECS)
    + Math.max(0, (state.break || 0) - BREAK_LIMIT_SECS)
  return { task, break: breakTime, idle, total: task + breakTime + idle }
}
const totalTimeStateSeconds = state => (state.task || 0) + (state.break || 0) + (state.idle || 0)
const distributeEditedTime = (log, totalSeconds) => {
  const total = Math.max(0, Math.floor(totalSeconds || 0))
  const old = getLogDisplayTimeState(log)
  const breakTime = Math.min(old.break || 0, total)
  const idle = Math.min(old.idle || 0, total - breakTime)
  const task = Math.max(0, total - breakTime - idle)
  return { task, break: breakTime, idle }
}
const IS = T => ({
  background: T.bg3, border: `1px solid ${T.brd}`, borderRadius: 8,
  color: T.t1, padding: '8px 12px', outline: 'none', width: '100%',
  fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif"
})
const BT = (bg, c = '#fff', ex = {}) => ({
  background: bg, color: c, border: 'none', borderRadius: 8,
  padding: '8px 16px', cursor: 'pointer', fontSize: 13,
  fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", ...ex
})
const GH = (T, c) => ({
  background: 'transparent', border: `1px solid ${T.brd}`, borderRadius: 8,
  color: c || T.t1, padding: '6px 14px', cursor: 'pointer', fontSize: 13,
  fontFamily: "'Plus Jakarta Sans', sans-serif"
})

const mkCSS = dark => `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { font-family: 'Plus Jakarta Sans', sans-serif; background: ${dark ? DARK.bg : LIGHT.bg}; color: ${dark ? DARK.t1 : LIGHT.t1}; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${dark ? '#30363d' : '#d0d7de'}; border-radius: 4px; }
  input, textarea, select, button { font-family: 'Plus Jakarta Sans', sans-serif; }
  .fh-fraunces { font-family: 'Fraunces', serif !important; }
  a { text-decoration: none; }
  @keyframes fh-orbit-wrap {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes fh-orbit-photo {
    from { transform: translateX(var(--fh-r)) rotate(0deg); }
    to   { transform: translateX(var(--fh-r)) rotate(-360deg); }
  }
  @keyframes fh-modal-in {
    from { opacity: 0; transform: translateY(22px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }
  @keyframes fh-backdrop-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`

// ── Seed Data ─────────────────────────────────────────────────────────────────
// Minimal seed — only used when Firestore has NO data at all (brand new project).
// Contains NO fake members so real user data is never at risk of being overwritten.
const SEED_MEMBERS = []
const SEED_TASKS = []
const SEED_MESSAGES = []
const SEED_MEETINGS = []
const SEED_PROJECTS = []

// ── Icons ─────────────────────────────────────────────────────────────────────
const ICONS = {
  home: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
  task: 'M9 11l3 3L22 4 M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  chat: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  meet: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  award: 'M12 15c4.97 0 9-2.24 9-5s-4.03-5-9-5-9 2.24-9 5 4.03 5 9 5z M12 15v7 M8 19l4-4 4 4',
  globe: 'M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z M2 12h20 M12 2a15.3 15.3 0 010 20 M12 2a15.3 15.3 0 000 20',
  lock: 'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z M7 11V7a5 5 0 0110 0v4',
  admin: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  sun: 'M12 17A5 5 0 1012 7a5 5 0 000 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  plus: 'M12 5v14 M5 12h14',
  x: 'M18 6L6 18 M6 6l12 12',
  trash: 'M3 6h18 M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6 M10 6V4a1 1 0 011-1h2a1 1 0 011 1v2',
  edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  paper: 'M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  share: 'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8 M16 6l-4-4-4 4 M12 2v13',
  files: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
  pen: 'M12 20h9 M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z',
  coffee: 'M18 8h1a4 4 0 010 8h-1 M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z M6 1v3 M10 1v3 M14 1v3',
  check: 'M20 6L9 17l-5-5',
  key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  timer: 'M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z M12 6v6l4 2',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z',
  cal: 'M3 4h18v18H3V4z M16 2v4 M8 2v4 M3 10h18',
  briefcase: 'M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2',
  link: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71 M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
}

function I({ n, size = 18, color, strokeWidth = 1.8, style = {} }) {
  const d = ICONS[n] || ''
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color || 'currentColor'} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" style={style}>
      {d.split(' M').map((seg, i) => (
        <path key={i} d={(i === 0 ? '' : ' M') + seg} />
      ))}
    </svg>
  )
}

function BrandLogo({ size = 34, radius = 11 }) {
  return (
    <img
      src={BRAND_IMAGE}
      alt="Daylighting"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        objectFit: 'contain',
        background: '#0d1117',
        display: 'block',
        border: '1px solid rgba(255,255,255,0.22)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.24)',
      }}
    />
  )
}

function LoginPhotoWall({ dark, bp }) {
  const mobile = bp === 'mobile'
  const tablet = bp === 'tablet'
  const radius    = mobile ? 130 : tablet ? 220 : 330
  const photoSize = mobile ?  96 : tablet ? 148 : 200
  const duration  = 24 // seconds per full orbit
  const n = LOGIN_PHOTOS.length

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {LOGIN_PHOTOS.map((photo, i) => {
        // Space photos evenly: photo i starts at angle i*(360/n) degrees.
        // Equivalent to a negative delay of  -(i/n)*duration seconds.
        const delay = -((i / n) * duration)
        return (
          // Outer wrapper: sits at screen center (0×0), rotates the whole orbit arm
          <div key={photo.src} style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: 0, height: 0,
            animation: `fh-orbit-wrap ${duration}s linear ${delay}s infinite`,
          }}>
            {/* Inner: pushed out to orbit radius, counter-rotates so photo stays upright */}
            <div style={{
              position: 'absolute',
              top: -(photoSize / 2),
              left: -(photoSize / 2),
              width: photoSize,
              height: photoSize,
              '--fh-r': `${radius}px`,
              animation: `fh-orbit-photo ${duration}s linear ${delay}s infinite`,
              borderRadius: '50%',
              overflow: 'hidden',
              background: dark ? 'rgba(13,17,23,0.34)' : 'rgba(255,255,255,0.82)',
              border: `${mobile ? 3 : 4}px solid ${dark ? 'rgba(240,246,252,0.46)' : 'rgba(31,35,40,0.2)'}`,
              boxShadow: dark
                ? '0 20px 60px rgba(0,0,0,0.48), 0 0 0 1px rgba(255,255,255,0.1)'
                : '0 20px 48px rgba(9,105,218,0.18), 0 0 0 1px rgba(31,35,40,0.1)',
            }}>
              <img src={photo.src} alt="" style={{
                width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                filter: dark ? 'brightness(1.16) saturate(1.08)' : 'brightness(1.06) saturate(1.08) contrast(1.04)',
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────
const AV_COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#a371f7', '#39d353', '#ff7b72', '#ffa657']
function Av({ member, size = 32 }) {
  const idx = member ? (member.id.charCodeAt(1) || 0) % AV_COLORS.length : 0
  const isPhoto = member?.avatar && (member.avatar.startsWith('data:image') || member.avatar.startsWith('http'))
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: isPhoto ? 'transparent' : AV_COLORS[idx],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: '#fff', flexShrink: 0, userSelect: 'none',
      overflow: 'hidden', flexBasis: size, minWidth: size
    }}>
      {isPhoto
        ? <img src={member.avatar} alt={member.name || 'avatar'}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : (member?.avatar || '?')
      }
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, width = 480 }) {
  const { T, bp } = useT()
  const isMobile = bp === 'mobile'
  if (!open) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex',
      alignItems: isMobile ? 'flex-end' : 'center',
      justifyContent: 'center', zIndex: 1500,
      padding: isMobile ? 0 : 16
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: T.bg2, border: `1px solid ${T.brd}`,
        borderRadius: isMobile ? '16px 16px 0 0' : 16,
        width: '100%', maxWidth: isMobile ? '100%' : width,
        maxHeight: isMobile ? '92vh' : '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: `0 24px 80px ${T.shadow}`
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: `1px solid ${T.brd}`, flexShrink: 0
        }}>
          <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 18 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.t2, cursor: 'pointer', lineHeight: 1 }}>
            <I n="x" size={20} />
          </button>
        </div>
        <div style={{ padding: 24, overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>{children}</div>
      </div>
    </div>
  )
}

// ── Confirm ───────────────────────────────────────────────────────────────────
function Confirm({ open, onClose, onOk, msg, okLabel = 'Delete', okColor = '#f85149' }) {
  const { T } = useT()
  if (!open) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
    }}>
      <div style={{
        background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 16,
        padding: 36, maxWidth: 360, width: '100%', margin: 16, textAlign: 'center'
      }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>⚠️</div>
        <p style={{ color: T.t1, marginBottom: 28, lineHeight: 1.65, fontSize: 14 }}>{msg}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={onClose} style={GH(T)}>Cancel</button>
          <button onClick={onOk} style={BT(okColor)}>{okLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function Stat({ label, value, icon, color }) {
  const { T } = useT()
  return (
    <div style={{
      background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14,
      padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16
    }}>
      <div style={{
        width: 46, height: 46, borderRadius: 12, background: `${color}1a`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
      }}>
        <I n={icon} size={22} color={color} />
      </div>
      <div>
        <div style={{ color: T.t2, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{label}</div>
        <div style={{ color: T.t1, fontSize: 24, fontWeight: 700, marginTop: 2 }}>{value}</div>
      </div>
    </div>
  )
}

// ── Login ─────────────────────────────────────────────────────────────────────
function Login({ members, onLogin, onRegister, dark, setDark, dbLoaded, noMembers, dbLoadError }) {
  const { T, bp } = useT()
  // screen: 'signin' | 'signup' | 'newpw' | 'register' | 'firstrun'
  // Never show firstrun if dl_uid exists — a stored session means a user was here before.
  // Showing firstrun in that case (e.g. when Firestore failed to load) would let anyone
  // create a second admin account over the top of the existing one.
  const hasStoredSession = !!localStorage.getItem('dl_uid')
  const isFirstRun = noMembers && dbLoaded && !hasStoredSession
  const [screen, setScreen] = useState(isFirstRun ? 'firstrun' : 'signin')
  const [modalOpen, setModalOpen] = useState(isFirstRun)
  // First-run admin setup
  const [frName, setFrName] = useState('')
  const [frEmail, setFrEmail] = useState('')
  const [frPw, setFrPw] = useState('')
  const [frErr, setFrErr] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [newPwMember, setNewPwMember] = useState(null)
  const [np1, setNp1] = useState('')
  const [np2, setNp2] = useState('')
  const [ssoLoading, setSsoLoading] = useState(false)
  // register (Google SSO new user)
  const [regEmail, setRegEmail] = useState('')
  const [regName, setRegName] = useState('')
  const [regPw, setRegPw] = useState('')
  const [regErr, setRegErr] = useState('')
  // signup (manual new user)
  const [suName, setSuName] = useState('')
  const [suEmail, setSuEmail] = useState('')
  const [suPw, setSuPw] = useState('')
  const [suPw2, setSuPw2] = useState('')
  const [suErr, setSuErr] = useState('')

  const clearErr = () => { setErr(''); setRegErr(''); setSuErr('') }

  // ── Forgot password ────────────────────────────────────────────────────────
  const [fpEmail, setFpEmail] = useState('')
  const [fpMsg, setFpMsg] = useState('')
  const [fpErr, setFpErr] = useState('')
  const [fpSending, setFpSending] = useState(false)

  const doForgotPw = async () => {
    if (!fpEmail.trim()) return setFpErr('Enter your email address.')
    setFpSending(true); setFpErr(''); setFpMsg('')
    try {
      // handleCodeInApp:true makes the reset link land back on THIS app (not Firebase's generic page)
      // so the PasswordResetConfirm component can handle it via ?mode=resetPassword&oobCode=XXX
      await sendPasswordResetEmail(firebaseAuth, fpEmail.trim(), {
        url: window.location.origin,
        handleCodeInApp: true,
      })
      setFpMsg(`✅ Reset link sent to ${fpEmail.trim()}. Check your inbox (and spam folder).`)
    } catch (e) {
      if (e.code === 'auth/user-not-found') setFpErr('No Firebase account found for that email.')
      else if (e.code === 'auth/invalid-email') setFpErr('Please enter a valid email address.')
      else setFpErr('Failed to send reset email: ' + e.message)
    } finally { setFpSending(false) }
  }

  const doLogin = async () => {
    const emailLower = email.trim().toLowerCase()
    if (!emailLower) return setErr('Please enter your email address.')

    // Check in-memory members first
    let m = members.find(x => x.email.toLowerCase() === emailLower)

    // Fallback 1: localStorage cache (works even when Firestore is completely down)
    if (!m && members.length === 0) {
      const cached = getCachedMembers()
      if (cached.length > 0) {
        m = cached.find(x => x.email.toLowerCase() === emailLower)
      }
    }

    // Fallback 2: try Firestore direct read (handles race condition where
    // snapshot hasn't arrived yet — same pattern as googleSSO)
    if (!m && members.length === 0) {
      try {
        const snap = await getDoc(FH_DOC)
        if (snap.exists()) {
          const fsMembers = snap.data().members || []
          m = fsMembers.find(x => x.email.toLowerCase() === emailLower)
          // Cache the fetched members for future use
          if (fsMembers.length) cacheMembersToStorage(fsMembers)
        }
      } catch (e) {
        console.error('[FlowHub] Firestore fallback lookup failed:', e?.code, e?.message)
      }
    }

    if (!m) {
      const errMsg = getLoginErrorMessage({ members, email })
      return setErr(errMsg)
    }
    if (m.mustChangePw) { setNewPwMember(m); setScreen('newpw'); setErr(''); return }
    if (m.pw !== pw) return setErr('Incorrect password.')
    onLogin(m)
  }

  const doSetNewPw = () => {
    if (np1.length < 6) return setErr('Password must be at least 6 characters.')
    if (np1 !== np2) return setErr('Passwords do not match.')
    onLogin(newPwMember, np1)
  }

  const googleSSO = async () => {
    clearErr()
    setSsoLoading(true)
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider)
      const gEmail = result.user.email.toLowerCase()
      const gName = result.user.displayName || result.user.email.split('@')[0]

      // Check in-memory members first (fast path)
      let m = members.find(x => x.email.toLowerCase() === gEmail)

      // If not found, check Firestore directly (handles page-refresh race condition)
      if (!m) {
        const snap = await getDoc(FH_DOC)
        if (snap.exists()) {
          const fsMembers = snap.data().members || []
          m = fsMembers.find(x => x.email.toLowerCase() === gEmail)
        }
      }

      if (m) {
        onLogin(m)
      } else {
        setRegEmail(result.user.email)
        setRegName(gName)
        setScreen('register')
      }
    } catch (e) {
      if (e.code === 'auth/popup-closed-by-user') setErr('Sign-in cancelled.')
      else if (e.code === 'auth/unauthorized-domain') setErr('Domain not authorized in Firebase Console.')
      else setErr('Google sign-in failed: ' + e.message)
    } finally {
      setSsoLoading(false)
    }
  }

  const doRegister = () => {
    if (!regName.trim()) return setRegErr('Please enter your name.')
    if (regPw && regPw.length < 6) return setRegErr('Password must be at least 6 characters.')
    // First registrant becomes admin if no members exist yet
    const role = members.length === 0 ? 'admin' : 'member'
    onRegister({
      id: uid(), name: regName.trim(), email: regEmail,
      role, pw: regPw || '', avatar: '', color: '#58a6ff', mustChangePw: !regPw
    })
  }

  const doSignup = () => {
    if (!suName.trim()) return setSuErr('Name is required.')
    if (!suEmail.trim()) return setSuErr('Email is required.')
    if (suPw.length < 6) return setSuErr('Password must be at least 6 characters.')
    if (suPw !== suPw2) return setSuErr('Passwords do not match.')
    if (members.find(m => m.email.toLowerCase() === suEmail.trim().toLowerCase()))
      return setSuErr('An account with this email already exists.')
    onRegister({
      id: uid(), name: suName.trim(), email: suEmail.trim(),
      role: 'member', pw: suPw, avatar: '', color: '#58a6ff', mustChangePw: false
    })
  }

  const closeModal = () => { setModalOpen(false); setScreen('signin') }

  const openModal = (s) => { setScreen(s); setModalOpen(true); clearErr() }

  const card = (children) => (
    <div style={{ position: 'relative', minHeight: '100vh', backgroundColor: T.bg, overflow: 'hidden' }}>
      <LoginPhotoWall dark={dark} bp={bp} />

      {/* top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: bp === 'mobile' ? '14px 18px' : '18px 36px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BrandLogo size={34} radius={10} />
          {bp !== 'mobile' && (
            <span className="fh-fraunces" style={{ color: T.t1, fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>
              Daylighting
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => openModal('signin')} style={{
            ...BT(T.acc), padding: '8px 20px', fontSize: 14, borderRadius: 10,
          }}>Login</button>
          <button onClick={() => openModal('signup')} style={{
            ...GH(T), padding: '8px 20px', fontSize: 14, borderRadius: 10,
          }}>Sign Up</button>
          <button onClick={() => setDark(!dark)} style={{
            background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
            border: 'none', borderRadius: 8, color: T.t2, cursor: 'pointer',
            padding: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <I n={dark ? 'sun' : 'moon'} size={16} />
          </button>
        </div>
      </div>

      {/* hero text */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        textAlign: 'center', padding: 16,
      }}>
        <h1 className="fh-fraunces" style={{
          color: T.t1, fontSize: bp === 'mobile' ? 36 : 54,
          letterSpacing: -1.5, lineHeight: 1.1,
          textShadow: dark ? '0 2px 24px rgba(0,0,0,0.7)' : '0 2px 24px rgba(255,255,255,0.8)',
        }}>Daylighting</h1>
        <p style={{
          color: T.t2, fontSize: bp === 'mobile' ? 13 : 16, marginTop: 10,
          textShadow: dark ? '0 1px 12px rgba(0,0,0,0.6)' : '0 1px 12px rgba(255,255,255,0.7)',
        }}>Team Productivity Dashboard</p>
      </div>

      {/* modal overlay */}
      {modalOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(6px)',
            animation: 'fh-backdrop-in 0.2s ease',
          }}>
          <div style={{
            position: 'relative',
            background: dark ? 'rgba(22,27,34,0.97)' : 'rgba(255,255,255,0.98)',
            border: `1px solid ${dark ? 'rgba(240,246,252,0.14)' : 'rgba(31,35,40,0.12)'}`,
            borderRadius: 20, padding: 40,
            width: '100%', maxWidth: 420,
            boxShadow: `0 32px 80px ${T.shadow}`,
            backdropFilter: 'blur(20px)',
            animation: 'fh-modal-in 0.25s ease',
          }}>
            <button onClick={closeModal} style={{
              position: 'absolute', top: 14, right: 14,
              background: 'none', border: 'none', color: T.t2, cursor: 'pointer', padding: 4,
            }}>
              <I n="x" size={18} />
            </button>
            {children}
          </div>
        </div>
      )}
    </div>
  )

  const ErrBox = ({ msg }) => msg ? (
    <div style={{
      background: `${T.red}1a`, border: `1px solid ${T.red}44`, borderRadius: 8,
      padding: '10px 14px', color: T.red, fontSize: 13, marginBottom: 14
    }}>{msg}</div>
  ) : null

  // ── Forgot password screen ─────────────────────────────────────────────────
  if (screen === 'forgotpw') return card(<>
    <div style={{ marginBottom: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🔑</div>
      <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: 22 }}>Reset Password</h2>
      <p style={{ color: T.t2, fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
        Enter your email — we'll send a reset link that works for <strong>1 hour</strong>.
      </p>
    </div>
    <div style={{ background: `${T.yl}15`, border: `1px solid ${T.yl}44`, borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
      <p style={{ color: T.yl, fontSize: 12, lineHeight: 1.6 }}>
        ⚠️ <strong>One-time use only.</strong> If you see "expired or already used", click <em>Resend</em> to get a fresh link. Do not click the same link twice.
      </p>
    </div>
    {fpErr && <div style={{
      background: `${T.red}1a`, border: `1px solid ${T.red}44`, borderRadius: 8,
      padding: '10px 14px', color: T.red, fontSize: 13, marginBottom: 14
    }}>{fpErr}</div>}
    {fpMsg && <div style={{
      background: `${T.grn}1a`, border: `1px solid ${T.grn}44`, borderRadius: 8,
      padding: '10px 14px', color: T.grn, fontSize: 13, marginBottom: 14
    }}>{fpMsg}</div>}
    {!fpMsg && <>
      <input placeholder="Your email address" type="email" value={fpEmail}
        onChange={e => { setFpEmail(e.target.value); setFpErr('') }}
        onKeyDown={e => e.key === 'Enter' && doForgotPw()}
        style={{ ...IS(T), marginBottom: 16 }} autoFocus />
      <button onClick={doForgotPw} disabled={fpSending} style={{
        ...BT(T.acc), width: '100%', padding: '11px', marginBottom: 12,
        opacity: fpSending ? 0.7 : 1, cursor: fpSending ? 'wait' : 'pointer'
      }}>
        {fpSending ? 'Sending…' : 'Send Reset Link'}
      </button>
    </>}
    {fpMsg && <button onClick={doForgotPw} style={{ ...BT(T.acc), width: '100%', padding: '11px', marginBottom: 12 }}>
      Resend Reset Link
    </button>}
    <button onClick={() => { setScreen('signin'); setFpEmail(''); setFpErr(''); setFpMsg('') }}
      style={{ ...GH(T), width: '100%', padding: '10px', fontSize: 13 }}>
      ← Back to Sign In
    </button>
  </>)

  // ── First-run / recovery screen ────────────────────────────────────────────
  if (screen === 'firstrun') return card(<>
    <div style={{ marginBottom: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🌅</div>
      <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: 22 }}>Welcome to Daylighting</h2>
      <p style={{ color: T.t2, fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
        No members found. Create your <strong style={{ color: T.acc }}>admin account</strong> to get started, then add teammates from the Admin Panel.
      </p>
    </div>
    <div style={{ background: `${T.yl}15`, border: `1px solid ${T.yl}44`, borderRadius: 10, padding: '11px 14px', marginBottom: 16 }}>
      <p style={{ color: T.yl, fontSize: 12, lineHeight: 1.6 }}>
        ⚠️ If your team data was lost, create your admin account first, then use <strong>Admin Panel → Add Member</strong> to restore your team's emails. Members can log back in via Google SSO.
      </p>
    </div>
    {frErr && <div style={{ background: `${T.red}1a`, border: `1px solid ${T.red}44`, borderRadius: 8, padding: '10px 14px', color: T.red, fontSize: 13, marginBottom: 14 }}>{frErr}</div>}
    <input placeholder="Your full name" value={frName} onChange={e => { setFrName(e.target.value); setFrErr('') }}
      style={{ ...IS(T), marginBottom: 10 }} autoFocus />
    <input placeholder="Email address" type="email" value={frEmail} onChange={e => { setFrEmail(e.target.value); setFrErr('') }}
      style={{ ...IS(T), marginBottom: 10 }} />
    <input placeholder="Password (min 6 chars)" type="password" value={frPw} onChange={e => { setFrPw(e.target.value); setFrErr('') }}
      style={{ ...IS(T), marginBottom: 20 }} />
    <button onClick={() => {
      if (!frName.trim()) return setFrErr('Name is required.')
      if (!frEmail.trim()) return setFrErr('Email is required.')
      if (frPw.length < 6) return setFrErr('Password must be at least 6 characters.')
      onRegister({
        id: uid(), name: frName.trim(), email: frEmail.trim().toLowerCase(),
        role: 'admin', pw: frPw, avatar: '', mustChangePw: false
      })
    }} style={{ ...BT(T.acc), width: '100%', padding: '11px', marginBottom: 12 }}>
      Create Admin Account
    </button>
    <button onClick={() => setScreen('signin')} style={{ ...GH(T), width: '100%', padding: '10px', fontSize: 13 }}>
      Sign In Instead
    </button>
    <button onClick={googleSSO} disabled={ssoLoading} style={{
      ...GH(T), width: '100%', padding: '10px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13,
      opacity: ssoLoading ? 0.6 : 1, cursor: ssoLoading ? 'wait' : 'pointer', marginTop: 8
    }}>
      <span>🔑</span> {ssoLoading ? 'Signing in...' : 'Continue with Google (creates admin)'}
    </button>
  </>)

  // ── New-password screen ────────────────────────────────────────────────────
  if (screen === 'newpw') return card(<>
    <div style={{ marginBottom: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>🔑</div>
      <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: 22 }}>Set New Password</h2>
      <p style={{ color: T.t2, fontSize: 13, marginTop: 6 }}>Create a new password to continue.</p>
    </div>
    <ErrBox msg={err} />
    <input placeholder="New password" type="password" value={np1}
      onChange={e => { setNp1(e.target.value); setErr('') }} style={{ ...IS(T), marginBottom: 10 }} />
    <input placeholder="Confirm password" type="password" value={np2}
      onChange={e => { setNp2(e.target.value); setErr('') }} style={{ ...IS(T), marginBottom: 20 }} />
    <button onClick={doSetNewPw} style={{ ...BT(T.acc), width: '100%', padding: '11px' }}>Set Password &amp; Continue</button>
  </>)

  // ── Google SSO registration screen ─────────────────────────────────────────
  if (screen === 'register') return card(<>
    <div style={{ marginBottom: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>👋</div>
      <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: 22 }}>Create Your Account</h2>
      <p style={{ color: T.t2, fontSize: 13, marginTop: 6 }}>
        Signed in as <strong style={{ color: T.acc }}>{regEmail}</strong>
      </p>
    </div>
    <ErrBox msg={regErr} />
    <label style={{ color: T.t2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>YOUR NAME</label>
    <input placeholder="Full name" value={regName}
      onChange={e => { setRegName(e.target.value); setRegErr('') }}
      style={{ ...IS(T), marginBottom: 10 }} autoFocus />
    <input type="password" placeholder="Set a password (optional — leave blank to set later)"
      value={regPw} onChange={e => { setRegPw(e.target.value); setRegErr('') }}
      style={{ ...IS(T), marginBottom: 20 }} />
    <p style={{ color: T.t3, fontSize: 11, marginTop: -16, marginBottom: 14 }}>
      If no password is set, you'll be prompted to create one on next email login.
    </p>
    <button onClick={doRegister} style={{ ...BT(T.acc), width: '100%', padding: '11px', marginBottom: 10 }}>
      Join Daylighting
    </button>
    <button onClick={() => setScreen('signin')} style={{ ...GH(T), width: '100%', padding: '10px', fontSize: 13 }}>
      Back to Sign In
    </button>
  </>)

  // ── Manual sign-up screen ──────────────────────────────────────────────────
  if (screen === 'signup') return card(<>
    <div style={{ marginBottom: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 44, marginBottom: 10 }}>⚡</div>
      <h1 className="fh-fraunces" style={{ color: T.t1, fontSize: 28, letterSpacing: -0.5 }}>Create Account</h1>
      <p style={{ color: T.t2, fontSize: 13, marginTop: 4 }}>Join your team on Daylighting</p>
    </div>
    <ErrBox msg={suErr} />
    <input placeholder="Full name" value={suName}
      onChange={e => { setSuName(e.target.value); setSuErr('') }} style={{ ...IS(T), marginBottom: 10 }} autoFocus />
    <input placeholder="Email address" type="email" value={suEmail}
      onChange={e => { setSuEmail(e.target.value); setSuErr('') }} style={{ ...IS(T), marginBottom: 10 }} />
    <input placeholder="Password (min 6 chars)" type="password" value={suPw}
      onChange={e => { setSuPw(e.target.value); setSuErr('') }} style={{ ...IS(T), marginBottom: 10 }} />
    <input placeholder="Confirm password" type="password" value={suPw2}
      onChange={e => { setSuPw2(e.target.value); setSuErr('') }}
      onKeyDown={e => e.key === 'Enter' && doSignup()}
      style={{ ...IS(T), marginBottom: 20 }} />
    <button onClick={doSignup} style={{ ...BT(T.acc), width: '100%', padding: '11px', marginBottom: 10, fontSize: 14 }}>
      Create Account
    </button>
    <button onClick={googleSSO} disabled={ssoLoading} style={{
      ...GH(T), width: '100%', padding: '11px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14,
      opacity: ssoLoading ? 0.6 : 1, cursor: ssoLoading ? 'wait' : 'pointer', marginBottom: 16
    }}>
      <span>🔑</span> {ssoLoading ? 'Signing in...' : 'Sign up with Google'}
    </button>
    <div style={{ textAlign: 'center' }}>
      <span style={{ color: T.t2, fontSize: 13 }}>Already have an account? </span>
      <button onClick={() => openModal('signin')} style={{
        background: 'none', border: 'none',
        color: T.acc, cursor: 'pointer', fontSize: 13, fontWeight: 600
      }}>Sign In</button>
    </div>
  </>)

  // ── Main sign-in screen ────────────────────────────────────────────────────
  return card(<>
    <div style={{ marginBottom: 28, textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        <BrandLogo size={48} radius={14} />
      </div>
      <h1 className="fh-fraunces" style={{ color: T.t1, fontSize: 26, letterSpacing: -0.5 }}>Sign In</h1>
      <p style={{ color: T.t2, fontSize: 13, marginTop: 4 }}>Welcome back to Daylighting</p>
    </div>
    {dbLoadError && <div style={{ background: `${T.yl}15`, border: `1px solid ${T.yl}44`, borderRadius: 8, padding: '10px 14px', color: T.yl, fontSize: 13, marginBottom: 14 }}>
      {getDbErrorMessage(dbLoadError)}
    </div>}
    <ErrBox msg={err} />
    <input placeholder="Email address" type="email" value={email}
      onChange={e => { setEmail(e.target.value); setErr('') }} style={{ ...IS(T), marginBottom: 10 }} autoFocus />
    <input placeholder="Password" type="password" value={pw}
      onChange={e => { setPw(e.target.value); setErr('') }}
      onKeyDown={e => e.key === 'Enter' && doLogin()}
      style={{ ...IS(T), marginBottom: 8 }} />
    <div style={{ textAlign: 'right', marginBottom: 14 }}>
      <button onClick={() => { setScreen('forgotpw'); setFpEmail(email); clearErr() }}
        style={{ background: 'none', border: 'none', color: T.acc, cursor: 'pointer', fontSize: 12 }}>
        Forgot password?
      </button>
    </div>
    <button onClick={doLogin} style={{ ...BT(T.acc), width: '100%', padding: '11px', marginBottom: 10, fontSize: 14 }}>
      Sign In
    </button>
    <button onClick={googleSSO} disabled={ssoLoading} style={{
      ...GH(T), width: '100%', padding: '11px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14,
      opacity: ssoLoading ? 0.6 : 1, cursor: ssoLoading ? 'wait' : 'pointer', marginBottom: 16
    }}>
      <span>🔑</span> {ssoLoading ? 'Signing in...' : 'Continue with Google (SSO)'}
    </button>
    <div style={{ textAlign: 'center' }}>
      <span style={{ color: T.t2, fontSize: 13 }}>Don't have an account? </span>
      <button onClick={() => openModal('signup')} style={{
        background: 'none', border: 'none',
        color: T.acc, cursor: 'pointer', fontSize: 13, fontWeight: 600
      }}>Sign Up</button>
    </div>
  </>)
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'overview', icon: 'home', label: 'Overview' },
  { id: 'private', icon: 'lock', label: 'My Tasks' },
  { id: 'group', icon: 'meet', label: 'Group Board' },
  { id: 'public', icon: 'globe', label: 'Public Board' },
  { id: 'all', icon: 'task', label: 'All Tasks' },
  { id: 'archive', icon: 'files', label: 'Archive' },
  { id: 'chat', icon: 'chat', label: 'Team Chat' },
  { id: 'meetings', icon: 'timer', label: 'Meetings' },
  { id: 'calendar', icon: 'sun', label: 'Calendar' },
  { id: 'awards', icon: 'award', label: 'Awards' },
  { id: 'rewards', icon: 'award', label: 'Peer Rewards' },
  { id: 'timelog', icon: 'timer', label: 'Time Log' },
  { id: 'jobboard', icon: 'briefcase', label: 'Job Board' },
  { id: 'whiteboard', icon: 'pen', label: 'Whiteboard' },
  { id: 'deleteddash', icon: 'trash', label: 'Deleted' },
  { id: 'files', icon: 'files', label: 'File Storage' },
  { id: 'profile', icon: 'user', label: 'My Profile' },
  { id: 'admin', icon: 'admin', label: 'Admin Panel' },
]

function Sidebar({ page, setPage, user, onHamburger }) {
  const { T, bp } = useT()
  const isAdmin = user?.role === 'admin'
  const navItems = NAV.filter(n => n.id !== 'admin' || isAdmin)

  // ── Tablet: icon-only collapsed strip ────────────────────────────────────
  if (bp === 'tablet') return (
    <div style={{
      width: 62, background: T.bg2, borderRight: `1px solid ${T.brd}`,
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      height: '100vh', overflowY: 'auto', overflowX: 'hidden',
      alignItems: 'center', paddingTop: 10, paddingBottom: 10,
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${T.brd}`, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <BrandLogo size={34} radius={10} />
      </div>
      {navItems.map(n => (
        <button key={n.id} onClick={() => setPage(n.id)} title={n.label} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 42, height: 42, borderRadius: 11, border: 'none', cursor: 'pointer',
          marginBottom: 3, background: page === n.id ? `${T.acc}1a` : 'transparent',
          color: page === n.id ? T.acc : T.t2,
          transition: 'background 0.15s',
        }}>
          <I n={n.icon} size={18} color={page === n.id ? T.acc : T.t2} />
        </button>
      ))}
      {/* Avatar at bottom */}
      <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: `1px solid ${T.brd}`, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <button onClick={() => setPage('profile')} title="My Profile" style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
          borderRadius: '50%', outline: page === 'profile' ? `2px solid ${T.acc}` : 'none',
        }}>
          <Av member={user} size={32} />
        </button>
      </div>
    </div>
  )

  // ── Mobile: null — navigation handled by bottom nav + drawer ─────────────
  if (bp === 'mobile') return null

  // ── Desktop: full sidebar ─────────────────────────────────────────────────
  return (
    <div style={{
      width: 218, background: T.bg2, borderRight: `1px solid ${T.brd}`,
      display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100vh', overflowY: 'auto'
    }}>
      <div style={{ padding: '22px 18px 14px', borderBottom: `1px solid ${T.brd}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BrandLogo size={34} radius={10} />
          <span className="fh-fraunces" style={{ color: T.t1, fontSize: 20, fontWeight: 700 }}>Daylighting</span>
        </div>
        <div style={{ color: T.t3, fontSize: 11, marginTop: 4, marginLeft: 44 }}>Team Dashboard</div>
      </div>
      <nav style={{ flex: 1, padding: '10px 8px' }}>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setPage(n.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '9px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
            marginBottom: 2, textAlign: 'left',
            background: page === n.id ? `${T.acc}1a` : 'transparent',
            color: page === n.id ? T.acc : T.t2,
            fontWeight: page === n.id ? 600 : 400, fontSize: 13,
            transition: 'background 0.15s, color 0.15s'
          }}>
            <I n={n.icon} size={16} color={page === n.id ? T.acc : T.t2} />
            {n.label}
          </button>
        ))}
      </nav>
      <div style={{ padding: '14px 14px 22px', borderTop: `1px solid ${T.brd}` }}>
        <button onClick={() => setPage('profile')} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: page === 'profile' ? `${T.acc}1a` : 'transparent', border: `1px solid ${page === 'profile' ? T.acc : T.brd}`, borderRadius: 10, padding: '8px 10px', cursor: 'pointer', transition: 'all 0.15s' }}>
          <Av member={user} size={34} />
          <div style={{ overflow: 'hidden', flex: 1, textAlign: 'left' }}>
            <div style={{ color: T.t1, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
            <div style={{ color: T.t3, fontSize: 11, textTransform: 'capitalize' }}>{user?.role} · ✏️ Edit Profile</div>
          </div>
        </button>
      </div>
    </div>
  )
}

// ── Mobile Drawer ─────────────────────────────────────────────────────────────
// Full-screen nav overlay for mobile. Opens when hamburger is tapped.
function MobileDrawer({ page, setPage, user, onClose }) {
  const { T } = useT()
  const isAdmin = user?.role === 'admin'
  const navItems = NAV.filter(n => n.id !== 'admin' || isAdmin)

  const go = (id) => { setPage(id); onClose() }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1200,
      display: 'flex',
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
      }} />
      {/* Drawer panel */}
      <div style={{
        position: 'relative', width: 260, background: T.bg2,
        borderRight: `1px solid ${T.brd}`,
        display: 'flex', flexDirection: 'column', height: '100%',
        overflowY: 'auto', boxShadow: `4px 0 32px rgba(0,0,0,0.4)`,
        animation: 'slideInLeft 0.22s cubic-bezier(0.22,1,0.36,1)',
      }}>
        <style>{`@keyframes slideInLeft{from{transform:translateX(-100%)}to{transform:translateX(0)}}`}</style>
        {/* Header */}
        <div style={{ padding: '20px 18px 14px', borderBottom: `1px solid ${T.brd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BrandLogo size={32} radius={10} />
            <span className="fh-fraunces" style={{ color: T.t1, fontSize: 18, fontWeight: 700 }}>Daylighting</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.t2, cursor: 'pointer' }}>
            <I n="x" size={18} />
          </button>
        </div>
        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          {navItems.map(n => (
            <button key={n.id} onClick={() => go(n.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              padding: '11px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
              marginBottom: 3, textAlign: 'left',
              background: page === n.id ? `${T.acc}1a` : 'transparent',
              color: page === n.id ? T.acc : T.t2,
              fontWeight: page === n.id ? 600 : 400, fontSize: 14,
            }}>
              <I n={n.icon} size={18} color={page === n.id ? T.acc : T.t2} />
              {n.label}
            </button>
          ))}
        </nav>
        {/* User card */}
        <div style={{ padding: '14px 14px 20px', borderTop: `1px solid ${T.brd}` }}>
          <button onClick={() => go('profile')} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            background: page === 'profile' ? `${T.acc}1a` : 'transparent',
            border: `1px solid ${page === 'profile' ? T.acc : T.brd}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer'
          }}>
            <Av member={user} size={36} />
            <div style={{ overflow: 'hidden', flex: 1, textAlign: 'left' }}>
              <div style={{ color: T.t1, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
              <div style={{ color: T.t3, fontSize: 11, textTransform: 'capitalize' }}>{user?.role}</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Mobile Bottom Navigation ──────────────────────────────────────────────────
// Fixed bottom bar on phones — 5 slots: 4 quick pages + hamburger for full menu.
const BOTTOM_NAV = [
  { id: 'overview', icon: 'home', label: 'Home' },
  { id: 'private', icon: 'lock', label: 'Tasks' },
  { id: 'group', icon: 'meet', label: 'Group' },
  { id: 'chat', icon: 'chat', label: 'Chat' },
]
function MobileBottomNav({ page, setPage, user, onHamburger }) {
  const { T } = useT()
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1100,
      height: 60, background: T.bg2, borderTop: `1px solid ${T.brd}`,
      display: 'flex', alignItems: 'stretch',
      boxShadow: `0 -4px 20px rgba(0,0,0,0.18)`,
    }}>
      {BOTTOM_NAV.map(n => {
        const active = page === n.id
        return (
          <button key={n.id} onClick={() => setPage(n.id)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 3, background: 'none', border: 'none',
            cursor: 'pointer', color: active ? T.acc : T.t2, padding: '4px 0',
          }}>
            <I n={n.icon} size={20} color={active ? T.acc : T.t2} />
            <span style={{
              fontSize: 10, fontWeight: active ? 700 : 400, color: active ? T.acc : T.t2,
              fontFamily: "'Plus Jakarta Sans',sans-serif"
            }}>{n.label}</span>
            {active && <div style={{
              position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
              width: 24, height: 2, borderRadius: 2, background: T.acc
            }} />}
          </button>
        )
      })}
      {/* Hamburger — opens full drawer */}
      <button onClick={onHamburger} style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer',
        color: T.t1,
      }}>
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={T.t1} strokeWidth={2} strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>More</span>
      </button>
    </div>
  )
}

// ── Toast notification banner ─────────────────────────────────────────────────
function Toast({ notification, onDismiss, onNavigate }) {
  const { T, bp } = useT()
  const [visible, setVisible] = useState(false)
  const isMobile = bp === 'mobile'
  const typeIcon = NOTIF_ICONS[notification?.type] || '🔔'

  useEffect(() => {
    if (!notification) return
    setVisible(true)
    const t = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 300) }, 5000)
    return () => clearTimeout(t)
  }, [notification?.id])

  if (!notification) return null
  return (
    <div onClick={() => { setVisible(false); setTimeout(onDismiss, 200); onNavigate(notification) }}
      style={{
        position: 'fixed',
        bottom: isMobile ? 72 : 24,   // above bottom nav on mobile
        right: isMobile ? 12 : 24,
        left: isMobile ? 12 : 'auto',
        zIndex: 9999,
        background: T.bg2, border: `1px solid ${T.acc}66`,
        borderLeft: `4px solid ${T.acc}`, borderRadius: 12,
        padding: '12px 16px', maxWidth: isMobile ? 'none' : 320, cursor: 'pointer',
        boxShadow: `0 8px 32px ${T.shadow}`,
        display: 'flex', gap: 12, alignItems: 'flex-start',
        transform: visible ? 'translateY(0)' : `translateY(${isMobile ? 120 : 0}px) translateX(${isMobile ? 0 : 380}px)`,
        opacity: visible ? 1 : 0,
        transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s'
      }}>
      <span style={{ fontSize: 22, flexShrink: 0 }}>{typeIcon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: T.t1, fontWeight: 700, fontSize: 13 }}>{notification.title}</div>
        <div style={{ color: T.t2, fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notification.body}</div>
        <div style={{ color: T.t3, fontSize: 10, marginTop: 3 }}>Tap to view →</div>
      </div>
      <button onClick={e => { e.stopPropagation(); setVisible(false); setTimeout(onDismiss, 200) }}
        style={{ background: 'none', border: 'none', color: T.t3, cursor: 'pointer', padding: 2, flexShrink: 0 }}>
        <I n="x" size={13} />
      </button>
    </div>
  )
}

// ── NotificationBell ──────────────────────────────────────────────────────────
const NOTIF_ICONS = {
  task_assigned: '📋', task_updated: '✏️', task_comment: '💬',
  meeting: '📅', reward: '⭐', productivity_alert: '⚠️', calendar: '🗓️', default: '🔔'
}

function NotificationBell({ notifications, userId, onRead, onReadAll, onDelete, onNavigate }) {
  const { T } = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef()

  const mine = (notifications || [])
    .filter(n => n.userId === userId)
    .sort((a, b) => b.created - a.created)
    .slice(0, 40)
  const unread = mine.filter(n => !n.read).length

  // Close on outside click
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
        color: unread > 0 ? T.acc : T.t2, padding: '4px', lineHeight: 1
      }}>
        <I n="zap" size={17} color={unread > 0 ? T.acc : T.t2} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -3,
            background: T.red, color: '#fff', borderRadius: '50%',
            width: 15, height: 15, fontSize: 9, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `2px solid ${T.bg2}`
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 36, right: 0, width: 340,
          background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14,
          boxShadow: `0 16px 48px ${T.shadow}`, zIndex: 900, overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: `1px solid ${T.brd}`
          }}>
            <span style={{ color: T.t1, fontWeight: 700, fontSize: 14 }}>
              🔔 Notifications {unread > 0 && <span style={{ color: T.acc }}>({unread})</span>}
            </span>
            {unread > 0 && (
              <button onClick={() => { onReadAll(); }} style={{
                background: 'none', border: 'none', color: T.acc, cursor: 'pointer', fontSize: 12
              }}>Mark all read</button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {mine.length === 0 && (
              <div style={{ padding: '40px 0', textAlign: 'center', color: T.t3, fontSize: 13 }}>
                No notifications yet
              </div>
            )}
            {mine.map(n => (
              <div key={n.id} onClick={() => {
                onRead(n.id)
                setOpen(false)
                if (onNavigate) {
                  // Route to the right page based on notification type + task type
                  if (['task_assigned', 'task_updated', 'task_comment'].includes(n.type)) {
                    if (n.taskType === 'group') onNavigate('group')
                    else if (n.taskType === 'public') onNavigate('public')
                    else onNavigate('private')
                  } else if (n.type === 'meeting') onNavigate('meetings')
                  else if (n.type === 'reward') onNavigate('rewards')
                  else if (n.type === 'productivity_alert') onNavigate('timelog')
                  else if (n.type === 'calendar') onNavigate('calendar')
                }
              }} style={{
                display: 'flex', gap: 10, padding: '11px 14px', cursor: 'pointer',
                background: n.read ? 'transparent' : `${T.acc}0d`,
                borderBottom: `1px solid ${T.brd}`,
                transition: 'background 0.12s'
              }}
                onMouseEnter={e => e.currentTarget.style.background = T.bg3}
                onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : `${T.acc}0d`}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{NOTIF_ICONS[n.type] || NOTIF_ICONS.default}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    color: n.read ? T.t2 : T.t1, fontSize: 13, fontWeight: n.read ? 400 : 600,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                  }}>{n.title}</div>
                  <div style={{
                    color: T.t3, fontSize: 11, marginTop: 2, whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis'
                  }}>{n.body}</div>
                  <div style={{ color: T.t3, fontSize: 10, marginTop: 3 }}>
                    {new Date(n.created).toLocaleString()}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); onDelete(n.id) }}
                  style={{
                    background: 'none', border: 'none', color: T.t3, cursor: 'pointer',
                    padding: '2px', alignSelf: 'flex-start', flexShrink: 0
                  }}>
                  <I n="x" size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── TopBar ────────────────────────────────────────────────────────────────────
function TopBar({ page, user, onlineTime, timerMode, onBreak, setOnBreak, dark, setDark, onQuickAdd, onLogout, notifications, onNotifRead, onNotifReadAll, onNotifDelete, onNavigate, onHamburger }) {
  const { T, bp } = useT()
  const [showQA, setShowQA] = useState(false)
  const isMobile = bp === 'mobile'
  const isTablet = bp === 'tablet'
  const label = NAV.find(n => n.id === page)?.label || 'Daylighting'

  return (
    <>
      <div style={{
        height: isMobile ? 52 : 58,
        background: T.bg2, borderBottom: `1px solid ${T.brd}`,
        display: 'flex', alignItems: 'center',
        padding: isMobile ? '0 12px' : '0 22px',
        gap: isMobile ? 8 : 12, flexShrink: 0
      }}>
        {/* Hamburger — mobile only */}
        {isMobile && (
          <button onClick={onHamburger} style={{
            background: T.bg3, border: `1px solid ${T.brd}`, color: T.t1, cursor: 'pointer',
            padding: '7px', lineHeight: 1, flexShrink: 0, borderRadius: 8
          }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={T.t1} strokeWidth={2} strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}

        <h2 className="fh-fraunces" style={{
          color: T.t1, fontSize: isMobile ? 16 : 19, flex: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>{label}</h2>

        {/* Online timer — hidden on mobile to save space */}
        {!isMobile && (() => {
          const modeColor = timerMode === 'task' ? T.grn : timerMode === 'break' ? T.yl : (T.red || '#f85149')
          const modeLabel = timerMode === 'task' ? 'Working' : timerMode === 'break' ? 'Break' : 'No Task'
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: T.bg3, border: `1px solid ${modeColor}44`, borderRadius: 8, padding: '5px 11px' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: modeColor, flexShrink: 0 }} />
              <span style={{ color: modeColor, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtS(onlineTime)}</span>
              <span style={{ color: T.t3, fontSize: 10 }}>{modeLabel}</span>
            </div>
          )
        })()}

        {/* Break button */}
        <button onClick={() => setOnBreak(b => !b)} style={{
          ...GH(T, onBreak ? T.yl : T.t2),
          display: 'flex', alignItems: 'center', gap: isMobile ? 0 : 5,
          padding: isMobile ? '6px 8px' : '6px 14px',
          fontSize: 12,
          background: onBreak ? `${T.yl}1a` : 'transparent',
          borderColor: onBreak ? T.yl : T.brd
        }}>
          <I n="coffee" size={13} color={onBreak ? T.yl : T.t2} />
          {!isMobile && (onBreak ? 'On Break' : 'Break')}
        </button>

        {/* Quick Add */}
        <button onClick={() => setShowQA(true)} style={{
          ...BT(T.acc),
          display: 'flex', alignItems: 'center',
          gap: isMobile ? 0 : 5,
          padding: isMobile ? '6px 10px' : '8px 16px',
        }}>
          <I n="plus" size={13} />
          {!isMobile && 'Quick Add'}
        </button>

        {/* Notification Bell */}
        <NotificationBell notifications={notifications} userId={user?.id}
          onRead={onNotifRead} onReadAll={onNotifReadAll} onDelete={onNotifDelete}
          onNavigate={onNavigate} />

        {/* Dark/Light */}
        <button onClick={() => setDark(d => !d)} style={{ background: 'none', border: 'none', color: T.t2, cursor: 'pointer', lineHeight: 1 }}>
          <I n={dark ? 'sun' : 'moon'} size={17} />
        </button>

        {/* Logout — icon only on mobile */}
        <button onClick={onLogout} style={{
          ...GH(T),
          display: 'flex', alignItems: 'center',
          gap: isMobile ? 0 : 5,
          padding: isMobile ? '6px 8px' : '6px 14px',
          fontSize: 12
        }}>
          <I n="logout" size={13} />
          {!isMobile && 'Out'}
        </button>
      </div>
      {showQA && <QuickAddTask onClose={() => setShowQA(false)} user={user} onAdd={onQuickAdd} />}
    </>
  )
}

// ── QuickAddTask ──────────────────────────────────────────────────────────────
function QuickAddTask({ onClose, user, onAdd }) {
  const { T } = useT()
  const [title, setTitle] = useState('')
  const [type, setType] = useState('private')
  const [priority, setPriority] = useState('med')

  const submit = () => {
    if (!title.trim()) return
    onAdd({
      id: uid(), title: title.trim(), desc: '', status: 'todo', type, priority,
      assignee: user.id, creator: user.id, created: Date.now(), tags: []
    })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Quick Add Task" width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input
          placeholder="What needs doing…" value={title}
          onChange={e => setTitle(e.target.value)} style={IS(T)} autoFocus
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <select value={type} onChange={e => setType(e.target.value)} style={IS(T)}>
            <option value="private">🔒 Private</option>
            <option value="group">👥 Group</option>
            <option value="public">🌐 Public</option>
          </select>
          <select value={priority} onChange={e => setPriority(e.target.value)} style={IS(T)}>
            <option value="high">🔴 High</option>
            <option value="med">🟡 Medium</option>
            <option value="low">🟢 Low</option>
          </select>
        </div>
        <button onClick={submit} style={{ ...BT(T.acc), width: '100%', padding: '10px' }}>
          Add Task
        </button>
      </div>
    </Modal>
  )
}

const P_COLOR = { high: '#f85149', med: '#d29922', low: '#3fb950' }
const P_BG = { high: '#f8514918', med: '#d2992218', low: '#3fb95018' }
const P_RANK = { high: 0, med: 1, low: 2 }
const STATUS_LABEL = { idea: 'Idea', todo: 'To Do', inprogress: 'In Progress', review: 'In Review', done: 'Done' }
const STATUS_COLOR = { idea: '#a371f7', todo: '#8b949e', inprogress: '#d29922', review: '#58a6ff', done: '#3fb950' }
const CYCLE = ['idea', 'todo', 'inprogress', 'review', 'done']
const taskRequiresReview = task => task?.reviewRequired === true || (task?.reviewRequired === undefined && (task?.reviewers || []).length > 0)
// Story Points — Fibonacci. 1 SP = 0.5 hours
const STORY_POINTS = [0, 1, 2, 3, 5, 8, 13, 21]
const SP_HOURS = sp => sp / 2
const canMoveTask = (task, user) => {
  const hasReviewers = (task.reviewers || []).length > 0
  if (task.type === 'group' || user?.role === 'admin') return true
  return hasReviewers
    ? task.assignee === user?.id || (task.reviewers || []).includes(user?.id)
    : task.creator === user?.id || task.createdBy === user?.id
}

function TaskComments({ task, user, members, onSave }) {
  const { T } = useT()
  const [text, setText] = useState('')
  const comments = task.comments || []

  const addComment = () => {
    if (!text.trim()) return
    const updated = { ...task, comments: [...comments, { id: uid(), userId: user.id, text: text.trim(), time: Date.now() }] }
    onSave(updated)
    setText('')
  }

  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${T.brd}`, paddingTop: 10 }}>
      {comments.map(c => {
        const author = members.find(m => m.id === c.userId)
        return (
          <div key={c.id} style={{ display: 'flex', gap: 7, marginBottom: 8 }}>
            <Av member={author} size={22} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                <span style={{ color: T.t1, fontSize: 11, fontWeight: 600 }}>{author?.name?.split(' ')[0] || '?'}</span>
                <span style={{ color: T.t3, fontSize: 10 }}>{new Date(c.time).toLocaleDateString()}</span>
              </div>
              <div style={{
                color: T.t2, fontSize: 12, lineHeight: 1.4, background: T.bg3,
                borderRadius: 7, padding: '5px 9px'
              }}>{c.text}</div>
            </div>
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Add comment…"
          onKeyDown={e => e.key === 'Enter' && addComment()}
          style={{ ...IS(T), fontSize: 12, padding: '5px 9px', flex: 1 }} />
        <button onClick={addComment} style={{ ...BT(T.acc), fontSize: 11, padding: '5px 11px' }}>Send</button>
      </div>
    </div>
  )
}

function TaskCard({ task, members, onEdit, onDelete, onStatusChange, user, onSaveTask, onOpenCollab, taskNoteData, allTasks, onAdd, onApprove, onArchive, onToggleTimer, onDragStartTask, onDragEndTask, isDragging }) {
  const { T } = useT()
  const [expanded, setExpanded] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [showSubTasks, setShowSubTasks] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showAddSub, setShowAddSub] = useState(false)
  const [subTitle, setSubTitle] = useState('')

  const isRunning = task.timerState === 'running'
  const isPaused = task.timerState === 'paused'
  const timerCountsAsRunning = isRunning && task.status !== 'done' && task.status !== 'review'
  const maxPauses = Math.max(1, Math.floor((task.storyPoints || 0) / 2))
  const currentPauses = task.pauseCount || 0
  const canPause = currentPauses < maxPauses
  const canStartTimer = user?.id === task.assignee

  const [activeElapsed, setActiveElapsed] = useState(0)
  useEffect(() => {
    if (!timerCountsAsRunning) { setActiveElapsed(0); return }
    const id = setInterval(() => {
      setActiveElapsed(Math.floor((Date.now() - (task.lastStartedAt || Date.now())) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [timerCountsAsRunning, task.lastStartedAt])

  const totalSecs = (task.accumulatedTime || 0) + (timerCountsAsRunning ? activeElapsed : 0)
  const timerText = totalSecs > 0 ? fmtS(totalSecs) : '00:00:00'

  const assignee = members.find(m => m.id === task.assignee)
  const needsReview = taskRequiresReview(task)
  const nextSt = task.status === 'inprogress' && !needsReview
    ? 'done'
    : CYCLE[(CYCLE.indexOf(task.status) + 1) % CYCLE.length]
  const isGroupTask = task.type === 'group'
  // Group tasks are open to all team members; private/public tasks restrict by reviewer assignment
  const canEdit = canMoveTask(task, user)
  // Archive: group tasks open to all; otherwise only the assignee
  const canArchive = isGroupTask || task.assignee === user?.id
  const commentCount = (task.comments || []).length
  const hasNote = !!(taskNoteData?.content || taskNoteData?.sections?.length)
  const subTasks = (allTasks || []).filter(t => t.parentId === task.id)
  const approvals = task.approvals || []
  const hasApproved = approvals.includes(user?.id)
  const isInReview = task.status === 'review'
  const isDone = task.status === 'done'
  const history = task.history || []

  const addSubTask = () => {
    if (!subTitle.trim()) return
    const payload = {
      id: uid(), title: subTitle.trim(), desc: '', status: 'todo',
      creator: user?.id, createdBy: user?.id,
      created: Date.now(), tags: [], parentId: task.id
    }
    if (task.type) payload.type = task.type
    if (task.priority) payload.priority = task.priority
    if (task.assignee) payload.assignee = task.assignee
    if (task.groupId) payload.groupId = task.groupId

    onAdd && onAdd(payload)
    setSubTitle(''); setShowAddSub(false); setShowSubTasks(true)
  }

  const borderColor = isInReview ? T.acc + '66' : isDone ? T.grn + '44' : T.brd

  /* ── COLLAPSED ─────────────────────────────────────────────────── */
  if (!expanded) return (
    <div
      draggable={canEdit}
      onDragStart={e => canEdit && onDragStartTask?.(e, task)}
      onDragEnd={onDragEndTask}
      onClick={() => setExpanded(true)}
      title={canEdit ? 'Drag to move this task to another section' : undefined}
      style={{
      background: T.bg2, border: `1px solid ${borderColor}`, borderRadius: 12,
      padding: '9px 13px', marginBottom: 9, cursor: canEdit ? 'grab' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      opacity: isDragging ? 0.45 : 1,
      transform: isDragging ? 'scale(0.99)' : 'none',
      transition: 'opacity 0.15s ease, transform 0.15s ease, border-color 0.15s ease'
    }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <span style={{ color: T.t1, fontWeight: 600, fontSize: 13 }}>{task.title}</span>
        {task.category && (
          <span style={{
            background: `${T.acc}15`, color: T.acc, fontSize: 10, fontWeight: 600,
            padding: '1px 7px', borderRadius: 20, border: `1px solid ${T.acc}30`
          }}>
            {task.category}
          </span>
        )}
        {totalSecs > 0 && (
          <span style={{ color: isRunning ? T.grn : T.t3, fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {isRunning ? '▶' : '⏸'} {timerText}
          </span>
        )}
        <span style={{
          background: `${STATUS_COLOR[task.status] || '#8b949e'}18`,
          border: `1px solid ${STATUS_COLOR[task.status] || '#8b949e'}44`,
          borderRadius: 5, padding: '1px 6px', color: STATUS_COLOR[task.status] || T.t2,
          fontSize: 10, fontWeight: 600
        }}>
          {STATUS_LABEL[task.status] || task.status}
        </span>
        {subTasks.length > 0 && <span style={{ color: T.t3, fontSize: 10 }}>⊞ {subTasks.filter(t => t.status === 'done').length}/{subTasks.length}</span>}
        {commentCount > 0 && <span style={{ color: T.acc, fontSize: 10 }}>💬 {commentCount}</span>}
        {needsReview && <span style={{ color: T.acc, fontSize: 10 }}>🔍 Review</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {assignee && <Av member={assignee} size={24} />}
        <span style={{ color: T.t3, fontSize: 12 }}>›</span>
      </div>
    </div>
  )

  /* ── EXPANDED ──────────────────────────────────────────────────── */
  return (
    <div
      draggable={canEdit}
      onDragStart={e => canEdit && onDragStartTask?.(e, task)}
      onDragEnd={onDragEndTask}
      title={canEdit ? 'Drag to move this task to another section' : undefined}
      style={{
        background: T.bg2, border: `1px solid ${borderColor}`, borderRadius: 12,
        padding: 14, marginBottom: 9, cursor: canEdit ? 'grab' : 'default',
        opacity: isDragging ? 0.45 : 1,
        transform: isDragging ? 'scale(0.99)' : 'none',
        transition: 'opacity 0.15s ease, transform 0.15s ease, border-color 0.15s ease'
      }}>
      <div onClick={() => setExpanded(false)} style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 8, marginBottom: 8, cursor: 'pointer', userSelect: 'none'
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: T.t1, fontWeight: 600, fontSize: 13, lineHeight: 1.45 }}>{task.title}</span>
          {task.category && (
            <span style={{
              marginLeft: 7, background: `${T.acc}15`, color: T.acc, fontSize: 10,
              fontWeight: 600, padding: '1px 7px', borderRadius: 20,
              border: `1px solid ${T.acc}30`, verticalAlign: 'middle'
            }}>
              {task.category}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
          {canEdit && <>
            <button onClick={e => { e.stopPropagation(); onEdit && onEdit(task) }} style={{ background: 'none', border: 'none', color: T.t3, cursor: 'pointer', padding: '2px 3px' }}><I n="edit" size={13} /></button>
            <button onClick={e => { e.stopPropagation(); onDelete && onDelete(task.id) }} style={{ background: 'none', border: 'none', color: T.t3, cursor: 'pointer', padding: '2px 3px' }}><I n="trash" size={13} /></button>
          </>}
          <span style={{ color: T.t3, fontSize: 13 }}>‹</span>
        </div>
      </div>

      {task.desc && <p style={{ color: T.t2, fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>{task.desc}</p>}

      {task.storyPoints > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
          <span style={{
            background: `${T.acc}18`, color: T.acc, border: `1px solid ${T.acc}33`,
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5
          }}>SP {task.storyPoints}</span>
          <span style={{ color: T.t3, fontSize: 10 }}>{SP_HOURS(task.storyPoints)}h est.</span>
        </div>
      )}

      {/* Timer Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '8px 12px', background: T.bg3, borderRadius: 8, border: `1px solid ${T.brd}` }}>
        <div style={{ flex: 1, color: isRunning ? T.grn : T.t1, fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
          {timerCountsAsRunning ? '▶ ' : '⏸ '}
          {timerText}
        </div>
        {canStartTimer && !isDone && !isInReview && <div style={{ display: 'flex', gap: 6 }}>
          {timerCountsAsRunning ? (
            <button onClick={e => { e.stopPropagation(); onToggleTimer(task.id) }} style={{
              background: canPause ? `${T.yl}22` : `${T.red || '#f85149'}22`,
              color: canPause ? T.yl : (T.red || '#f85149'),
              border: `1px solid ${canPause ? T.yl : (T.red || '#f85149')}55`,
              borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer'
            }}>{canPause ? `Pause (${maxPauses - currentPauses} left)` : 'Stop'}</button>
          ) : (
            <button onClick={e => { e.stopPropagation(); onToggleTimer(task.id) }} disabled={task.status === 'done' || isInReview} style={{
              background: (task.status === 'done' || isInReview) ? `${T.brd}55` : `${T.grn}22`,
              color: (task.status === 'done' || isInReview) ? T.t3 : T.grn,
              border: `1px solid ${(task.status === 'done' || isInReview) ? T.brd : T.grn}55`,
              borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700,
              cursor: (task.status === 'done' || isInReview) ? 'not-allowed' : 'pointer'
            }}>{isInReview ? 'In Review' : 'Start'}</button>
          )}
        </div>}
      </div>

      {isInReview && (
        <div style={{ background: `${T.acc}0d`, border: `1px solid ${T.acc}33`, borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <span style={{ color: T.acc, fontSize: 12, fontWeight: 700 }}>🔍 In Review</span>
              <span style={{ color: T.t3, fontSize: 11, marginLeft: 8 }}>{approvals.length}/2 approvals</span>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {approvals.map(id => { const m = members.find(x => x.id === id); return m ? <Av key={id} member={m} size={18} /> : null })}
              </div>
            </div>
            {(task.reviewers || []).includes(user?.id) && (
              hasApproved
                ? <span style={{ color: T.grn, fontSize: 11, fontWeight: 600 }}>✓ You approved</span>
                : <button onClick={() => onApprove && onApprove(task.id)} style={{ ...BT(T.acc), fontSize: 11, padding: '5px 12px' }}>✓ Approve</button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5 }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            background: P_BG[task.priority], color: P_COLOR[task.priority],
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, textTransform: 'uppercase'
          }}>
            {task.priority}
          </span>
          <button onClick={() => canEdit && onStatusChange(task.id, nextSt)} style={{
            background: `${STATUS_COLOR[task.status] || '#8b949e'}18`,
            border: `1px solid ${STATUS_COLOR[task.status] || '#8b949e'}44`,
            borderRadius: 6, padding: '2px 8px', color: canEdit ? (STATUS_COLOR[task.status] || T.t2) : T.t3,
            fontSize: 11, cursor: canEdit ? 'pointer' : 'not-allowed', fontWeight: 600,
            opacity: canEdit ? 1 : 0.5
          }}>{STATUS_LABEL[task.status] || task.status}</button>
          {subTasks.length > 0 && (
            <button onClick={() => setShowSubTasks(s => !s)} style={{ background: 'none', border: 'none', color: T.t3, cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}>
              ⊞ {subTasks.filter(t => t.status === 'done').length}/{subTasks.length}
            </button>
          )}
          {canEdit && <button onClick={() => setShowAddSub(s => !s)} style={{ background: 'none', border: 'none', color: T.t3, cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}>↳+</button>}
          <button onClick={() => setShowComments(s => !s)} style={{
            background: 'none', border: 'none',
            color: commentCount > 0 ? T.acc : T.t3, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, padding: '2px 4px'
          }}>
            <I n="chat" size={11} /> {commentCount || ''}
          </button>
          <button onClick={() => onOpenCollab && onOpenCollab(task)} style={{
            background: hasNote ? `${T.acc}18` : 'none', border: hasNote ? `1px solid ${T.acc}44` : 'none',
            borderRadius: 6, color: hasNote ? T.acc : T.t3, cursor: 'pointer',
            fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px'
          }}>📄 {hasNote ? 'Doc' : ''}</button>
          {history.length > 0 && (
            <button onClick={() => setShowHistory(s => !s)} style={{ background: 'none', border: 'none', color: T.t3, cursor: 'pointer', fontSize: 10, padding: '2px 4px' }}>
              {showHistory ? '▲' : '▼'} Details
            </button>
          )}
        </div>
        {assignee && <Av member={assignee} size={22} />}
      </div>

      {isDone && canArchive && !task.archived && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.brd}` }}>
          <button onClick={() => onArchive && onArchive(task.id)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
            background: `${T.grn}12`, border: `1px solid ${T.grn}44`, borderRadius: 8,
            padding: '7px 12px', cursor: 'pointer', color: T.grn, fontSize: 12, fontWeight: 600,
            fontFamily: "'Plus Jakarta Sans', sans-serif"
          }}>📦 Move to Archive</button>
        </div>
      )}

      {showHistory && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.brd}` }}>
          <div style={{ color: T.t3, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>TRANSITION HISTORY</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {history.map((h, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: T.t3, fontSize: 10 }}>→</span>}
                <span style={{
                  background: `${STATUS_COLOR[h.to] || T.acc}18`, color: STATUS_COLOR[h.to] || T.acc,
                  fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4
                }}
                  title={`by ${h.byName || '?'} · ${new Date(h.at).toLocaleString()}`}>
                  {STATUS_LABEL[h.to] || h.to}
                </span>
              </React.Fragment>
            ))}
          </div>
          <div style={{ color: T.t3, fontSize: 10, marginTop: 6 }}>
            Created: {task.createdAt ? new Date(task.createdAt).toLocaleDateString() : '—'}
            {task.updatedAt && ` · Updated: ${new Date(task.updatedAt).toLocaleDateString()}`}
          </div>
          {history.slice(-3).reverse().map((h, i) => (
            <div key={i} style={{ color: T.t3, fontSize: 10, marginTop: 2 }}>
              {h.byName || '?'}: {STATUS_LABEL[h.from] || h.from || 'Created'} → {STATUS_LABEL[h.to] || h.to}
              {' · '}{new Date(h.at).toLocaleString()}{h.note && ` (${h.note})`}
            </div>
          ))}
        </div>
      )}

      {showAddSub && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.brd}` }}>
          <input value={subTitle} onChange={e => setSubTitle(e.target.value)} placeholder="Sub-task title…" autoFocus
            onKeyDown={e => { if (e.key === 'Enter') addSubTask(); if (e.key === 'Escape') setShowAddSub(false) }}
            style={{ ...IS(T), fontSize: 12, padding: '5px 9px', flex: 1 }} />
          <button onClick={addSubTask} style={{ ...BT(T.acc), fontSize: 11, padding: '5px 11px' }}>Add</button>
          <button onClick={() => setShowAddSub(false)} style={{ ...GH(T), fontSize: 11, padding: '5px 9px' }}>✕</button>
        </div>
      )}

      {showSubTasks && subTasks.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.brd}` }}>
          {subTasks.map(sub => {
            const isDoneSub = sub.status === 'done'
            return (
              <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, paddingLeft: 10, borderLeft: `2px solid ${T.brd}` }}>
                <button onClick={() => onStatusChange(sub.id, isDoneSub ? 'todo' : 'done')} style={{
                  width: 16, height: 16, borderRadius: 4, border: `2px solid ${isDoneSub ? T.grn : T.brd}`,
                  background: isDoneSub ? T.grn : 'transparent', cursor: 'pointer', flexShrink: 0, padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {isDoneSub && <span style={{ fontSize: 9, color: '#fff', lineHeight: 1, fontWeight: 700 }}>✓</span>}
                </button>
                <span style={{ color: isDoneSub ? T.t3 : T.t2, fontSize: 12, flex: 1, textDecoration: isDoneSub ? 'line-through' : 'none' }}>{sub.title}</span>
                {(user?.role === 'admin' || sub.creator === user?.id) && (
                  <button onClick={() => onDelete && onDelete(sub.id)} style={{ background: 'none', border: 'none', color: T.t3, cursor: 'pointer', padding: '1px' }}>
                    <I n="trash" size={11} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showComments && onSaveTask && (
        <TaskComments task={task} user={user} members={members} onSave={onSaveTask} />
      )}
    </div>
  )
}

// ── Kanban ────────────────────────────────────────────────────────────────────
function Kanban({ tasks, members, onEdit, onDelete, onStatusChange, user, onSaveTask, onOpenCollab, taskNotes, onAdd, allTasks, onApprove, onArchive, onToggleTimer }) {
  const { T, bp } = useT()
  const isMobile = bp === 'mobile'
  const [activeCol, setActiveCol] = useState('todo')
  const [draggedTaskId, setDraggedTaskId] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const cols = [
    { key: 'idea', label: 'Idea', color: '#a371f7' },
    { key: 'todo', label: 'To Do', color: T.t2 },
    { key: 'inprogress', label: 'In Progress', color: T.yl },
    { key: 'review', label: 'In Review', color: '#58a6ff' },
    { key: 'done', label: 'Done', color: T.grn },
  ]
  // Only show top-level, non-archived tasks in kanban columns
  const topLevel = tasks.filter(t => !t.parentId && !t.archived)
  const sortedByPriority = list => [...list].sort((a, b) => {
    const rank = (P_RANK[a.priority] ?? 1) - (P_RANK[b.priority] ?? 1)
    if (rank !== 0) return rank
    return (a.createdAt || a.created || 0) - (b.createdAt || b.created || 0)
  })

  const startDrag = (e, task) => {
    setDraggedTaskId(task.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)
  }

  const finishDrag = () => {
    setDraggedTaskId(null)
    setDragOverCol(null)
  }

  const dropOnColumn = (e, col) => {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId
    const task = topLevel.find(t => t.id === taskId)
    finishDrag()
    if (!task || task.status === col.key || !canMoveTask(task, user)) return
    onStatusChange(task.id, col.key)
  }

  const renderCol = (col) => {
    const ct = sortedByPriority(topLevel.filter(t => t.status === col.key))
    const isDropTarget = dragOverCol === col.key
    return (
      <div
        key={col.key}
        onDragOver={e => {
          if (!draggedTaskId) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setDragOverCol(col.key)
        }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null)
        }}
        onDrop={e => dropOnColumn(e, col)}
        style={{
          background: isDropTarget ? `${col.color}12` : T.bg3,
          border: `1.5px solid ${isDropTarget ? col.color : 'transparent'}`,
          borderRadius: 14,
          padding: 12,
          minHeight: isMobile ? 180 : 220,
          transition: 'background 0.15s ease, border-color 0.15s ease'
        }}>
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ color: col.color, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>{col.label}</span>
            <span style={{
              background: `${col.color}22`, color: col.color,
              borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700
            }}>{ct.length}</span>
          </div>
        )}
        {ct.length === 0
          ? <div style={{
              color: isDropTarget ? col.color : T.t3,
              fontSize: 12,
              textAlign: 'center',
              padding: '28px 0',
              border: isDropTarget ? `1px dashed ${col.color}` : `1px dashed ${T.brd}`,
              borderRadius: 10
            }}>{isDropTarget ? `Drop in ${col.label}` : 'Empty'}</div>
          : ct.map(t => (
            <TaskCard key={t.id} task={t} members={members} onEdit={onEdit}
              onDelete={onDelete} onStatusChange={onStatusChange} user={user}
              onSaveTask={onSaveTask} onOpenCollab={onOpenCollab}
              taskNoteData={taskNotes?.[t.id]}
              allTasks={allTasks || tasks} onAdd={onAdd}
              onApprove={onApprove} onArchive={onArchive} onToggleTimer={onToggleTimer}
              onDragStartTask={startDrag} onDragEndTask={finishDrag}
              isDragging={draggedTaskId === t.id} />
          ))
        }
      </div>
    )
  }

  if (isMobile) {
    const activeColData = cols.find(c => c.key === activeCol)
    return (
      <div>
        {/* Status tabs — horizontally scrollable */}
        <div style={{
          display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto',
          paddingBottom: 4, WebkitOverflowScrolling: 'touch'
        }}>
          {cols.map(col => {
            const count = topLevel.filter(t => t.status === col.key).length
            const isActive = activeCol === col.key
            const isDropTarget = dragOverCol === col.key
            return (
              <button
                key={col.key}
                onClick={() => setActiveCol(col.key)}
                onDragOver={e => {
                  if (!draggedTaskId) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOverCol(col.key)
                }}
                onDrop={e => {
                  setActiveCol(col.key)
                  dropOnColumn(e, col)
                }}
                style={{
                background: (isActive || isDropTarget) ? `${col.color}22` : 'transparent',
                border: `1.5px solid ${isActive || isDropTarget ? col.color : T.brd}`,
                borderRadius: 8, color: isActive || isDropTarget ? col.color : T.t3,
                padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                fontFamily: "'Plus Jakarta Sans',sans-serif", whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0
              }}>
                {col.label}
                <span style={{
                  background: `${col.color}${isActive ? '33' : '18'}`, color: col.color,
                  borderRadius: 10, padding: '0 6px', fontSize: 10, fontWeight: 700,
                  minWidth: 18, textAlign: 'center'
                }}>{count}</span>
              </button>
            )
          })}
        </div>
        {/* Active column content */}
        {activeColData && renderCol(activeColData)}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
      {cols.map(col => renderCol(col))}
    </div>
  )
}

// ── TaskForm ──────────────────────────────────────────────────────────────────
function TaskForm({ task, user, members, onClose, onSave, defaultType, categories, onAddCategory }) {
  const { T } = useT()
  const [f, setF] = useState({
    title: task?.title || '',
    desc: task?.desc || '',
    status: task?.status === 'review' && !taskRequiresReview(task) ? 'done' : (task?.status || 'todo'),
    priority: task?.priority || 'med',
    assignee: task?.assignee || user?.id,
    type: task?.type || defaultType || 'group',
    tags: task?.tags || [],
    storyPoints: task?.storyPoints ?? 0,
    category: task?.category || '',
    reviewRequired: task ? taskRequiresReview(task) : false,
    reviewer1: task?.reviewers?.[0] || '',
    reviewer2: task?.reviewers?.[1] || '',
  })
  const [newCat, setNewCat] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)

  const createCategory = () => {
    if (!newCat.trim()) return
    onAddCategory && onAddCategory(newCat.trim())
    setF(p => ({ ...p, category: newCat.trim() }))
    setNewCat(''); setShowNewCat(false)
  }

  const save = () => {
    if (!f.title.trim()) return

    let reviewers = []
    const reviewRequired = f.type !== 'private' && f.reviewRequired
    if (reviewRequired) {
      if (!f.reviewer1 || !f.reviewer2) {
        alert('Please assign exactly 2 reviewers.')
        return
      }
      if (f.reviewer1 === f.reviewer2) {
        alert('Reviewers must be different people.')
        return
      }
      if (f.reviewer1 === user?.id || f.reviewer2 === user?.id) {
        alert('You cannot review your own task.')
        return
      }
      reviewers = [f.reviewer1, f.reviewer2]
    }

    const { reviewer1, reviewer2, ...rest } = f
    const finalStatus = !reviewRequired && rest.status === 'review' ? 'done' : rest.status
    const reviewersChanged = (task?.reviewers || []).join('|') !== reviewers.join('|')
    const approvals = reviewRequired && !reviewersChanged ? (task?.approvals || []) : []

    onSave(task
      ? { ...task, ...rest, status: finalStatus, reviewRequired, reviewers, approvals }
      : { id: uid(), ...rest, status: finalStatus, reviewRequired, reviewers, approvals, creator: user.id, created: Date.now() }
    )
  }

  const cats = categories || []
  const visibleMembers = visibleMembersForUser(members, user)

  return (
    <Modal open onClose={onClose} title={task ? 'Edit Task' : 'New Task'} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input placeholder="Task title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} style={IS(T)} autoFocus />
        <textarea placeholder="Description (optional)…" value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })}
          style={{ ...IS(T), height: 76, resize: 'vertical' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <select value={f.status} onChange={e => setF({ ...f, status: e.target.value })} style={IS(T)}>
            <option value="idea">💡 Idea</option>
            <option value="todo">To Do</option>
            <option value="inprogress">In Progress</option>
            {f.type !== 'private' && f.reviewRequired && <option value="review">🔍 In Review</option>}
            <option value="done">Done</option>
          </select>
          <select value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })} style={IS(T)}>
            <option value="high">High Priority</option>
            <option value="med">Medium</option>
            <option value="low">Low</option>
          </select>
          <select value={f.assignee} onChange={e => setF({ ...f, assignee: e.target.value })} style={IS(T)}>
            {visibleMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={f.type} onChange={e => setF({
            ...f,
            type: e.target.value,
            reviewRequired: e.target.value === 'private' ? false : f.reviewRequired,
            status: e.target.value === 'private' && f.status === 'review' ? 'done' : f.status
          })} style={IS(T)}>
            <option value="private">🔒 Private</option>
            <option value="group">👥 Group</option>
            <option value="public">🌐 Public</option>
          </select>
        </div>

        {/* Review option */}
        {f.type !== 'private' && (
          <div style={{ background: T.bg3, border: `1px solid ${T.brd}`, borderRadius: 8, padding: '10px 12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}>
              <span style={{ color: T.t2, fontSize: 12, fontWeight: 700 }}>REQUIRE REVIEW</span>
              <input
                type="checkbox"
                checked={f.reviewRequired}
                onChange={e => setF({
                  ...f,
                  reviewRequired: e.target.checked,
                  status: !e.target.checked && f.status === 'review' ? 'done' : f.status,
                  reviewer1: e.target.checked ? f.reviewer1 : '',
                  reviewer2: e.target.checked ? f.reviewer2 : '',
                })}
                style={{ width: 18, height: 18, accentColor: T.acc }}
              />
            </label>
            {f.reviewRequired && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <label style={{ color: T.t2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    REVIEWER 1 <span style={{ color: T.red }}>*</span>
                  </label>
                  <select value={f.reviewer1} onChange={e => setF({ ...f, reviewer1: e.target.value })} style={{ ...IS(T), width: '100%' }}>
                    <option value="">Select Reviewer 1</option>
                    {visibleMembers.filter(m => m.id !== user?.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: T.t2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    REVIEWER 2 <span style={{ color: T.red }}>*</span>
                  </label>
                  <select value={f.reviewer2} onChange={e => setF({ ...f, reviewer2: e.target.value })} style={{ ...IS(T), width: '100%' }}>
                    <option value="">Select Reviewer 2</option>
                    {visibleMembers.filter(m => m.id !== user?.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Category */}
        <div>
          <label style={{ color: T.t2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
            CATEGORY <span style={{ color: T.t3, fontWeight: 400 }}>(optional)</span>
          </label>
          {!showNewCat ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={f.category} onChange={e => setF({ ...f, category: e.target.value })} style={{ ...IS(T), flex: 1 }}>
                <option value="">No category</option>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={() => setShowNewCat(true)} style={{ ...GH(T), fontSize: 12, whiteSpace: 'nowrap' }}>
                + New
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input placeholder="Category name…" value={newCat} autoFocus
                onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createCategory(); if (e.key === 'Escape') setShowNewCat(false) }}
                style={{ ...IS(T), flex: 1 }} />
              <button onClick={createCategory} style={BT(T.acc)}>Create</button>
              <button onClick={() => setShowNewCat(false)} style={GH(T)}>✕</button>
            </div>
          )}
        </div>

        {/* Story Points */}
        <div style={{ background: T.bg3, border: `1px solid ${T.brd}`, borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ color: T.t2, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
            STORY POINTS <span style={{ color: T.t3, fontWeight: 400 }}>(1 SP = 0.5h effort)</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STORY_POINTS.map(sp => (
              <button key={sp} onClick={() => setF({ ...f, storyPoints: sp })} style={{
                background: f.storyPoints === sp ? T.acc : T.bg2,
                border: `1px solid ${f.storyPoints === sp ? T.acc : T.brd}`,
                borderRadius: 7, color: f.storyPoints === sp ? '#fff' : T.t2,
                padding: '4px 11px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                fontFamily: "'Plus Jakarta Sans',sans-serif"
              }}>{sp === 0 ? '–' : sp}</button>
            ))}
          </div>
          {f.storyPoints > 0 && (
            <div style={{ color: T.t3, fontSize: 11, marginTop: 6 }}>
              ≈ {SP_HOURS(f.storyPoints)}h · {f.storyPoints <= 3 ? 'Small' : f.storyPoints <= 8 ? 'Medium' : 'Large'} effort
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={GH(T)}>Cancel</button>
          <button onClick={save} style={BT(T.acc)}>Save Task</button>
        </div>
      </div>
    </Modal>
  )
}

// ── BoardPage (shared layout for all boards) ──────────────────────────────────
function BoardPage({ title, tasks, members, user, onAdd, onEdit, onDelete, onStatusChange, filterNote, defaultType, onOpenCollab, taskNotes, allTasks, onApprove, onArchive, categories, onAddCategory, onToggleTimer }) {
  const { T, bp } = useT()
  const isMobile = bp === 'mobile'
  const [showAdd, setShowAdd] = useState(false)
  const [editTask, setEditTask] = useState(null)
  const handleEdit = t => setEditTask(t)
  const handleDelete = id => { if (window.confirm('Delete this task?')) onDelete(id) }
  const visibleMembers = visibleMembersForUser(members, user)

  return (
    <div style={{ padding: isMobile ? '14px 12px' : 24, overflowY: 'auto', flex: '1 1 0', minHeight: 0, paddingBottom: isMobile ? 76 : 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 14 : 22, gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: isMobile ? 18 : 22, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h2>
          {filterNote && <p style={{ color: T.t3, fontSize: 12, marginTop: 3 }}>{filterNote}</p>}
        </div>
        <button onClick={() => setShowAdd(true)} style={{ ...BT(T.acc), display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: isMobile ? 12 : 14, padding: isMobile ? '7px 12px' : '8px 16px' }}>
          <I n="plus" size={13} /> Add Task
        </button>
      </div>
      <Kanban tasks={tasks} members={visibleMembers} onEdit={handleEdit} onDelete={handleDelete}
        onStatusChange={onStatusChange} user={user} onSaveTask={t => onEdit(t)}
        onOpenCollab={onOpenCollab} taskNotes={taskNotes}
        allTasks={allTasks || tasks} onAdd={onAdd}
        onApprove={onApprove} onArchive={onArchive} onToggleTimer={onToggleTimer} />
      {(showAdd || editTask) && (
        <TaskForm
          task={editTask} user={user} members={visibleMembers} defaultType={defaultType}
          categories={categories || []} onAddCategory={onAddCategory}
          onClose={() => { setShowAdd(false); setEditTask(null) }}
          onSave={t => { editTask ? onEdit(t) : onAdd(t); setShowAdd(false); setEditTask(null) }}
        />
      )}
    </div>
  )
}

function PrivateBoard({ tasks, members, user, onAdd, onEdit, onDelete, onStatusChange, privateCanvas, onSaveCanvas, privateNotes, onSaveNotes, privateMaterials, onSaveMaterials, onOpenCollab, taskNotes, onApprove, onArchive, categories, onAddCategory, onToggleTimer }) {
  const { T, bp } = useT()
  const isMobile = bp === 'mobile'
  const [tab, setTab] = useState('board')
  // Show ALL tasks assigned to this user (public, group, private)
  // Private tasks from others are hidden; own private tasks always shown
  const mine = tasks.filter(t =>
    t.assignee === user?.id || t.createdBy === user?.id ||
    (t.type === 'private' && t.creator === user?.id)
  )
  const [subTab, setSubTab] = useState('all')
  const filtered = subTab === 'all' ? mine
    : mine.filter(t => t.type === subTab)
  const counts = {
    all: mine.length,
    private: mine.filter(t => t.type === 'private').length,
    group: mine.filter(t => t.type === 'group').length,
    public: mine.filter(t => t.type === 'public').length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: 0, overflow: 'hidden', height: '100%' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 4, padding: isMobile ? '8px 12px' : '10px 20px', background: T.bg2,
        borderBottom: `1px solid ${T.brd}`, alignItems: isMobile ? 'stretch' : 'center', flexShrink: 0, flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: isMobile ? 2 : 0 }}>
          <span style={{ color: T.t3, fontSize: 12, marginRight: 6, flexShrink: 0 }}>👤 My Tasks</span>
          {[['board', '📋 Tasks'], ['whiteboard', '🖊️ Whiteboard'], ['notes', '📝 Notes'], ['materials', '📎 Materials']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              background: tab === id ? `${T.acc}1a` : 'transparent',
              border: `1px solid ${tab === id ? T.acc : T.brd}`,
              borderRadius: 8, color: tab === id ? T.acc : T.t2,
              fontSize: isMobile ? 11 : 12, padding: isMobile ? '4px 10px' : '5px 14px', cursor: 'pointer',
              fontFamily: "'Plus Jakarta Sans',sans-serif", whiteSpace: 'nowrap', flexShrink: 0
            }}>{label}</button>
          ))}
        </div>
        {tab === 'board' && (
          <div style={{ marginLeft: isMobile ? 0 : 'auto', display: 'flex', gap: 4, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingTop: isMobile ? 4 : 0 }}>
            {[['all', 'All'], ['private', '🔒 Private'], ['group', '👥 Group'], ['public', '🌐 Public']].map(([k, l]) => (
              <button key={k} onClick={() => setSubTab(k)} style={{
                background: subTab === k ? `${T.acc}1a` : 'transparent',
                border: `1px solid ${subTab === k ? T.acc : T.brd}`,
                borderRadius: 7, color: subTab === k ? T.acc : T.t3,
                fontSize: 11, padding: '3px 10px', cursor: 'pointer',
                fontFamily: "'Plus Jakarta Sans',sans-serif", whiteSpace: 'nowrap', flexShrink: 0
              }}>{l} {counts[k] > 0 && <span style={{ fontWeight: 700 }}>{counts[k]}</span>}</button>
            ))}
          </div>
        )}
      </div>
      {/* Tab content */}
      <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {tab === 'board' && (
          <BoardPage
            title="My Tasks"
            tasks={filtered}
            allTasks={tasks}
            members={members}
            user={user}
            onAdd={t => onAdd({ ...t, type: 'private', assignee: user.id })}
            onEdit={onEdit}
            onDelete={onDelete}
            onStatusChange={onStatusChange}
            defaultType="private"
            onOpenCollab={onOpenCollab}
            taskNotes={taskNotes}
            onApprove={onApprove}
            onArchive={onArchive}
            categories={categories}
            onAddCategory={onAddCategory}
            onToggleTimer={onToggleTimer}
          />
        )}
        {tab === 'whiteboard' && (
          <PrivateWhiteboard canvasData={privateCanvas} onSave={onSaveCanvas} />
        )}
        {tab === 'notes' && (
          <PrivateNotes notes={privateNotes || ''} onSave={onSaveNotes} />
        )}
        {tab === 'materials' && (
          <MaterialsTab
            materials={privateMaterials || '[]'}
            onSave={onSaveMaterials}
            groupName="Personal"
          />
        )}
      </div>
    </div>
  )
}

const WHITEBOARD_COLORS = ['#58a6ff', '#3fb950', '#f85149', '#d29922', '#bc8cff', '#ff7b72', '#ffffff', '#8b949e', '#000000']
const WHITEBOARD_TOOLS = [
  { id: 'pen', label: '✏️ Pen' },
  { id: 'eraser', label: '⬜ Eraser' },
  { id: 'line', label: '╱ Line' },
  { id: 'arrow', label: '→ Arrow' },
  { id: 'rect', label: '▭ Rect' },
  { id: 'circle', label: '○ Circle' },
  { id: 'text', label: 'T Text' },
]

const drawShape = (ctx, shape, a, b, col, w) => {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'
  ctx.beginPath()
  if (shape === 'rect') {
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
  } else if (shape === 'circle') {
    const rx = (b.x - a.x) / 2, ry = (b.y - a.y) / 2
    ctx.ellipse(a.x + rx, a.y + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2)
    ctx.stroke()
  } else if (shape === 'line') {
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
  } else if (shape === 'arrow') {
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    const hs = Math.min(20, Math.hypot(b.x - a.x, b.y - a.y) * 0.35)
    ctx.beginPath()
    ctx.moveTo(b.x, b.y)
    ctx.lineTo(b.x - hs * Math.cos(angle - 0.45), b.y - hs * Math.sin(angle - 0.45))
    ctx.moveTo(b.x, b.y)
    ctx.lineTo(b.x - hs * Math.cos(angle + 0.45), b.y - hs * Math.sin(angle + 0.45))
    ctx.stroke()
  }
}

function PrivateWhiteboard({ canvasData, onSave }) {
  const { T } = useT()
  const canvasRef = useRef()
  const drawing = useRef(false)
  const lastPt = useRef(null)
  const saveTimer = useRef()
  const historyRef = useRef([])
  const histPos = useRef(-1)
  const [color, setColor] = useState('#58a6ff')
  const [size, setSize] = useState(3)
  const [tool, setTool] = useState('pen')
  const [textInput, setTextInput] = useState(null)
  const [textVal, setTextVal] = useState('')

  useEffect(() => {
    if (!canvasData) return
    const img = new Image()
    img.onload = () => {
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) { ctx.clearRect(0, 0, 1400, 900); ctx.drawImage(img, 0, 0) }
      pushHistory()
    }
    img.src = canvasData
  }, [canvasData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const prevent = e => { if (e.target === canvas) e.preventDefault() }
    canvas.addEventListener('touchstart', prevent, { passive: false })
    canvas.addEventListener('touchmove', prevent, { passive: false })
    return () => {
      canvas.removeEventListener('touchstart', prevent)
      canvas.removeEventListener('touchmove', prevent)
    }
  }, [])

  const pushHistory = () => {
    const cv = canvasRef.current; if (!cv) return
    const snap = cv.toDataURL('image/jpeg', 0.6)
    historyRef.current = historyRef.current.slice(0, histPos.current + 1)
    historyRef.current.push(snap)
    if (historyRef.current.length > 20) historyRef.current.shift()
    histPos.current = historyRef.current.length - 1
  }

  const undo = () => {
    if (histPos.current <= 0) return
    histPos.current--
    const img = new Image()
    img.onload = () => {
      const ctx = canvasRef.current.getContext('2d')
      ctx.clearRect(0, 0, 1400, 900); ctx.drawImage(img, 0, 0)
    }
    img.src = historyRef.current[histPos.current]
    triggerSave()
  }

  const getPos = e => {
    const canvas = canvasRef.current
    const r = canvas.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return { x: (src.clientX - r.left) * 1400 / r.width, y: (src.clientY - r.top) * 900 / r.height }
  }

  const triggerSave = () => {
    if (!canvasRef.current) return
    onSave(canvasRef.current.toDataURL('image/jpeg', 0.6))
  }

  const snapRef = useRef(null)
  const startDraw = e => {
    e.preventDefault()
    if (tool === 'text') { setTextInput(getPos(e)); setTextVal(''); return }
    if (['rect', 'circle', 'line', 'arrow'].includes(tool)) {
      snapRef.current = canvasRef.current.toDataURL('image/jpeg', 0.6)
    }
    drawing.current = true; lastPt.current = getPos(e)
    if (tool === 'pen' || tool === 'eraser') {
      const ctx = canvasRef.current.getContext('2d'), pt = lastPt.current
      ctx.beginPath(); ctx.arc(pt.x, pt.y, (tool === 'eraser' ? size * 4 : size) / 2, 0, Math.PI * 2)
      ctx.fillStyle = tool === 'eraser' ? T.bg3 : color; ctx.fill()
    }
  }

  const draw = e => {
    e.preventDefault(); if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d'), pt = getPos(e)
    if (tool === 'pen' || tool === 'eraser') {
      ctx.beginPath(); ctx.moveTo(lastPt.current.x, lastPt.current.y); ctx.lineTo(pt.x, pt.y)
      ctx.strokeStyle = tool === 'eraser' ? T.bg3 : color
      ctx.lineWidth = tool === 'eraser' ? size * 4 : size
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke()
      lastPt.current = pt
    } else {
      if (snapRef.current) {
        const img = new Image(); img.onload = () => {
          ctx.clearRect(0, 0, 1400, 900); ctx.drawImage(img, 0, 0)
          drawShape(ctx, tool, lastPt.current, pt, color, size)
        }; img.src = snapRef.current
      } else drawShape(ctx, tool, lastPt.current, pt, color, size)
    }
    clearTimeout(saveTimer.current); saveTimer.current = setTimeout(triggerSave, 1500)
  }

  const stopDraw = () => {
    if (!drawing.current) return
    drawing.current = false; snapRef.current = null; pushHistory(); triggerSave()
  }

  const placeText = () => {
    if (!textVal.trim() || !textInput) { setTextInput(null); return }
    const ctx = canvasRef.current.getContext('2d')
    ctx.fillStyle = color; ctx.font = `${Math.max(size * 5, 14)}px Plus Jakarta Sans, sans-serif`
    ctx.fillText(textVal, textInput.x, textInput.y); setTextInput(null); setTextVal('')
    pushHistory(); triggerSave()
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: T.bg2, borderBottom: `1px solid ${T.brd}`, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: T.bg3, padding: 3, borderRadius: 10 }}>
          {WHITEBOARD_TOOLS.map(t => (
            <button key={t.id} onClick={() => setTool(t.id)} style={{
              background: tool === t.id ? T.acc : 'transparent',
              color: tool === t.id ? '#fff' : T.t2, border: 'none', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600
            }}>{t.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginLeft: 6 }}>
          {WHITEBOARD_COLORS.slice(0, 6).map(c => (
            <button key={c} onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen') }} style={{
              width: 20, height: 20, borderRadius: '50%', background: c, border: `2px solid ${color === c ? T.t1 : 'transparent'}`, cursor: 'pointer', transform: color === c ? 'scale(1.2)' : 'scale(1)', transition: 'all 0.15s'
            }} />
          ))}
          <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
          <input type="range" min={1} max={24} value={size} onChange={e => setSize(+e.target.value)} style={{ width: 60 }} />
          <span style={{ color: T.t2, fontSize: 11, minWidth: 20 }}>{size}px</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={undo} style={{ ...GH(T), fontSize: 11, padding: '5px 12px' }}>↩ Undo</button>
          <button onClick={() => {
            const cv = canvasRef.current; if (!cv) return
            const a = document.createElement('a'); a.href = cv.toDataURL(); a.download = 'personal-whiteboard.png'; a.click()
          }} style={{ ...GH(T), fontSize: 11, padding: '5px 12px' }}>Export PNG</button>
          <button onClick={() => { canvasRef.current.getContext('2d').clearRect(0, 0, 1400, 900); triggerSave() }}
            style={{ ...GH(T), fontSize: 11, padding: '5px 12px', color: T.red, borderColor: T.red + '55' }}>Clear</button>
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', touchAction: 'none', background: T.bg3 }}>
        <canvas ref={canvasRef} width={1400} height={900}
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            cursor: tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair',
            touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none'
          }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
        {textInput && (
          <div style={{ position: 'absolute', top: (textInput.y / 900 * 100) + '%', left: (textInput.x / 1400 * 100) + '%', zIndex: 10 }}>
            <input autoFocus value={textVal} onChange={e => setTextVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') placeText(); if (e.key === 'Escape') setTextInput(null) }}
              onBlur={placeText}
              style={{ ...IS(T), width: 200, fontSize: Math.max(size * 4, 14) + 'px', color, background: `${T.bg}cc`, border: `2px solid ${T.acc}` }}
              placeholder="Type & press Enter" />
          </div>
        )}
      </div>
    </div>
  )
}

function PrivateNotes({ notes, onSave }) {
  const { T } = useT()
  const [cat, setCat] = useState('personal')
  const [data, setData] = useState(() => (typeof notes === 'object' && notes) ? notes : { personal: (typeof notes === 'string' ? notes : ''), meeting: '', lecture: '' })
  const [saved, setSaved] = useState(true)
  const timerRef = useRef()

  useEffect(() => {
    if (typeof notes === 'object' && notes && Object.keys(notes).length) setData(notes)
    else if (typeof notes === 'string') setData(prev => ({ ...prev, personal: notes }))
  }, [notes])

  const change = val => {
    const next = { ...data, [cat]: val }
    setData(next); setSaved(false)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { onSave(next); setSaved(true) }, 800)
  }

  const exportMd = () => {
    const body = `## Personal\n${data.personal || ''}\n\n## Meeting\n${data.meeting || ''}\n\n## Lecture\n${data.lecture || ''}`
    const a = document.createElement('a')
    a.href = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(`# Private Notes\n\n${body}`)
    a.download = 'private-notes.md'
    a.click()
  }

  const CATS = [
    { id: 'personal', label: '👤 Personal', color: T.acc },
    { id: 'meeting', label: '🤝 Meeting', color: '#d29922' },
    { id: 'lecture', label: '📚 Lecture', color: '#3fb950' },
  ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 22, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 4, background: T.bg3, padding: 3, borderRadius: 10 }}>
          {CATS.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)} style={{
              background: cat === c.id ? c.color : 'transparent',
              color: cat === c.id ? '#fff' : T.t2,
              border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s'
            }}>{c.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: saved ? T.grn : T.yl, fontWeight: 600 }}>{saved ? '✓ Saved' : '● Saving…'}</span>
          <button onClick={exportMd} style={{ ...GH(T), fontSize: 11, padding: '5px 12px' }}>Export .md</button>
        </div>
      </div>
      <textarea
        value={data[cat] || ''}
        onChange={e => change(e.target.value)}
        placeholder={`Write your ${cat} notes here…`}
        style={{
          flex: 1, background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 16,
          color: T.t1, fontSize: 15, padding: 24, resize: 'none', outline: 'none',
          fontFamily: 'inherit', lineHeight: 1.8, boxShadow: `inset 0 2px 10px ${T.shadow}`
        }}
      />
    </div>
  )
}

// ── Profile ───────────────────────────────────────────────────────────────────
function Profile({ user, onUpdate, onSaveImmediate }) {
  const { T } = useT()
  const [name, setName] = useState(user.name)
  const [avatar, setAvatar] = useState(user.avatar || '')
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confPw, setConfPw] = useState('')
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()

  // Fix #8b: Keep local state in sync when user object updates from Firestore
  // (e.g. after a successful save, the snapshot updates user — we must NOT clobber
  // an in-progress pick, so only sync name, not avatar which user controls locally)
  useEffect(() => { setName(user.name || '') }, [user.name])

  // Fix #8c: Compress image with canvas before storing (avoid 1MB Firestore limit)
  const compressImage = (dataUrl, maxPx = 256) => new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.src = dataUrl
  })

  const saveProfile = async () => {
    if (!name.trim()) return setMsg({ type: 'err', text: 'Name cannot be empty.' })
    setSaving(true)
    const saveFn = onSaveImmediate || onUpdate
    saveFn(user.id, { name: name.trim(), avatar })
    setMsg({ type: 'ok', text: 'Profile updated successfully!' })
    setSaving(false)
    setTimeout(() => setMsg(null), 3000)
  }

  const savePassword = () => {
    if (user.pw && curPw !== user.pw) return setMsg({ type: 'err', text: 'Current password is incorrect.' })
    if (newPw.length < 6) return setMsg({ type: 'err', text: 'New password must be at least 6 characters.' })
    if (newPw !== confPw) return setMsg({ type: 'err', text: 'Passwords do not match.' })
    onUpdate(user.id, { pw: newPw, mustChangePw: false })
    setCurPw(''); setNewPw(''); setConfPw('')
    setMsg({ type: 'ok', text: 'Password changed successfully!' })
    setTimeout(() => setMsg(null), 3000)
  }

  const onFileChange = async e => {
    const file = e.target.files[0]
    // Fix #8b: Always reset the file input so the same file can be re-picked
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return setMsg({ type: 'err', text: 'Image must be under 5MB.' })
    setMsg({ type: 'ok', text: 'Processing image…' })
    const reader = new FileReader()
    reader.onload = async ev => {
      // Compress to 256×256 JPEG to stay well under Firestore 1MB limit
      const compressed = await compressImage(ev.target.result, 256)
      setAvatar(compressed)
      setMsg(null)
    }
    reader.readAsDataURL(file)
  }

  const section = (title, children) => (
    <div style={{ background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 16, padding: 28, marginBottom: 20 }}>
      <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 17, marginBottom: 18 }}>{title}</h3>
      {children}
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 28, maxWidth: 580 }}>
      <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: 22, marginBottom: 6 }}>My Profile</h2>
      <p style={{ color: T.t2, fontSize: 13, marginBottom: 24 }}>Update your name, avatar and password.</p>

      {msg && (
        <div style={{
          background: msg.type === 'ok' ? `${T.grn}1a` : `${T.red}1a`,
          border: `1px solid ${msg.type === 'ok' ? T.grn + '44' : T.red + '44'}`,
          borderRadius: 10, padding: '11px 16px', color: msg.type === 'ok' ? T.grn : T.red,
          fontSize: 13, marginBottom: 20
        }}>{msg.text}</div>
      )}

      {section('Avatar & Name', <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
          <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => fileRef.current.click()}>
            {avatar
              ? <img src={avatar} alt="avatar" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${T.acc}` }} />
              : <Av member={{ ...user, avatar: '' }} size={72} />
            }
            <div style={{
              position: 'absolute', bottom: 0, right: 0, background: T.acc, borderRadius: '50%',
              width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${T.bg2}`
            }}>
              <I n="edit" size={11} color="#fff" />
            </div>
          </div>
          <div>
            <div style={{ color: T.t1, fontWeight: 600, fontSize: 14 }}>{name || user.name}</div>
            <div style={{ color: T.t3, fontSize: 12, marginTop: 3 }}>{user.email}</div>
            <button onClick={() => fileRef.current.click()} style={{ ...GH(T), marginTop: 8, fontSize: 12, padding: '5px 12px' }}>
              Change Photo
            </button>
          </div>
          {/* Fix #8b: key forces a fresh input element, allowing same-file re-pick */}
          <input key={avatar} ref={fileRef} type="file" accept="image/*"
            style={{ display: 'none' }} onChange={onFileChange} />
        </div>
        <p style={{ color: T.t3, fontSize: 11, marginBottom: 12 }}>
          Image is compressed to 256×256px. Max upload size: 5MB.
        </p>
        <label style={{ color: T.t2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>DISPLAY NAME</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
          style={{ ...IS(T), marginBottom: 16 }} />
        <button onClick={saveProfile} disabled={saving} style={{ ...BT(T.acc), opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </>)}

      {section('Change Password', <>
        {user.pw && <>
          <label style={{ color: T.t2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>CURRENT PASSWORD</label>
          <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)}
            placeholder="Enter current password" style={{ ...IS(T), marginBottom: 12 }} />
        </>}
        <label style={{ color: T.t2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>NEW PASSWORD</label>
        <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
          placeholder="New password (min 6 chars)" style={{ ...IS(T), marginBottom: 12 }} />
        <label style={{ color: T.t2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>CONFIRM NEW PASSWORD</label>
        <input type="password" value={confPw} onChange={e => setConfPw(e.target.value)}
          placeholder="Confirm new password" style={{ ...IS(T), marginBottom: 16 }}
          onKeyDown={e => e.key === 'Enter' && savePassword()} />
        <button onClick={savePassword} style={{ ...BT(T.acc) }}>Update Password</button>
      </>)}
    </div>
  )
}

// ── Group Whiteboard (shared, synced via Firestore) ──────────────────────────
function GroupWhiteboard({ canvasData, onSave, projectNotes, onSaveNotes }) {
  const { T } = useT()
  const canvasRef = useRef()
  const drawing = useRef(false)
  const lastPt = useRef(null)
  const saveTimer = useRef()
  const historyRef = useRef([])
  const histPos = useRef(-1)
  const [wbTab, setWbTab] = useState('draw')  // 'draw' | 'notes'
  const [color, setColor] = useState('#58a6ff')
  const [size, setSize] = useState(3)
  const [tool, setTool] = useState('pen')   // pen|eraser|rect|circle|line|arrow|text
  const [synced, setSynced] = useState(true)
  const [textInput, setTextInput] = useState(null)  // {x,y}
  const [textVal, setTextVal] = useState('')

  // Load canvas from Firestore (100ms onSnapshot handled outside)

  // Load canvas from Firestore (100ms onSnapshot handled outside)
  useEffect(() => {
    if (!canvasData) return
    const canvas = canvasRef.current
    if (!canvas) return
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      pushHistory()
    }
    img.src = canvasData
  }, [canvasData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const prevent = e => { if (e.target === canvas) e.preventDefault() }
    canvas.addEventListener('touchstart', prevent, { passive: false })
    canvas.addEventListener('touchmove', prevent, { passive: false })
    return () => {
      canvas.removeEventListener('touchstart', prevent)
      canvas.removeEventListener('touchmove', prevent)
    }
  }, [])


  const pushHistory = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const snap = canvas.toDataURL('image/jpeg', 0.6)
    historyRef.current = historyRef.current.slice(0, histPos.current + 1)
    historyRef.current.push(snap)
    if (historyRef.current.length > 30) historyRef.current.shift()
    histPos.current = historyRef.current.length - 1
  }

  const undo = () => {
    if (histPos.current <= 0) return
    histPos.current--
    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
    }
    img.src = historyRef.current[histPos.current]
    triggerSave()
  }

  const getPos = e => {
    const canvas = canvasRef.current
    const r = canvas.getBoundingClientRect()
    const scaleX = canvas.width / r.width
    const scaleY = canvas.height / r.height
    const src = e.touches ? e.touches[0] : e
    return { x: (src.clientX - r.left) * scaleX, y: (src.clientY - r.top) * scaleY }
  }

  const startDraw = e => {
    e.preventDefault()
    if (tool === 'text') {
      const pt = getPos(e)
      setTextInput(pt)
      setTextVal('')
      return
    }
    drawing.current = true
    const pt = getPos(e)
    lastPt.current = pt
    if (tool === 'pen' || tool === 'eraser') {
      const ctx = canvasRef.current.getContext('2d')
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, (tool === 'eraser' ? size * 4 : size) / 2, 0, Math.PI * 2)
      ctx.fillStyle = tool === 'eraser' ? T.bg3 : color
      ctx.fill()
    }
  }

  const snapRef = useRef(null)
  const draw = e => {
    e.preventDefault()
    if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d')
    const pt = getPos(e)
    if (tool === 'pen' || tool === 'eraser') {
      ctx.beginPath()
      ctx.moveTo(lastPt.current.x, lastPt.current.y)
      ctx.lineTo(pt.x, pt.y)
      ctx.strokeStyle = tool === 'eraser' ? T.bg3 : color
      ctx.lineWidth = tool === 'eraser' ? size * 5 : size
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.stroke()
      lastPt.current = pt
    } else {
      // Shape preview: restore snap, then draw shape
      if (snapRef.current) {
        const img = new Image()
        img.onload = () => {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
          ctx.drawImage(img, 0, 0)
          drawShape(ctx, tool, lastPt.current, pt, color, size)
        }
        img.src = snapRef.current
      } else {
        drawShape(ctx, tool, lastPt.current, pt, color, size)
      }
    }
    setSynced(false)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(triggerSave, 1200)
  }

  const stopDraw = e => {
    if (!drawing.current) return
    drawing.current = false
    snapRef.current = null
    pushHistory()
    triggerSave()
  }

  const startShape = e => {
    if (['rect', 'circle', 'line', 'arrow'].includes(tool)) {
      snapRef.current = canvasRef.current.toDataURL('image/jpeg', 0.6)
    }
    startDraw(e)
  }

  const placeText = () => {
    if (!textVal.trim() || !textInput) { setTextInput(null); return }
    const ctx = canvasRef.current.getContext('2d')
    ctx.fillStyle = color
    ctx.font = `${Math.max(size * 5, 14)}px Plus Jakarta Sans, sans-serif`
    ctx.fillText(textVal, textInput.x, textInput.y)
    setTextInput(null); setTextVal('')
    pushHistory(); triggerSave()
  }

  const triggerSave = () => {
    const data = canvasRef.current.toDataURL('image/jpeg', 0.7)
    onSave(data)
    setSynced(true)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    historyRef.current = []; histPos.current = -1
    triggerSave()
  }

  const exportPng = () => {
    const a = document.createElement('a')
    a.href = canvasRef.current.toDataURL()
    a.download = 'group-whiteboard.png'
    a.click()
  }


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 12px', background: T.bg2, borderBottom: `1px solid ${T.brd}` }}>
        {['draw', 'notes'].map(t => (
          <button key={t} onClick={() => setWbTab(t)} style={{
            ...GH(T), background: wbTab === t ? `${T.acc}1a` : undefined,
            color: wbTab === t ? T.acc : T.t2, borderColor: wbTab === t ? T.acc : T.brd,
            fontSize: 12, padding: '5px 14px', textTransform: 'capitalize'
          }}>{t === 'draw' ? '🖊️ Draw' : '📝 Notes'}</button>
        ))}
        <span style={{ marginLeft: 'auto', color: synced ? T.grn : T.yl, fontSize: 11, alignSelf: 'center' }}>
          {synced ? '✓ Synced' : '● Saving...'}
        </span>
      </div>

      {wbTab === 'draw' && <>
        {/* Toolbar ("Dash") */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: T.bg2, borderBottom: `1px solid ${T.brd}`, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: T.bg3, padding: 3, borderRadius: 10 }}>
            {WHITEBOARD_TOOLS.map(t => (
              <button key={t.id} onClick={() => setTool(t.id)} style={{
                background: tool === t.id ? T.acc : 'transparent',
                color: tool === t.id ? '#fff' : T.t2, border: 'none', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600
              }}>{t.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginLeft: 6 }}>
            {WHITEBOARD_COLORS.slice(0, 8).map(c => (
              <button key={c} onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen') }} style={{
                width: 20, height: 20, borderRadius: '50%', background: c, border: `2px solid ${color === c ? T.t1 : 'transparent'}`, cursor: 'pointer', transform: color === c ? 'scale(1.2)' : 'scale(1)', transition: 'all 0.15s'
              }} />
            ))}
            <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
            <input type="range" min={1} max={24} value={size} onChange={e => setSize(+e.target.value)} style={{ width: 60 }} />
            <span style={{ color: T.t2, fontSize: 11, minWidth: 20 }}>{size}px</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={undo} style={{ ...GH(T), fontSize: 11, padding: '5px 12px' }}>↩ Undo</button>
            <button onClick={exportPng} style={{ ...GH(T), fontSize: 11, padding: '5px 12px' }}>Export PNG</button>
            <button onClick={clearCanvas} style={{ ...GH(T), fontSize: 11, padding: '5px 12px', color: T.red, borderColor: T.red + '55' }}>Clear</button>
          </div>
        </div>
        {/* Canvas */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', touchAction: 'none' }}>
          <canvas
            ref={canvasRef} width={1600} height={1000}
            style={{
              width: '100%', height: '100%',
              cursor: tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair',
              background: '#1a1f28', display: 'block', touchAction: 'none',
              userSelect: 'none', WebkitUserSelect: 'none'
            }}
            onMouseDown={startShape} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
            onTouchStart={startShape} onTouchMove={draw} onTouchEnd={stopDraw}
          />
          {textInput && (
            <div style={{ position: 'absolute', top: (textInput.y / 1000 * 100) + '%', left: (textInput.x / 1600 * 100) + '%', zIndex: 10 }}>
              <input autoFocus value={textVal} onChange={e => setTextVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') placeText(); if (e.key === 'Escape') setTextInput(null) }}
                onBlur={placeText}
                style={{ ...IS(T), width: 200, fontSize: Math.max(size * 4, 12) + 'px', color, background: `${T.bg}cc` }}
                placeholder="Type & press Enter" />
            </div>
          )}
        </div>
      </>}

      {wbTab === 'notes' && (
        <GroupNotesTab notes={projectNotes} onSave={onSaveNotes} groupName="Group" />
      )}
    </div>
  )
}


// ── Materials Tab (persistent resource/link board) ────────────────────────────
function MaterialsTab({ materials, onSave, groupName }) {
  const { T } = useT()
  const items = (() => { try { return JSON.parse(materials) } catch { return [] } })()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', url: '', note: '', type: 'link' })
  const [confirm, setConfirm] = useState(null)

  const save = () => {
    if (!form.title.trim()) return
    const updated = [...items, { id: uid(), ...form, title: form.title.trim(), created: Date.now() }]
    onSave(JSON.stringify(updated))
    setForm({ title: '', url: '', note: '', type: 'link' }); setShowAdd(false)
  }
  const remove = id => {
    onSave(JSON.stringify(items.filter(x => x.id !== id)))
    setConfirm(null)
  }

  const TYPE_ICON = { link: '🔗', doc: '📄', image: '🖼️', video: '🎬', other: '📦' }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 17 }}>📎 Materials</h3>
          <p style={{ color: T.t2, fontSize: 12, marginTop: 2 }}>Shared resources, links and files for {groupName}</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ ...BT(T.acc), display: 'flex', alignItems: 'center', gap: 6 }}>
          <I n="plus" size={13} /> Add Resource
        </button>
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: T.t3 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📎</div>
          <div style={{ fontSize: 14 }}>No materials yet — add links, docs or notes for the team.</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
        {items.map(item => (
          <div key={item.id} style={{
            background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 12, padding: 16,
            display: 'flex', flexDirection: 'column', gap: 8
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{TYPE_ICON[item.type] || '📦'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.t1, fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{item.title}</div>
                {item.note && <div style={{ color: T.t2, fontSize: 12, marginTop: 3, lineHeight: 1.4 }}>{item.note}</div>}
              </div>
              <button onClick={() => setConfirm(item.id)} style={{ background: 'none', border: 'none', color: T.t3, cursor: 'pointer', flexShrink: 0 }}>
                <I n="trash" size={13} color={T.red} />
              </button>
            </div>
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" style={{
                color: T.acc, fontSize: 12, background: `${T.acc}10`, borderRadius: 7,
                padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6,
                textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                <I n="share" size={11} color={T.acc} /> {item.url}
              </a>
            )}
            <div style={{ color: T.t3, fontSize: 10 }}>Added {new Date(item.created).toLocaleDateString()}</div>
          </div>
        ))}
      </div>

      {showAdd && (
        <Modal open onClose={() => setShowAdd(false)} title="Add Resource" width={440}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={IS(T)}>
              <option value="link">🔗 Link / URL</option>
              <option value="doc">📄 Document</option>
              <option value="image">🖼️ Image</option>
              <option value="video">🎬 Video</option>
              <option value="other">📦 Other</option>
            </select>
            <input placeholder="Title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={IS(T)} autoFocus />
            <input placeholder="URL or link (optional)" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} style={IS(T)} />
            <textarea placeholder="Notes (optional)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
              style={{ ...IS(T), height: 70, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={GH(T)}>Cancel</button>
              <button onClick={save} style={BT(T.acc)}>Add Resource</button>
            </div>
          </div>
        </Modal>
      )}
      <Confirm open={!!confirm} onClose={() => setConfirm(null)} msg="Remove this resource?"
        onOk={() => remove(confirm)} />
    </div>
  )
}

function GroupBoard({ tasks, members, user, onAdd, onEdit, onDelete, onStatusChange, projects, onAddProject, groupCanvases, groupNotes, onSaveCanvas, onSaveNotes, onOpenCollab, taskNotes, onApprove, onArchive, categories, onAddCategory, onToggleTimer }) {
  const { T, bp } = useT()
  const isMobile = bp === 'mobile'
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [tab, setTab] = useState('board')
  const [showCreate, setShowCreate] = useState(false)
  const [newG, setNewG] = useState({ name: '', desc: '', color: '#58a6ff', members: [] })
  const [createErr, setCreateErr] = useState('')
  const [showManage, setShowManage] = useState(false)

  // Admins can see every project; members only see groups they belong to.
  const myGroups = user?.role === 'admin' ? projects : projects.filter(p => p.members.includes(user.id))
  const visibleMembers = visibleMembersForUser(members, user)

  const openGroup = p => { setSelectedGroup(p); setTab('board') }
  const back = () => setSelectedGroup(null)

  // ── Group list ──────────────────────────────────────────────────────────
  if (!selectedGroup) return (
    <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 12px' : 24, paddingBottom: isMobile ? 76 : 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 14 : 20, gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: isMobile ? 18 : 22 }}>Group Projects</h2>
          <p style={{ color: T.t2, fontSize: isMobile ? 11 : 13, marginTop: 3 }}>Collaborate on shared projects with your team.</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ ...BT(T.acc), display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, fontSize: isMobile ? 12 : 14, padding: isMobile ? '7px 12px' : '8px 16px' }}>
          <I n="plus" size={14} /> {isMobile ? 'New' : 'New Group'}
        </button>
      </div>

      {myGroups.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: T.t3 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 15, marginBottom: 6 }}>No groups yet</div>
          <div style={{ fontSize: 13 }}>Create a group or ask an admin to add you to one.</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
        {myGroups.map(p => {
          const groupTasks = tasks.filter(t => t.groupId === p.id)
          const done = groupTasks.filter(t => t.status === 'done').length
          return (
            <button key={p.id} onClick={() => openGroup(p)} style={{
              background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 16, padding: 20,
              textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
              borderLeft: `4px solid ${p.color || T.acc}`
            }}>
              <div style={{ color: T.t1, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{p.name}</div>
              {p.desc && <div style={{ color: T.t2, fontSize: 13, marginBottom: 12 }}>{p.desc}</div>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: -4 }}>
                  {p.members.filter(mid => canSeeMember(user, members.find(x => x.id === mid))).slice(0, 5).map(mid => {
                    const m = members.find(x => x.id === mid)
                    return m ? <Av key={mid} member={m} size={28} style={{ marginRight: -6 }} /> : null
                  })}
                  {p.members.filter(mid => canSeeMember(user, members.find(x => x.id === mid))).length > 5 && <span style={{ color: T.t3, fontSize: 12, marginLeft: 10 }}>+{p.members.filter(mid => canSeeMember(user, members.find(x => x.id === mid))).length - 5}</span>}
                </div>
                <span style={{ color: T.t3, fontSize: 12 }}>{done}/{groupTasks.length} done</span>
              </div>
            </button>
          )
        })}
      </div>

      {showCreate && (
        <Modal open onClose={() => { setShowCreate(false); setCreateErr(''); setNewG({ name: '', desc: '', color: '#58a6ff', members: [] }) }} title="Create New Group">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {createErr && <div style={{ background: `${T.red}1a`, border: `1px solid ${T.red}44`, borderRadius: 8, padding: '9px 13px', color: T.red, fontSize: 13 }}>{createErr}</div>}
            <input placeholder="Group name" value={newG.name} onChange={e => setNewG({ ...newG, name: e.target.value })} style={IS(T)} autoFocus />
            <input placeholder="Description (optional)" value={newG.desc} onChange={e => setNewG({ ...newG, desc: e.target.value })} style={IS(T)} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: T.t2, fontSize: 13 }}>Color:</span>
              <input type="color" value={newG.color} onChange={e => setNewG({ ...newG, color: e.target.value })}
                style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${T.brd}`, cursor: 'pointer', background: 'none' }} />
            </div>
            <div>
              <div style={{ color: T.t2, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Add Members:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {visibleMembers.map(m => (
                  <label key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    background: newG.members.includes(m.id) ? `${newG.color}15` : T.bg3,
                    border: `1px solid ${newG.members.includes(m.id) ? newG.color : T.brd}`,
                    borderRadius: 9, padding: '8px 12px', transition: 'all 0.15s'
                  }}>
                    <input type="checkbox" checked={newG.members.includes(m.id) || m.id === user.id}
                      disabled={m.id === user.id}
                      onChange={() => setNewG(g => ({ ...g, members: g.members.includes(m.id) ? g.members.filter(x => x !== m.id) : [...g.members, m.id] }))} />
                    <Av member={m} size={26} />
                    <div>
                      <div style={{ color: T.t1, fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                      <div style={{ color: T.t3, fontSize: 11 }}>{m.email}</div>
                    </div>
                    {m.id === user.id && <span style={{ color: T.t3, fontSize: 11, marginLeft: 'auto' }}>You</span>}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setShowCreate(false)} style={GH(T)}>Cancel</button>
              <button onClick={() => {
                if (!newG.name.trim()) return setCreateErr('Group name is required.')
                const allMembers = [...new Set([...newG.members, user.id])]
                onAddProject({ id: uid(), name: newG.name.trim(), desc: newG.desc, color: newG.color, members: allMembers })
                setShowCreate(false); setCreateErr(''); setNewG({ name: '', desc: '', color: '#58a6ff', members: [] })
              }} style={BT(T.acc)}>Create Group</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )

  // ── Selected group view ─────────────────────────────────────────────────
  const groupTasks = tasks.filter(t => t.groupId === selectedGroup.id)
  const canvas = groupCanvases?.[selectedGroup.id] || null
  const notes = groupNotes?.[selectedGroup.id] || ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
      {/* Group header */}
      <div style={{ background: T.bg2, borderBottom: `1px solid ${T.brd}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '8px 12px' : '10px 20px', flexWrap: 'wrap' }}>
          <button onClick={back} style={{ ...GH(T), padding: '5px 10px', fontSize: 12, flexShrink: 0 }}>← Back</button>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: selectedGroup.color || T.acc, flexShrink: 0 }} />
          <span className="fh-fraunces" style={{ color: T.t1, fontSize: isMobile ? 14 : 16, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedGroup.name}</span>
          {!isMobile && (
            <div style={{ display: 'flex', gap: -4 }}>
              {selectedGroup.members.filter(mid => canSeeMember(user, members.find(x => x.id === mid))).map(mid => {
                const m = members.find(x => x.id === mid)
                return m ? <Av key={mid} member={m} size={24} /> : null
              })}
            </div>
          )}
          <button onClick={() => setShowManage(true)} style={{ ...GH(T), fontSize: 11, padding: '4px 10px', flexShrink: 0 }}>
            + Members
          </button>
        </div>
        {/* Tab switcher — scrollable row */}
        <div style={{ display: 'flex', gap: 4, padding: isMobile ? '0 12px 8px' : '0 20px 8px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {[['board', '📋 Board'], ['whiteboard', '🖊️ Whiteboard'], ['notes', '📝 Notes'], ['materials', '📎 Materials']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              ...GH(T), background: tab === id ? `${T.acc}1a` : undefined,
              color: tab === id ? T.acc : T.t2, borderColor: tab === id ? T.acc : T.brd,
              fontSize: isMobile ? 11 : 12, padding: isMobile ? '4px 10px' : '5px 14px',
              whiteSpace: 'nowrap', flexShrink: 0
            }}>{label}</button>
          ))}
        </div>
      </div>

      {tab === 'board' && (
        <BoardPage
          title={selectedGroup.name}
          tasks={groupTasks}
          allTasks={tasks}
          members={visibleMembers}
          user={user}
          onAdd={t => onAdd({ ...t, type: 'group', groupId: selectedGroup.id })}
          onEdit={onEdit}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
          defaultType="group"
          onOpenCollab={onOpenCollab}
          taskNotes={taskNotes}
          onApprove={onApprove}
          onArchive={onArchive}
          categories={categories}
          onAddCategory={onAddCategory}
          onToggleTimer={onToggleTimer}
        />
      )}
      {tab === 'whiteboard' && (
        <GroupWhiteboard
          canvasData={canvas}
          onSave={data => onSaveCanvas(selectedGroup.id, data)}
          projectNotes={notes}
          onSaveNotes={text => onSaveNotes(selectedGroup.id, text)}
        />
      )}
      {tab === 'notes' && (
        <GroupNotesTab notes={notes} onSave={text => onSaveNotes(selectedGroup.id, text)} groupName={selectedGroup.name} />
      )}
      {tab === 'materials' && (
        <MaterialsTab
          materials={groupNotes?.[selectedGroup.id + '_materials'] || '[]'}
          onSave={data => onSaveNotes(selectedGroup.id + '_materials', data)}
          groupName={selectedGroup.name}
        />
      )}

      {showManage && (
        <Modal open onClose={() => setShowManage(false)} title={`Members — ${selectedGroup.name}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
            {visibleMembers.map(m => {
              const inGroup = selectedGroup.members.includes(m.id)
              return (
                <label key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  background: inGroup ? `${selectedGroup.color || T.acc}15` : T.bg3,
                  border: `1px solid ${inGroup ? (selectedGroup.color || T.acc) : T.brd}`,
                  borderRadius: 9, padding: '8px 12px', transition: 'all 0.15s'
                }}>
                  <input type="checkbox" checked={inGroup} disabled={m.id === user.id}
                    onChange={() => {
                      const newMembers = inGroup
                        ? selectedGroup.members.filter(x => x !== m.id)
                        : [...selectedGroup.members, m.id]
                      onAddProject({ ...selectedGroup, members: newMembers })
                      setSelectedGroup({ ...selectedGroup, members: newMembers })
                    }} />
                  <Av member={m} size={28} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: T.t1, fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                    <div style={{ color: T.t3, fontSize: 11 }}>{m.email}</div>
                  </div>
                  {m.id === user.id && <span style={{ color: T.t3, fontSize: 11 }}>You</span>}
                </label>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={() => setShowManage(false)} style={BT(T.acc)}>Done</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function GroupNotesTab({ notes, onSave, groupName }) {
  const { T } = useT()
  const [cat, setCat] = useState('meeting')
  const [saved, setSaved] = useState(true)
  const timerRef = useRef()

  const handleNoteChange = val => {
    onSave(cat, val)
    setSaved(false)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { setSaved(true) }, 800)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 22, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 4, background: T.bg3, padding: 3, borderRadius: 10 }}>
          {[['personal', '👤 Personal', T.acc], ['meeting', '🤝 Meeting', '#d29922'], ['lecture', '📚 Lecture', '#3fb950']].map(([k, l, c]) => (
            <button key={k} onClick={() => setCat(k)} style={{
              background: cat === k ? c : 'transparent',
              color: cat === k ? '#fff' : T.t2,
              border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
            }}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: saved ? T.grn : T.yl, fontWeight: 600 }}>{saved ? '✓ Saved' : '● Saving…'}</span>
          <button onClick={() => {
            const body = `## ${groupName} Notes: ${cat}\n\n${notes?.[cat] || ''}`
            const a = document.createElement('a'); a.href = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(body); a.download = `${groupName.toLowerCase()}-${cat}-notes.md`; a.click()
          }} style={{ ...GH(T), fontSize: 11, padding: '5px 12px' }}>Export .md</button>
        </div>
      </div>
      <textarea
        value={notes?.[cat] || ''}
        onChange={e => handleNoteChange(e.target.value)}
        placeholder={`Write ${groupName} ${cat} notes here…`}
        style={{
          flex: 1, background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 16,
          color: T.t1, fontSize: 15, padding: 24, resize: 'none', outline: 'none',
          fontFamily: 'inherit', lineHeight: 1.8, boxShadow: `inset 0 2px 10px ${T.shadow}`
        }}
      />
    </div>
  )
}

function PublicBoard({ tasks, members, user, onAdd, onEdit, onDelete, onStatusChange, onOpenCollab, taskNotes, onApprove, onArchive, categories, onAddCategory, onToggleTimer }) {
  return <BoardPage title="Public Board" tasks={tasks.filter(t => t.type === 'public' && !t.parentId && !t.archived)} allTasks={tasks} members={members}
    user={user} onAdd={t => onAdd({ ...t, type: 'public' })} onEdit={onEdit} onDelete={onDelete}
    onStatusChange={onStatusChange} defaultType="public" onOpenCollab={onOpenCollab} taskNotes={taskNotes}
    onApprove={onApprove} onArchive={onArchive} categories={categories} onAddCategory={onAddCategory} onToggleTimer={onToggleTimer} />
}
function AllTasks({ tasks, members, user, onAdd, onEdit, onDelete, onStatusChange, onOpenCollab, taskNotes, onApprove, onArchive, categories, onAddCategory, onToggleTimer }) {
  const visible = user?.role === 'admin'
    ? tasks.filter(t => !t.archived)
    : tasks.filter(t => !t.archived && (t.type !== 'private' || t.assignee === user?.id || t.createdBy === user?.id))
  return <BoardPage title="All Tasks" tasks={visible} allTasks={tasks} members={members} user={user}
    onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange}
    onOpenCollab={onOpenCollab} taskNotes={taskNotes}
    onApprove={onApprove} onArchive={onArchive} categories={categories} onAddCategory={onAddCategory} onToggleTimer={onToggleTimer} />
}

// ── WormChart ─────────────────────────────────────────────────────────────────
function WormChart({ tasks, members }) {
  const { T } = useT()
  const [anim, setAnim] = useState(0)
  useEffect(() => {
    let v = 0
    const id = setInterval(() => { v = Math.min(v + 0.018, 1); setAnim(v); if (v >= 1) clearInterval(id) }, 16)
    return () => clearInterval(id)
  }, [])

  const W = 680, H = 190, PAD_X = 34, PAD_TOP = 22, PAD_BOTTOM = 34
  const weekStart = new Date()
  const dayOfWeek = weekStart.getDay() || 7
  const todayIndex = dayOfWeek - 1
  weekStart.setHours(12, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - dayOfWeek + 1)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d
  })
  const chartMembers = (members || []).filter(m => tasks.some(t => t.assignee === m.id) || members.length <= 8).slice(0, 8)
  const lineColors = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#a371f7', '#39d353', '#ff7b72', '#ffa657']
  const series = chartMembers.map((m, memberIndex) => {
    const counts = days.map(d =>
      tasks.filter(t => {
        const rawDate = t.updatedAt || t.createdAt || t.created
        const td = rawDate ? new Date(rawDate) : null
        return t.assignee === m.id && t.status === 'done' && td && td.toDateString() === d.toDateString()
      }).length
    )
    return { member: m, color: lineColors[memberIndex % lineColors.length], counts }
  })
  const mx = Math.max(...series.flatMap(s => s.counts), 1)
  const getPoints = counts => counts.map((c, i) => ({
    x: PAD_X + i * ((W - PAD_X * 2) / 6),
    y: H - PAD_BOTTOM - (c / mx) * (H - PAD_TOP - PAD_BOTTOM)
  }))
  const interpolate = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  const getVisiblePoints = points => {
    const targetIndex = Math.min(todayIndex, points.length - 1)
    if (targetIndex <= 0) return [points[0]]
    const scaled = anim * targetIndex
    const whole = Math.floor(scaled)
    const frac = scaled - whole
    const visible = points.slice(0, Math.min(whole + 1, targetIndex + 1))
    if (whole < targetIndex) visible.push(interpolate(points[whole], points[whole + 1], frac))
    return visible
  }
  const pathFor = points => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const headAt = points => getVisiblePoints(points).at(-1) || points[0]

  if (!series.length) {
    return (
      <div style={{
        height: 190,
        border: `1px dashed ${T.brd}`,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: T.t3,
        fontSize: 13
      }}>
        No member activity for this view yet.
      </div>
    )
  }

  return (
    <div>
      <div style={{ position: 'relative', height: 210, overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
          {[0, 1, 2, 3].map(i => (
            <line key={i} x1={PAD_X} x2={W - PAD_X}
              y1={H - PAD_BOTTOM - i * (H - PAD_TOP - PAD_BOTTOM) / 3}
              y2={H - PAD_BOTTOM - i * (H - PAD_TOP - PAD_BOTTOM) / 3}
              stroke={T.brd} strokeWidth={0.7} strokeDasharray="4,5" />
          ))}
          {days.map((d, i) => {
            const x = PAD_X + i * ((W - PAD_X * 2) / 6)
            const isToday = i === todayIndex
            const isFuture = i > todayIndex
            return (
              <g key={d.toISOString()}>
                <line x1={x} x2={x} y1={PAD_TOP} y2={H - PAD_BOTTOM} stroke={isToday ? T.acc : T.brd} strokeWidth={isToday ? 1 : 0.45} opacity={isFuture ? 0.25 : 0.55} />
                <text x={x} y={H - 7} textAnchor="middle" fontSize={11} fill={isToday ? T.acc : T.t3} fontWeight={isToday ? 700 : 400} opacity={isFuture ? 0.55 : 1} fontFamily="Plus Jakarta Sans,sans-serif">
                  {d.toLocaleDateString('en', { weekday: 'short' })}
                </text>
              </g>
            )
          })}
          {series.map(s => {
            const points = getPoints(s.counts)
            const visible = getVisiblePoints(points)
            const path = pathFor(visible)
            return (
              <g key={s.member.id}>
                <path d={path} fill="none" stroke={s.color} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" opacity={0.16} />
                <path d={path} fill="none" stroke={s.color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
                {visible.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={2.8} fill={T.bg2} stroke={s.color} strokeWidth={1.6} />
                ))}
              </g>
            )
          })}
        </svg>
        {series.map(s => {
          const point = headAt(getPoints(s.counts))
          return (
            <div key={s.member.id} style={{
              position: 'absolute',
              left: `${point.x / W * 100}%`,
              top: `${point.y / H * 190}px`,
              transform: 'translate(-50%, -50%)',
              border: `2px solid ${s.color}`,
              borderRadius: '50%',
              boxShadow: `0 0 0 3px ${T.bg2}, 0 10px 24px ${T.shadow}`,
              transition: 'left 0.08s linear, top 0.08s linear',
              pointerEvents: 'none'
            }}>
              <Av member={s.member} size={30} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
        {series.map(s => (
          <div key={s.member.id} style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.t2, fontSize: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
            <span>{s.member.name.split(' ')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Overview ──────────────────────────────────────────────────────────────────
function Overview({ tasks, members, user, onlineTime, activeMembers }) {
  const { T, bp } = useT()
  const isMobile = bp === 'mobile'
  const [filterType, setFilterType] = useState('all')
  const [filterAssignee, setFilterAssignee] = useState('all')
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const visibleMembers = visibleMembersForUser(members, user)

  const filtered = tasks.filter(t => {
    if (t.parentId) return false
    const assigneeMember = t.assignee ? members.find(m => m.id === t.assignee) : null
    if (assigneeMember && !canSeeMember(user, assigneeMember)) return false
    if (filterType !== 'all' && t.type !== filterType) return false
    if (filterAssignee !== 'all' && t.assignee !== filterAssignee) return false
    return true
  })

  const done = filtered.filter(t => t.status === 'done').length
  const inProg = filtered.filter(t => t.status === 'inprogress').length
  const todo = filtered.filter(t => t.status === 'todo').length

  const board = [...visibleMembers].map(m => ({
    ...m,
    completed: filtered.filter(t => t.assignee === m.id && t.status === 'done').length,
    active: filtered.filter(t => t.assignee === m.id && t.status === 'inprogress').length,
  })).sort((a, b) => b.completed - a.completed)

  const activeFilters = filterType !== 'all' || filterAssignee !== 'all'

  return (
    <div style={{ padding: isMobile ? '14px 12px' : 26, overflowY: 'auto', flex: 1, paddingBottom: isMobile ? 80 : 26, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: isMobile ? 18 : 26 }}>
          Good {greeting}, {user?.name?.split(' ')[0]} 👋
        </h2>
        <p style={{ color: T.t2, fontSize: isMobile ? 11 : 13, marginTop: 4 }}>Here's what's happening today.</p>
      </div>

      {/* Inline filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Type toggles */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[['all', 'All'], ['private', '🔒 Private'], ['group', '👥 Group'], ['public', '🌐 Public']].map(([k, l]) => (
            <button key={k} onClick={() => setFilterType(k)} style={{
              background: filterType === k ? T.acc : T.bg2,
              border: `1px solid ${filterType === k ? T.acc : T.brd}`,
              color: filterType === k ? '#fff' : T.t2,
              padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
              fontSize: 12, fontWeight: filterType === k ? 600 : 400,
              fontFamily: "'Plus Jakarta Sans',sans-serif", whiteSpace: 'nowrap'
            }}>{l}</button>
          ))}
        </div>
        {/* Assignee dropdown */}
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={{
          ...IS(T), padding: '5px 10px', fontSize: 12, borderRadius: 20
        }}>
          <option value="all">All Members</option>
          {visibleMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {activeFilters && (
          <button onClick={() => { setFilterType('all'); setFilterAssignee('all') }} style={{
            ...GH(T), fontSize: 11, padding: '5px 10px', color: T.red, borderColor: T.red + '55', borderRadius: 20
          }}>✕ Clear</button>
        )}
      </div>

      {activeFilters && (
        <div style={{
          background: `${T.acc}0d`, border: `1px solid ${T.acc}33`, borderRadius: 8, padding: '7px 14px',
          fontSize: 12, color: T.acc, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8
        }}>
          ⚡ Showing filtered view
          {filterType !== 'all' && <span style={{ fontWeight: 700 }}>{filterType}</span>}
          {filterAssignee !== 'all' && <span>· {visibleMembers.find(m => m.id === filterAssignee)?.name}</span>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 24 }}>
        <Stat label="Tasks Done" value={done} icon="check" color={T.grn} />
        <Stat label="In Progress" value={inProg} icon="zap" color={T.yl} />
        <Stat label="To Do" value={todo} icon="task" color={T.acc} />
        <Stat label="Total Today" value={fmtS(onlineTime)} icon="timer" color={T.acc} />
      </div>

      {/* Chart + leaderboard: stacked on mobile, side-by-side on tablet+ */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 14, marginBottom: 24 }}>
        <div style={{ background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14, padding: 20 }}>
          <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 16, marginBottom: 16 }}>7-Day Team Worms</h3>
          <WormChart tasks={filtered} members={filterAssignee === 'all' ? visibleMembers : visibleMembers.filter(m => m.id === filterAssignee)} />
        </div>
        <div style={{ background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14, padding: 20 }}>
          <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 16, marginBottom: 16 }}>Leaderboard 🏆</h3>
          {board.map((m, i) => {
            const isActive = activeMembers.has(m.id)
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ color: i === 0 ? T.yl : T.t3, fontWeight: 700, fontSize: 14, width: 20, flexShrink: 0 }}>{i + 1}</span>
                <Av member={m} size={28} />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ color: T.t1, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name.split(' ')[0]}</div>
                    {/* Status indicator: green dot for active, red X for logged out */}
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: isActive ? T.grn : T.red,
                      flexShrink: 0,
                      boxShadow: isActive ? `0 0 8px ${T.grn}44` : `0 0 8px ${T.red}44`
                    }} />
                  </div>
                  <div style={{ color: T.t3, fontSize: 11 }}>{m.completed} done · {m.active} active</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function Chat({ messages, members, user, onSend, onDelete }) {
  const { T, bp } = useT()
  const isMobile = bp === 'mobile'
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState([])
  const [confirm, setConfirm] = useState(null)
  const endRef = useRef(null)
  const fileRef = useRef(null)
  const visibleMembers = visibleMembersForUser(members, user)

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages])

  const send = () => {
    if (!text.trim() && attachments.length === 0) return
    onSend({ id: uid(), userId: user.id, text: text.trim(), time: Date.now(), files: [...attachments] })
    setText(''); setAttachments([])
  }

  const pickFile = () => fileRef.current?.click()
  const onFileChange = e => {
    ;[...e.target.files].forEach(f => {
      const r = new FileReader()
      r.onload = ev => setAttachments(p => [...p, { name: f.name, size: f.size, type: f.type, data: ev.target.result }])
      r.readAsDataURL(f)
    })
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      overflow: 'hidden',
      paddingBottom: isMobile ? 72 : 0
    }}>
      {/* Messages */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobile ? '14px 12px 18px' : '18px 22px' }}>
        {messages.map(msg => {
          const sender = visibleMembers.find(m => m.id === msg.userId)
          const isMe = msg.userId === user?.id
          return (
            <div key={msg.id} style={{ display: 'flex', gap: 10, marginBottom: 18, flexDirection: isMe ? 'row-reverse' : 'row' }}>
              <Av member={sender} size={34} />
              <div style={{ maxWidth: isMobile ? '78%' : '68%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                  <span style={{ color: T.t1, fontSize: 12, fontWeight: 600 }}>{sender?.name}</span>
                  <span style={{ color: T.t3, fontSize: 11 }}>{new Date(msg.time).toLocaleTimeString()}</span>
                  {(isMe || user?.role === 'admin') && (
                    <button onClick={() => setConfirm(msg.id)} style={{ background: 'none', border: 'none', color: T.t3, cursor: 'pointer', padding: '2px', lineHeight: 1 }}>
                      <I n="trash" size={12} />
                    </button>
                  )}
                </div>
                {msg.text && (
                  <div style={{
                    background: isMe ? T.acc : T.bg2,
                    color: isMe ? '#fff' : T.t1,
                    borderRadius: isMe ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                    padding: '10px 14px', fontSize: 14, lineHeight: 1.55,
                    border: isMe ? 'none' : `1px solid ${T.brd}`
                  }}>{msg.text}</div>
                )}
                {msg.files?.map((f, i) => (
                  <div key={i} style={{
                    background: T.bg3, border: `1px solid ${T.brd}`, borderRadius: 8,
                    padding: '7px 12px', marginTop: 5, display: 'flex', alignItems: 'center', gap: 8
                  }}>
                    <I n="paper" size={13} color={T.acc} />
                    <span style={{ color: T.t1, fontSize: 12, flex: 1 }}>{f.name}</span>
                    <a href={f.data} download={f.name}>
                      <I n="download" size={13} color={T.acc} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Attachment tray */}
      {attachments.length > 0 && (
        <div style={{ padding: isMobile ? '8px 12px' : '8px 22px', borderTop: `1px solid ${T.brd}`, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {attachments.map((f, i) => (
            <div key={i} style={{ background: T.bg3, borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: T.t1 }}>{f.name}</span>
              <button onClick={() => setAttachments(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: T.t3, cursor: 'pointer', lineHeight: 1 }}>
                <I n="x" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: isMobile ? '10px 12px 12px' : '14px 22px',
        borderTop: `1px solid ${T.brd}`,
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
        background: T.bg,
        flexShrink: 0
      }}>
        <input type="file" ref={fileRef} onChange={onFileChange} multiple style={{ display: 'none' }} />
        <button onClick={pickFile} style={{ ...GH(T), padding: '8px 11px', lineHeight: 1 }}>
          <I n="paper" size={15} />
        </button>
        <input
          value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          placeholder="Message the team…" style={{ ...IS(T), flex: 1, minWidth: 0 }}
        />
        <button onClick={send} style={{ ...BT(T.acc), padding: isMobile ? '9px 12px' : '9px 18px', flexShrink: 0 }}>Send</button>
      </div>

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} msg="Delete this message permanently?"
        onOk={() => { onDelete(confirm); setConfirm(null) }} />
    </div>
  )
}

// ── Meetings ──────────────────────────────────────────────────────────────────
function Meetings({ meetings, user, members, onAdd, onDelete, onEdit, onJoinVideo }) {
  const { T, bp } = useT()
  const isMobile = bp === 'mobile'
  const isAdmin = user?.role === 'admin'
  const [showForm, setShowForm] = useState(false)
  const [editMeeting, setEditMeeting] = useState(null) // meeting being edited
  const [confirm, setConfirm] = useState(null)
  const blank = { title: '', time: '', duration: 60, link: '', invitees: [] }
  const [f, setF] = useState(blank)

  const openNew = () => { setF(blank); setEditMeeting(null); setShowForm(true) }
  const openEdit = (m) => { setF({ title: m.title, time: m.time, duration: m.duration, link: m.link || '', invitees: m.invitees || [] }); setEditMeeting(m); setShowForm(true) }
  const visibleMembers = visibleMembersForUser(members, user)
  const visibleMemberById = id => visibleMembers.find(m => m.id === id)

  const save = () => {
    if (!f.title || !f.time) return
    if (editMeeting) {
      onEdit({ ...editMeeting, ...f })
    } else {
      onAdd({ id: uid(), ...f, creator: user.id })
    }
    setF(blank); setShowForm(false); setEditMeeting(null)
  }

  const cancelMeeting = (m) => {
    onEdit({ ...m, cancelled: true })
  }
  const restoreMeeting = (m) => {
    onEdit({ ...m, cancelled: false })
  }

  // Show meeting if invitees is empty (everyone) OR user is in invitees OR user created it
  const visible = (isAdmin ? meetings : meetings.filter(m =>
    !m.invitees?.length || m.invitees.includes(user.id) || m.creator === user.id
  )).sort((a, b) => new Date(a.time) - new Date(b.time))

  const upcoming = visible.filter(m => !m.cancelled && new Date(m.time) >= new Date())
  const past = visible.filter(m => !m.cancelled && new Date(m.time) < new Date())
  const cancelled = visible.filter(m => m.cancelled)

  const MeetingCard = ({ m }) => {
    const creator = visibleMemberById(m.creator)
    const canManage = isAdmin || m.creator === user.id
    return (
      <div style={{
        background: T.bg2, border: `1px solid ${m.cancelled ? T.red + '55' : T.brd}`, borderRadius: 14,
        padding: isMobile ? 14 : 20, display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 12 : 16,
        opacity: m.cancelled ? 0.65 : 1
      }}>
        <div style={{
          width: 48, height: 48, background: m.cancelled ? `${T.red}1a` : `${T.acc}1a`, borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>
          <I n="timer" size={22} color={m.cancelled ? T.red : T.acc} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ color: T.t1, fontWeight: 600, fontSize: 15 }}>{m.title}</div>
            {m.cancelled && <span style={{
              background: `${T.red}18`, color: T.red, fontSize: 10, fontWeight: 700,
              padding: '2px 7px', borderRadius: 5
            }}>CANCELLED</span>}
          </div>
          <div style={{ color: T.t2, fontSize: 13, marginTop: 3 }}>
            {new Date(m.time).toLocaleString()} · {m.duration} min
            {creator && <span style={{ color: T.t3 }}> · by {creator.name.split(' ')[0]}</span>}
          </div>
          {m.link && (
            <a href={m.link} target="_blank" rel="noopener noreferrer" style={{ color: T.acc, fontSize: 12, marginTop: 4, display: 'block' }}>
              🔗 External link
            </a>
          )}
          {m.invitees?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
              <span style={{ color: T.t3, fontSize: 11 }}>Invited:</span>
              {m.invitees.filter(id => visibleMemberById(id)).slice(0, 5).map(id => {
                const mem = visibleMemberById(id)
                return mem ? <Av key={id} member={mem} size={20} /> : null
              })}
              {m.invitees.filter(id => visibleMemberById(id)).length > 5 && <span style={{ color: T.t3, fontSize: 11 }}>+{m.invitees.filter(id => visibleMemberById(id)).length - 5}</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
          {!m.cancelled && (
            <button onClick={() => onJoinVideo && onJoinVideo(m)} style={{
              ...BT(T.grn), display: 'flex', alignItems: 'center', gap: 6, fontSize: 13
            }}>
              📹 Join Video
            </button>
          )}
          {canManage && !m.cancelled && (
            <button onClick={() => openEdit(m)} style={{ ...GH(T), padding: '7px 10px', lineHeight: 1 }} title="Edit meeting">
              <I n="edit" size={14} color={T.acc} />
            </button>
          )}
          {canManage && !m.cancelled && (
            <button onClick={() => cancelMeeting(m)} style={{ ...GH(T), padding: '7px 10px', lineHeight: 1, borderColor: T.yl + '55' }} title="Cancel meeting">
              <span style={{ fontSize: 12, color: T.yl }}>✕</span>
            </button>
          )}
          {canManage && m.cancelled && (
            <button onClick={() => restoreMeeting(m)} style={{ ...GH(T), padding: '7px 10px', lineHeight: 1, borderColor: T.grn + '55', color: T.grn, fontSize: 12 }} title="Restore meeting">
              ↩ Restore
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setConfirm(m.id)} style={{ ...GH(T), padding: '7px 10px', lineHeight: 1 }}>
              <I n="trash" size={14} color={T.red} />
            </button>
          )}
        </div>
      </div>
    )
  }

  const Section = ({ label, items }) => items.length === 0 ? null : (
    <div style={{ marginBottom: 22 }}>
      <div style={{ color: T.t3, fontSize: 11, fontWeight: 700, letterSpacing: 0.7, marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(m => <MeetingCard key={m.id} m={m} />)}
      </div>
    </div>
  )

  return (
    <div style={{ padding: isMobile ? '14px 12px' : 26, overflowY: 'auto', flex: 1, paddingBottom: isMobile ? 76 : 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 14 : 22, gap: 10 }}>
        <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: isMobile ? 18 : 22 }}>Meetings</h2>
        <button onClick={openNew} style={{ ...BT(T.acc), display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: isMobile ? 12 : 14, padding: isMobile ? '7px 12px' : '8px 16px' }}>
          <I n="plus" size={13} /> {isMobile ? 'Schedule' : 'Schedule Meeting'}
        </button>
      </div>

      {visible.length === 0 && (
        <div style={{ color: T.t3, textAlign: 'center', padding: '70px 0', fontSize: 14 }}>No meetings scheduled</div>
      )}

      <Section label="UPCOMING" items={upcoming} />
      <Section label="PAST" items={past} />
      <Section label="CANCELLED" items={cancelled} />

      {showForm && (
        <Modal open title={editMeeting ? 'Edit Meeting' : 'Schedule Meeting'} onClose={() => { setShowForm(false); setEditMeeting(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input placeholder="Meeting title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} style={IS(T)} autoFocus />
            <input type="datetime-local" value={f.time} onChange={e => setF({ ...f, time: e.target.value })} style={IS(T)} />
            <input type="number" placeholder="Duration (minutes)" value={f.duration} onChange={e => setF({ ...f, duration: +e.target.value })} style={IS(T)} />
            <input placeholder="Meeting link (optional)" value={f.link} onChange={e => setF({ ...f, link: e.target.value })} style={IS(T)} />
            <div>
              <div style={{ color: T.t2, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Invite specific people (leave unchecked = everyone):</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 160, overflowY: 'auto' }}>
                {visibleMembers.filter(m => m.id !== user.id).map(m => (
                  <label key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
                    background: f.invitees.includes(m.id) ? `${T.acc}10` : T.bg3,
                    border: `1px solid ${f.invitees.includes(m.id) ? T.acc : T.brd}`,
                    borderRadius: 8, padding: '7px 12px'
                  }}>
                    <input type="checkbox" checked={f.invitees.includes(m.id)}
                      onChange={() => setF(prev => ({
                        ...prev, invitees: prev.invitees.includes(m.id)
                          ? prev.invitees.filter(x => x !== m.id)
                          : [...prev.invitees, m.id]
                      }))} />
                    <Av member={m} size={22} />
                    <span style={{ color: T.t1, fontSize: 13 }}>{m.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => { setShowForm(false); setEditMeeting(null) }} style={GH(T)}>Cancel</button>
              <button onClick={save} style={BT(T.acc)}>{editMeeting ? 'Save Changes' : 'Schedule'}</button>
            </div>
          </div>
        </Modal>
      )}

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} msg="Remove this meeting permanently?"
        onOk={() => { onDelete(confirm); setConfirm(null) }} okLabel="Remove" okColor={T.red} />
    </div>
  )
}

// ── Peer Rewards — XP + peer badges ──────────────────────────────────────────
// XP: completed task story points * 2, review approval=5, peer reward received=15
// Auto tiers: Bronze(0–49) Silver(50–149) Gold(150–299) Platinum(300+)
const XP_TIERS = [
  { name: 'Bronze', min: 0, max: 49, color: '#cd7f32', emoji: '🥉' },
  { name: 'Silver', min: 50, max: 149, color: '#c0c0c0', emoji: '🥈' },
  { name: 'Gold', min: 150, max: 299, color: '#ffd700', emoji: '🥇' },
  { name: 'Platinum', min: 300, max: Infinity, color: '#58a6ff', emoji: '💎' },
]
const getTier = xp => XP_TIERS.find(t => xp >= t.min && xp <= t.max) || XP_TIERS[0]
const TASK_XP_PER_SP = 2
const getTaskXP = task => Math.max(0, task?.storyPoints || 0) * TASK_XP_PER_SP
// Fibonacci reward point values — like story points, 1 pt = one unit of recognition
const REWARD_POINTS = [1, 2, 3, 5, 8, 13, 21]

function PeerRewards({ rewards, members, user, onAdd, onDelete, tasks, timeLogs, focusResetAt }) {
  const { T, bp } = useT()
  const isMobile = bp === 'mobile'
  const [showForm, setShowForm] = useState(false)
  const [toId, setToId] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [points, setPoints] = useState(5)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('leaderboard')
  const [badge, setBadge] = useState('⭐')

  const BADGES = ['⭐', '🏆', '🎖️', '🔥', '💡', '🚀', '👏', '💎', '🎯', '⚡']

  // XP uses r.points (Fibonacci); legacy entries without points default to 15
  const getBaseXP = (memberId) => {
    const tasksXP = (tasks || []).reduce((s, t) => (
      t.assignee === memberId && t.status === 'done' && !t.archived ? s + getTaskXP(t) : s
    ), 0)
    const approvalXP = (tasks || []).reduce((s, t) => s + ((t.approvals || []).includes(memberId) ? 5 : 0), 0)
    const rewardXP = (rewards || []).reduce((s, r) => r.toId === memberId ? s + (r.points || 15) : s, 0)
    return tasksXP + approvalXP + rewardXP
  }
  const getXP = (memberId) => Math.max(0, getBaseXP(memberId) - getProductivityAdjustment(timeLogs, memberId, focusResetAt).penalty)

  const visibleMembers = visibleMembersForUser(members, user)
  const visibleMemberById = id => visibleMembers.find(m => m.id === id)
  const leaderboard = [...visibleMembers].map(m => ({ ...m, xp: getXP(m.id) })).sort((a, b) => b.xp - a.xp)

  const myXP = getXP(user.id)
  const myAdjustment = getProductivityAdjustment(timeLogs, user.id, focusResetAt)
  const myTier = getTier(myXP)
  const nextTier = XP_TIERS[XP_TIERS.indexOf(myTier) + 1]
  const xpToNext = nextTier ? nextTier.min - myXP : null
  const myReceived = (rewards || []).filter(r => r.toId === user.id)
  const myGiven = (rewards || []).filter(r => r.fromId === user.id)

  const save = () => {
    if (!toId) return setErr('Select a recipient.')
    if (!title.trim()) return setErr('Enter a title.')
    if (toId === user.id) return setErr("You can't reward yourself.")
    onAdd({ id: uid(), fromId: user.id, toId, title: title.trim(), message: message.trim(), badge, points, date: Date.now() })
    setToId(''); setTitle(''); setMessage(''); setBadge('⭐'); setPoints(5); setErr(''); setShowForm(false)
  }

  const ptLabel = {
    1: 'Small acknowledgement', 2: 'Good effort', 3: 'Nice contribution',
    5: 'Solid work', 8: 'Great impact', 13: 'Outstanding contribution', 21: '⭐ Exceptional — above and beyond'
  }

  return (
    <div style={{ padding: isMobile ? '14px 12px' : 26, overflowY: 'auto', flex: 1, paddingBottom: isMobile ? 76 : 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: isMobile ? 18 : 22 }}>Rewards & XP</h2>
          <p style={{ color: T.t2, fontSize: isMobile ? 11 : 13, marginTop: 3 }}>Earn XP completing tasks and receiving peer recognition.</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ ...BT(T.acc), display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: isMobile ? 12 : 14, padding: isMobile ? '7px 12px' : '8px 16px' }}>
          <I n="plus" size={13} /> Give Reward
        </button>
      </div>

      {/* My XP card */}
      <div style={{ background: T.bg2, border: `2px solid ${myTier.color}55`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 40 }}>{myTier.emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ color: myTier.color, fontSize: 22, fontWeight: 800 }}>{myXP} XP</span>
              <span style={{ color: T.t2, fontSize: 13 }}>{myTier.name} Tier</span>
            </div>
            <div style={{ marginTop: 8, background: T.bg3, borderRadius: 6, height: 8, maxWidth: 360 }}>
              <div style={{
                height: '100%', borderRadius: 6,
                background: `linear-gradient(90deg, ${myTier.color}, ${nextTier?.color || myTier.color})`,
                width: nextTier ? `${Math.min(100, (myXP - myTier.min) / (nextTier.min - myTier.min) * 100)}%` : '100%',
                transition: 'width 0.5s'
              }} />
            </div>
            {xpToNext && <div style={{ color: T.t3, fontSize: 11, marginTop: 4 }}>{xpToNext} XP to {nextTier.emoji} {nextTier.name}</div>}
            {myAdjustment.penalty > 0 && (
              <div style={{ color: T.red, fontSize: 11, marginTop: 4 }}>
                -{myAdjustment.penalty} XP focus adjustment ({myAdjustment.breakViolations} break, {myAdjustment.idleViolations} idle)
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 16, textAlign: 'center' }}>
            <div>
              <div style={{ color: T.grn, fontSize: 18, fontWeight: 700 }}>{(tasks || []).filter(t => t.assignee === user.id && t.status === 'done').length}</div>
              <div style={{ color: T.t3, fontSize: 10 }}>Tasks Done</div>
            </div>
            <div>
              <div style={{ color: T.yl, fontSize: 18, fontWeight: 700 }}>{myReceived.length}</div>
              <div style={{ color: T.t3, fontSize: 10 }}>Rewards Received</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {[['leaderboard', '🏆 Leaderboard'], ['received', '📥 My Rewards'], ['given', '📤 Given']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            ...GH(T), background: tab === id ? `${T.acc}1a` : undefined,
            color: tab === id ? T.acc : T.t2, borderColor: tab === id ? T.acc : T.brd, fontSize: 12
          }}>{label}</button>
        ))}
      </div>

      {tab === 'leaderboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {leaderboard.map((m, i) => {
            const tier = getTier(m.xp)
            const adjustment = getProductivityAdjustment(timeLogs, m.id, focusResetAt)
            const tasksDone = (tasks || []).filter(t => t.assignee === m.id && t.status === 'done').length
            const rewardsCount = (rewards || []).filter(r => r.toId === m.id).length
            return (
              <div key={m.id} style={{
                background: T.bg2, border: `1px solid ${i === 0 ? tier.color + '66' : T.brd}`,
                borderRadius: 14, padding: isMobile ? 14 : 18, display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 14
              }}>
                <div style={{ fontSize: 22, width: 32, textAlign: 'center', flexShrink: 0 }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </div>
                <Av member={m} size={40} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: T.t1, fontWeight: 700, fontSize: 14 }}>{m.name}</span>
                    <span style={{ color: tier.color, fontSize: 12 }}>{tier.emoji} {tier.name}</span>
                  </div>
                  <div style={{ background: T.bg3, borderRadius: 4, height: 5, marginTop: 6, maxWidth: 200 }}>
                    <div style={{
                      height: '100%', borderRadius: 4, background: tier.color,
                      width: `${Math.min(100, m.xp / 300 * 100)}%`
                    }} />
                  </div>
                  {adjustment.penalty > 0 && <div style={{ color: T.red, fontSize: 10, marginTop: 4 }}>Focus -{adjustment.penalty} XP</div>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, textAlign: 'center', flexShrink: 0 }}>
                  <div>
                    <div style={{ color: tier.color, fontSize: 18, fontWeight: 700 }}>{m.xp}</div>
                    <div style={{ color: T.t3, fontSize: 10 }}>XP</div>
                  </div>
                  <div>
                    <div style={{ color: T.grn, fontSize: 18, fontWeight: 700 }}>{tasksDone}</div>
                    <div style={{ color: T.t3, fontSize: 10 }}>Done</div>
                  </div>
                  <div>
                    <div style={{ color: T.yl, fontSize: 18, fontWeight: 700 }}>{rewardsCount}</div>
                    <div style={{ color: T.t3, fontSize: 10 }}>Rewards</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(tab === 'received' || tab === 'given') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(tab === 'received' ? myReceived : myGiven).length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: T.t3 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏅</div>
              <div>{tab === 'received' ? 'No rewards received yet.' : 'No rewards given yet.'}</div>
            </div>
          )}
          {(tab === 'received' ? myReceived : myGiven).map(r => {
            const other = visibleMemberById(tab === 'received' ? r.fromId : r.toId)
            const pts = r.points || 15
            return (
              <div key={r.id} style={{
                background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14,
                padding: 20, display: 'flex', gap: 14, borderLeft: `4px solid ${T.yl}`
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <div style={{ fontSize: 28 }}>{r.badge || '⭐'}</div>
                  <div style={{
                    background: `${T.acc}18`, color: T.acc, fontSize: 11, fontWeight: 800,
                    padding: '2px 8px', borderRadius: 20, border: `1px solid ${T.acc}33`
                  }}>
                    +{pts} XP
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: T.t1, fontWeight: 700, fontSize: 15 }}>{r.title}</div>
                  {r.message && <div style={{ color: T.t2, fontSize: 13, marginTop: 4 }}>{r.message}</div>}
                  <div style={{ color: T.t3, fontSize: 11, marginTop: 6 }}>
                    {tab === 'received' ? `From ${other?.name || 'someone'}` : `To ${other?.name || 'someone'}`}
                    {' · '}{new Date(r.date).toLocaleDateString()}
                  </div>
                </div>
                {other && <Av member={other} size={36} />}
                {(user.role === 'admin' || r.fromId === user.id) && (
                  <button onClick={() => onDelete(r.id)}
                    style={{ ...GH(T), padding: '5px 9px', borderColor: T.red + '55', color: T.red, alignSelf: 'flex-start' }}>
                    <I n="trash" size={13} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <Modal open onClose={() => { setShowForm(false); setErr('') }} title="Give a Reward" width={500}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {err && <div style={{
              background: `${T.red}1a`, border: `1px solid ${T.red}44`, borderRadius: 8,
              padding: '9px 13px', color: T.red, fontSize: 13
            }}>{err}</div>}

            {/* Badge picker */}
            <div>
              <div style={{ color: T.t2, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>CHOOSE BADGE</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {BADGES.map(b => (
                  <button key={b} onClick={() => setBadge(b)} style={{
                    fontSize: 20, background: badge === b ? `${T.acc}20` : 'transparent',
                    border: `2px solid ${badge === b ? T.acc : T.brd}`, borderRadius: 9,
                    padding: '5px 9px', cursor: 'pointer', transition: 'all 0.15s'
                  }}>{b}</button>
                ))}
              </div>
            </div>

            {/* Fibonacci point selector — exactly like Story Points */}
            <div style={{ background: T.bg3, border: `1px solid ${T.brd}`, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ color: T.t2, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                REWARD POINTS <span style={{ color: T.t3, fontWeight: 400 }}>(XP added to recipient)</span>
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 8 }}>
                {REWARD_POINTS.map(pt => (
                  <button key={pt} onClick={() => setPoints(pt)} style={{
                    background: points === pt ? T.acc : T.bg2,
                    border: `1px solid ${points === pt ? T.acc : T.brd}`,
                    borderRadius: 8, color: points === pt ? '#fff' : T.t2,
                    padding: '6px 14px', cursor: 'pointer', fontSize: 16, fontWeight: 700,
                    fontFamily: "'Plus Jakarta Sans',sans-serif", minWidth: 46, textAlign: 'center'
                  }}>{pt}</button>
                ))}
              </div>
              <div style={{ color: T.t3, fontSize: 11 }}>
                {ptLabel[points] || ''}{' · '}
                <span style={{ color: T.acc, fontWeight: 700 }}>+{points} XP</span> to recipient
              </div>
            </div>

            <select value={toId} onChange={e => { setToId(e.target.value); setErr('') }} style={IS(T)}>
              <option value="">Select recipient...</option>
              {visibleMembers.filter(m => m.id !== user.id).map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <input placeholder="Reward title (e.g. 'Best Team Player')" value={title}
              onChange={e => { setTitle(e.target.value); setErr('') }} style={IS(T)} autoFocus />
            <textarea placeholder="Personal message (optional)…" value={message}
              onChange={e => setMessage(e.target.value)} style={{ ...IS(T), height: 80, resize: 'none' }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => { setShowForm(false); setErr('') }} style={GH(T)}>Cancel</button>
              <button onClick={save} style={BT(T.acc)}>Give Reward (+{points} XP)</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}


// ── Time Log Dashboard ────────────────────────────────────────────────────────
function TimeLog({ timeLogs, members, user, onUpdate, tasks, currentTimeState, currentSessionId, currentSessionStart }) {
  const { T, bp } = useT()
  const isMobile = bp === 'mobile'
  const isAdmin = user?.role === 'admin'
  const TIME_LOG_DISPLAY_DAYS = 7
  const [view, setView] = useState('sessions') // 'sessions' | 'weekly'
  const [weekFilter, setWeekFilter] = useState('all')      // all | memberId
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [manForm, setManForm] = useState({ date: new Date().toISOString().slice(0, 10), hours: 0, minutes: 0, note: '' })
  const [manErr, setManErr] = useState('')
  const [editEntry, setEditEntry] = useState(null)
  const [editHours, setEditHours] = useState(0)
  const [editMins, setEditMins] = useState(0)
  const [editErr, setEditErr] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [openPreviewDate, setOpenPreviewDate] = useState(null)
  const [adminSessionDate, setAdminSessionDate] = useState(new Date().toISOString().slice(0, 10))
  const [adminSessionUser, setAdminSessionUser] = useState('all')
  const visibleMembers = visibleMembersForUser(members, user)

  const DAY_CAP = PRODUCTIVE_LIMIT_SECS // 9 hours productive ceiling per member per day
  const todayKey = new Date().toISOString().slice(0, 10)
  const currentSessionSeconds = totalTimeStateSeconds(currentTimeState || EMPTY_TIME_STATE)

  // Admins see every log; members do not see admin logs.
  const visibleRawLogs = (timeLogs || []).filter(l => {
    const member = members.find(m => m.id === l.userId)
    return !member || canSeeMember(user, member)
  })
  let allLogs = visibleRawLogs.map(l => {
    if (!currentSessionId || l.id !== currentSessionId || l.manual) return l
    return {
      ...l,
      seconds: currentSessionSeconds,
      taskSeconds: currentTimeState?.task || 0,
      breakSeconds: currentTimeState?.break || 0,
      idleSeconds: currentTimeState?.idle || 0,
      loginAt: l.loginAt || currentSessionStart,
    }
  })
  if (user && currentSessionId && currentSessionSeconds > 0 && !allLogs.some(l => l.id === currentSessionId)) {
    allLogs = [...allLogs, {
      id: currentSessionId,
      userId: user.id,
      date: todayKey,
      seconds: currentSessionSeconds,
      taskSeconds: currentTimeState?.task || 0,
      breakSeconds: currentTimeState?.break || 0,
      idleSeconds: currentTimeState?.idle || 0,
      loginAt: currentSessionStart,
    }]
  }
  allLogs = canonicalizeSessionLogs(allLogs)

  const logWindowStart = new Date(`${todayKey}T12:00:00`)
  logWindowStart.setDate(logWindowStart.getDate() - 6)
  const logWindowStartKey = logWindowStart.toISOString().slice(0, 10)
  const isInOneWeekLogWindow = date => !!date && date >= logWindowStartKey && date <= todayKey
  const oneWeekLogs = allLogs.filter(l => isInOneWeekLogWindow(l.date))

  // Group by date for the main day-total log view.
  const dayRowMap = new Map()
  oneWeekLogs.forEach(l => {
    const key = `${l.date || ''}__${l.userId || ''}`
    const existing = dayRowMap.get(key) || { id: `day-${key}`, date: l.date, userId: l.userId, sourceLogs: [] }
    existing.sourceLogs.push(l)
    dayRowMap.set(key, existing)
  })
  const dayRows = [...dayRowMap.values()].map(row => {
    const sourceLogs = row.sourceLogs
    const state = sumTimeStates(sourceLogs.map(getLogDisplayTimeState))
    const total = getLogsTotalSeconds(sourceLogs)
    const firstLogin = sourceLogs
      .filter(l => l.loginAt)
      .sort((a, b) => a.loginAt - b.loginAt)[0]?.loginAt || null
    const lastLogout = sourceLogs
      .filter(l => l.logoutAt)
      .sort((a, b) => b.logoutAt - a.logoutAt)[0]?.logoutAt || null
    const hasRunningSession = sourceLogs.some(l => !l.manual && !l.logoutAt)
    return {
      ...row,
      dailyTotal: true,
      seconds: total,
      taskSeconds: state.task,
      breakSeconds: state.break,
      idleSeconds: state.idle,
      loginAt: firstLogin,
      logoutAt: hasRunningSession ? null : lastLogout,
      manual: sourceLogs.every(l => l.manual),
      note: sourceLogs.some(l => l.manual) ? 'Daily total' : '',
    }
  })
  const byDate = {}
  dayRows.forEach(l => {
    if (!byDate[l.date]) byDate[l.date] = []
    byDate[l.date].push(l)
  })
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a)).slice(0, TIME_LOG_DISPLAY_DAYS)
  const getMember = id => members.find(m => m.id === id)
  const ownLogsByDate = {}
  oneWeekLogs
    .filter(l => l.userId === user.id && !l.manual)
    .forEach(l => {
      if (!ownLogsByDate[l.date]) ownLogsByDate[l.date] = []
      ownLogsByDate[l.date].push(l)
    })
  const ownPreviewDates = Object.keys(ownLogsByDate).sort((a, b) => b.localeCompare(a)).slice(0, TIME_LOG_DISPLAY_DAYS)
  const adminSessionLogs = allLogs
    .filter(l => !l.manual && l.date === adminSessionDate && (adminSessionUser === 'all' || l.userId === adminSessionUser))
    .sort((a, b) => {
      const userSort = (getMember(a.userId)?.name || '').localeCompare(getMember(b.userId)?.name || '')
      if (userSort !== 0) return userSort
      return (a.loginAt || 0) - (b.loginAt || 0)
    })
  const adminSessionTotal = getLogsTotalSeconds(adminSessionLogs)

  const totalToday = () => getLogsTotalSeconds(allLogs.filter(l => l.userId === user.id && l.date === todayKey))
  const weekTotal = () => {
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000
    return getLogsTotalSeconds(allLogs.filter(l => l.userId === user.id && new Date(l.date).getTime() >= cutoff))
  }
  const getLogSeconds = getLogTotalSeconds
  const getCurrentUserDayTotals = date => {
    const userLogs = allLogs.filter(l => l.userId === user.id && l.date === date)
    const raw = sumTimeStates(userLogs.map(getLogDisplayTimeState))
    const normalized = normalizeDayTimeState(raw)
    return { ...normalized, total: getLogsTotalSeconds(userLogs) }
  }

  const getTeamDayTotal = date => {
    const otherMembersTotal = allLogs
      .filter(l => l.date === date && l.userId !== user.id)
      .reduce((s, l) => s + getLogSeconds(l), 0)
    return otherMembersTotal + getCurrentUserDayTotals(date).total
  }

  // Returns how many seconds this user has already logged on a given date
  // (excluding a specific entry, for the edit-case)
  const dayTotal = (userId, date, excludeEntry = null) =>
    allLogs.filter(l => l.userId === userId && l.date === date && l !== excludeEntry)
      .reduce((s, l) => s + getLogTotalSeconds(l), 0)
  const dayProductiveTotal = (userId, date, excludeEntry = null) =>
    allLogs.filter(l => l.userId === userId && l.date === date && l !== excludeEntry)
      .reduce((s, l) => s + getLogDisplayTimeState(l).task, 0)

  const submitManualAdd = () => {
    setManErr('')
    const secs = (parseInt(manForm.hours) || 0) * 3600 + (parseInt(manForm.minutes) || 0) * 60
    if (secs <= 0) return setManErr('Enter a duration greater than 0.')
    const existing = dayProductiveTotal(user.id, manForm.date)
    if (existing >= DAY_CAP) {
      return setManErr(`You've already logged 9h on this date — the daily limit. Delete or edit an existing entry first.`)
    }
    const allowed = DAY_CAP - existing
    const finalSecs = Math.min(secs, allowed)
    const wasCapped = finalSecs < secs
    onUpdate([...(timeLogs || []), {
      id: uid(), userId: user.id, date: manForm.date, seconds: finalSecs,
      taskSeconds: finalSecs, breakSeconds: 0, idleSeconds: 0,
      manual: true, note: (manForm.note.trim() || '') + (wasCapped ? ` [capped to ${Math.floor(finalSecs / 3600)}h${Math.floor((finalSecs % 3600) / 60)}m — 9h daily limit]` : ''),
      loginAt: null, logoutAt: null
    }])
    setManForm({ date: new Date().toISOString().slice(0, 10), hours: 0, minutes: 0, note: '' })
    setManErr('')
    setShowManualAdd(false)
  }

  const openEdit = l => {
    setEditEntry(l)
    const total = getLogTotalSeconds(l)
    setEditHours(Math.floor(total / 3600))
    setEditMins(Math.floor((total % 3600) / 60))
    setEditErr('')
  }

  const saveEdit = () => {
    setEditErr('')
    const newSecs = editHours * 3600 + editMins * 60
    if (newSecs <= 0) return setEditErr('Duration must be greater than 0.')
    if (editEntry.dailyTotal) {
      const sourceLogs = editEntry.sourceLogs || []
      const baseLogs = sourceLogs.filter(l => !l.dailyAdjustment)
      const baseTotal = getLogsTotalSeconds(baseLogs)
      if (newSecs < baseTotal) {
        const h = Math.floor(baseTotal / 3600), m = Math.floor((baseTotal % 3600) / 60)
        return setEditErr(`Daily total cannot be less than the sum of session time (${h}h ${m}m). Edit/delete the sessions first.`)
      }
      const adjustmentSeconds = newSecs - baseTotal
      const existingAdjustment = (timeLogs || []).find(l => l.userId === editEntry.userId && l.date === editEntry.date && l.dailyAdjustment)
      let updatedLogs = (timeLogs || []).filter(l => !(l.userId === editEntry.userId && l.date === editEntry.date && l.dailyAdjustment))
      if (adjustmentSeconds > 0) {
        const adjustment = {
          ...(existingAdjustment || {}),
          id: existingAdjustment?.id || uid(),
          userId: editEntry.userId,
          date: editEntry.date,
          seconds: adjustmentSeconds,
          taskSeconds: 0,
          breakSeconds: 0,
          idleSeconds: adjustmentSeconds,
          manual: true,
          dailyAdjustment: true,
          note: 'Daily total adjustment',
          loginAt: null,
          logoutAt: null,
        }
        updatedLogs = [...updatedLogs, adjustment]
      }
      onUpdate(updatedLogs)
      setEditEntry(null)
      return
    }
    const split = distributeEditedTime(editEntry, newSecs)
    const sourceIds = new Set((editEntry.sourceLogs || []).map(l => l.id).filter(Boolean))
    const existingOther = allLogs
      .filter(l => l.userId === editEntry.userId && l.date === editEntry.date && l !== editEntry && !sourceIds.has(l.id))
      .reduce((s, l) => s + getLogDisplayTimeState(l).task, 0)
    const allowed = Math.max(0, DAY_CAP - existingOther)
    if (split.task > allowed) {
      const remH = Math.floor(allowed / 3600), remM = Math.floor((allowed % 3600) / 60)
      return setEditErr(`Productive time for this day would exceed 9h. Max productivity you can set here: ${remH}h ${remM}m.`)
    }
    const sourceLogs = editEntry.sourceLogs || []
    const primary = sourceLogs[0] || editEntry
    const updatedEntry = {
      ...primary,
      id: primary.id || editEntry.id || uid(),
      userId: editEntry.userId,
      date: editEntry.date,
      seconds: newSecs,
      taskSeconds: split.task,
      breakSeconds: split.break,
      idleSeconds: split.idle,
      loginAt: editEntry.loginAt || primary.loginAt || null,
      logoutAt: editEntry.logoutAt || primary.logoutAt || null,
    }
    const updatedLogs = (timeLogs || []).filter(l => {
      if (sourceIds.size && sourceIds.has(l.id)) return false
      return !(l === editEntry || (l.id && editEntry.id && l.id === editEntry.id))
    })
    onUpdate([...updatedLogs, updatedEntry])
    setEditEntry(null)
  }

  const deleteEntry = l => {
    if (l.dailyTotal) {
      const ids = new Set((l.sourceLogs || []).map(x => x.id).filter(Boolean))
      onUpdate((timeLogs || []).filter(x => !(ids.has(x.id) || (x.userId === l.userId && x.date === l.date && !x.id))))
      setConfirm(null)
      return
    }
    const sourceIds = new Set((l.sourceLogs || []).map(x => x.id).filter(Boolean))
    onUpdate((timeLogs || []).filter(x => {
      if (sourceIds.size && sourceIds.has(x.id)) return false
      return !(x === l || (x.id && l.id && x.id === l.id))
    }))
    setConfirm(null)
  }
  const canEditEntry = l => isAdmin || (l.userId === user.id)

  // Remaining seconds the current user can still log today
  const remainingToday = Math.max(0, DAY_CAP - dayProductiveTotal(user.id, todayKey))

  // ── Weekly view helpers (inlined — NOT a nested component, avoids remount bug) ──
  const today = new Date()
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - 6)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
  const filteredMembers = weekFilter === 'all' ? visibleMembers : visibleMembers.filter(m => m.id === weekFilter)
  const maxSecs = 10 * 3600

  return (
    <div style={{ padding: isMobile ? '14px 12px' : 26, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: isMobile ? 80 : 26 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: isMobile ? 18 : 22 }}>Time Log</h2>
          <p style={{ color: T.t2, fontSize: isMobile ? 11 : 13, marginTop: 2 }}>All members' work sessions — your own are editable.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: isMobile ? '100%' : undefined }}>
          {/* View toggle pills */}
          <div style={{ display: 'flex', background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 20, overflow: 'hidden', flex: isMobile ? 1 : undefined }}>
            {[['sessions', '📋 Sessions'], ['weekly', '📊 Weekly']].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} style={{
                background: view === k ? T.acc : 'transparent', border: 'none',
                color: view === k ? '#fff' : T.t2,
                padding: '6px 14px', cursor: 'pointer', fontSize: 12,
                fontWeight: view === k ? 600 : 400,
                fontFamily: "'Plus Jakarta Sans',sans-serif", whiteSpace: 'nowrap',
                flex: isMobile ? 1 : undefined
              }}>{l}</button>
            ))}
          </div>
          <button onClick={() => setShowManualAdd(true)} style={{ ...BT(T.acc), display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: isMobile ? 12 : 13, padding: isMobile ? '6px 10px' : '8px 16px' }}>
            <I n="plus" size={isMobile ? 11 : 13} /> {isMobile ? 'Log' : 'Log Time'}
          </button>
        </div>
      </div>

      {/* Stats row */}
      {(() => {
        const todayStr2 = new Date().toISOString().slice(0, 10)
        const dayTotals = getCurrentUserDayTotals(todayStr2)
        const totalSecs = dayTotals.total
        const taskSecs  = dayTotals.task
        const breakSecs = dayTotals.break
        const idleSecs  = dayTotals.idle
        const teamSecs  = getTeamDayTotal(todayStr2)
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginBottom: 22, marginTop: 16 }}>
            {[
              { label: 'TOTAL TODAY',  val: fmtS(totalSecs),  color: T.acc },
              { label: 'PRODUCTIVE',   val: fmtS(taskSecs),   color: T.grn },
              { label: 'BREAK TIME',   val: fmtS(breakSecs),  color: T.yl  },
              { label: 'NO TASK (IDLE)',val: fmtS(idleSecs),  color: T.red || '#f85149' },
              { label: 'TEAM TODAY',   val: fmtS(teamSecs),   color: T.t1  },
            ].map(s => (
              <div key={s.label} style={{ background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14, padding: 18 }}>
                <div style={{ color: T.t3, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>{s.label}</div>
                <div style={{ color: s.color, fontSize: 20, fontWeight: 700 }}>{s.val}</div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── Daily Task Summary ── */}
      {(() => {
        const todayStr = new Date().toISOString().slice(0, 10)
        const myTasks = (tasks || []).filter(t =>
          t.assignee === user?.id &&
          t.startedDate === todayStr &&
          t.status !== 'archived'
        )
        if (!myTasks.length) return null

        const GOAL_SECS = PRODUCTIVE_GOAL_SECS
        const BREAK_CAP = BREAK_LIMIT_SECS
        const dayTotals = getCurrentUserDayTotals(todayStr)

        const nowTs = Date.now()
        const totalProductiveSecs = dayTotals.task
        const totalBreakSecs = dayTotals.break

        const productivePct = Math.min(100, totalProductiveSecs / GOAL_SECS * 100)
        const breakPct = Math.min(100, totalBreakSecs / BREAK_CAP * 100)
        const breakOver = totalBreakSecs > BREAK_CAP
        const remaining = Math.max(0, GOAL_SECS - totalProductiveSecs)

        return (
          <div style={{ background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14, padding: 20, marginBottom: 22 }}>
            <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 15, marginBottom: 16 }}>Today's Shift Summary</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 18 }}>
              {[
                { label: 'PRODUCTIVE', val: fmtS(totalProductiveSecs), color: T.grn },
                { label: 'BREAK TIME', val: fmtS(totalBreakSecs), color: breakOver ? T.red || '#f85149' : T.yl },
                { label: 'REMAINING GOAL', val: remaining > 0 ? fmtS(remaining) : '✓ Done', color: remaining > 0 ? T.t2 : T.grn },
                { label: 'TASKS ACTIVE', val: myTasks.length, color: T.acc },
              ].map(s => (
                <div key={s.label} style={{ background: T.bg3, border: `1px solid ${T.brd}`, borderRadius: 10, padding: 14 }}>
                  <div style={{ color: T.t3, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ color: s.color, fontSize: 20, fontWeight: 700 }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Productive time bar */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: T.t2, fontSize: 11, fontWeight: 600 }}>Productive time — goal 7h</span>
                <span style={{ color: T.grn, fontSize: 11, fontWeight: 700 }}>{Math.round(productivePct)}%</span>
              </div>
              <div style={{ background: T.bg3, borderRadius: 6, height: 8, overflow: 'hidden' }}>
                <div style={{ width: `${productivePct}%`, height: '100%', background: T.grn, borderRadius: 6, transition: 'width 1s linear' }} />
              </div>
            </div>

            {/* Break time bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: T.t2, fontSize: 11, fontWeight: 600 }}>Break time — budget 1h</span>
                <span style={{ color: breakOver ? T.red || '#f85149' : T.yl, fontSize: 11, fontWeight: 700 }}>
                  {breakOver ? `⚠ ${fmtS(totalBreakSecs - BREAK_CAP)} over` : `${fmtS(Math.max(0, BREAK_CAP - totalBreakSecs))} left`}
                </span>
              </div>
              <div style={{ background: T.bg3, borderRadius: 6, height: 8, overflow: 'hidden' }}>
                <div style={{ width: `${breakPct}%`, height: '100%', background: breakOver ? T.red || '#f85149' : T.yl, borderRadius: 6, transition: 'width 1s linear' }} />
              </div>
            </div>

            {/* Task breakdown */}
            <div style={{ marginTop: 16 }}>
              {myTasks.map(t => {
                const activeEl = t.timerState === 'running' ? Math.floor((nowTs - (t.lastStartedAt || nowTs)) / 1000) : 0
                const prodSecs = (t.accumulatedTime || 0) + activeEl
                const estSecs = SP_HOURS(t.storyPoints || 0) * 3600
                const overTime = estSecs > 0 && prodSecs > estSecs
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: `1px solid ${T.brd}` }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.timerState === 'running' ? T.grn : t.timerState === 'paused' ? T.yl : T.t3, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: T.t1, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                      {t.storyPoints > 0 && <div style={{ color: T.t3, fontSize: 10 }}>SP {t.storyPoints} · {SP_HOURS(t.storyPoints)}h est.</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ color: overTime ? T.red || '#f85149' : T.grn, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtS(prodSecs)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── Weekly view — inlined JSX (not an inner component) to prevent remount on filter change ── */}
      {view === 'weekly' && (
        <div style={{ display: 'grid', gridTemplateColumns: isAdmin && !isMobile ? 'minmax(0,1fr) 360px' : '1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14, padding: isMobile ? 14 : 20, overflowX: 'visible' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 16 }}>Weekly Presence</h3>
            <select
              value={weekFilter}
              onChange={e => setWeekFilter(e.target.value)}
              style={{ ...IS(T), width: isMobile ? '100%' : 'auto', padding: '5px 10px', fontSize: 12 }}
            >
              <option value="all">All Members</option>
              {visibleMembers.map(m => <option key={m.id} value={m.id}>{m.name.split(' ')[0]}</option>)}
            </select>
          </div>

          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredMembers.map(m => {
                const daySessions = weekDays.map(d => allLogs.filter(l => l.userId === m.id && l.date === d))
                const weekSecs = daySessions.reduce((sum, sessions) => sum + getLogsTotalSeconds(sessions), 0)
                return (
                  <div key={m.id} style={{ background: T.bg3, border: `1px solid ${T.brd}`, borderRadius: 12, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <Av member={m} size={26} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: T.t1, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name.split(' ')[0]}</div>
                        <div style={{ color: T.t3, fontSize: 11 }}>{fmtS(weekSecs)} this week</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {weekDays.map((d, i) => {
                        const dt = new Date(d + 'T12:00')
                        const sessions = daySessions[i]
                        const secs = getLogsTotalSeconds(sessions)
                        const dayState = sumTimeStates(sessions.map(getLogDisplayTimeState))
                        const taskSecs = dayState.task
                        const breakSecs = dayState.break
                        const idleSecs = dayState.idle
                        const cappedSecs = Math.min(secs, DAY_CAP)
                        const isOverCap = secs > DAY_CAP
                        const totalPct = Math.min(100, cappedSecs / DAY_CAP * 100)
                        const taskPct = secs > 0 ? Math.min(100, taskSecs / Math.max(secs, 1) * 100) : 0
                        const breakPct = secs > 0 ? Math.min(100, breakSecs / Math.max(secs, 1) * 100) : 0
                        const idlePct = secs > 0 ? Math.min(100, idleSecs / Math.max(secs, 1) * 100) : 0
                        const isToday = d === today.toISOString().slice(0, 10)
                        return (
                          <div key={d} style={{ display: 'grid', gridTemplateColumns: '54px 1fr auto', alignItems: 'center', gap: 8 }}>
                            <div style={{ color: isToday ? T.acc : T.t2, fontSize: 11, fontWeight: isToday ? 700 : 600 }}>
                              {dt.toLocaleDateString('en', { weekday: 'short' })}
                              <div style={{ color: isToday ? T.acc : T.t3, fontSize: 10 }}>{dt.getDate()}</div>
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ height: 8, background: T.bg2, border: `1px solid ${isOverCap ? T.red || '#f85149' : T.brd}`, borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
                                {secs > 0 ? (
                                  <>
                                    <div style={{ width: `${taskPct}%`, background: T.grn }} />
                                    <div style={{ width: `${breakPct}%`, background: T.yl }} />
                                    <div style={{ width: `${idlePct}%`, background: T.red || '#f85149' }} />
                                  </>
                                ) : (
                                  <div style={{ width: '100%', background: 'transparent' }} />
                                )}
                              </div>
                              <div style={{ height: 3, marginTop: 3, background: T.bg2, borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ width: `${totalPct}%`, height: '100%', background: isOverCap ? T.red || '#f85149' : T.acc }} />
                              </div>
                            </div>
                            <div style={{ color: secs > 0 ? T.t1 : T.t3, fontSize: 11, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {secs > 0 ? fmtS(cappedSecs) : '0:00'}{isOverCap ? '!' : ''}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              <div style={{ color: T.t3, fontSize: 11, lineHeight: 1.5 }}>
                Bar colors: productive, break, idle. Thin blue bar shows progress toward the 9h daily cap.
              </div>
            </div>
          ) : (
            <div>
              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
                <div />
                {weekDays.map(d => {
                  const dt = new Date(d + 'T12:00')
                  const isToday = d === today.toISOString().slice(0, 10)
                  return (
                    <div key={d} style={{ textAlign: 'center' }}>
                      <div style={{ color: isToday ? T.acc : T.t3, fontSize: 10, fontWeight: isToday ? 700 : 400 }}>
                        {dt.toLocaleDateString('en', { weekday: 'short' })}
                      </div>
                      <div style={{ color: isToday ? T.acc : T.t2, fontSize: 12, fontWeight: isToday ? 700 : 400 }}>
                        {dt.getDate()}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Member rows */}
              {filteredMembers.map(m => {
                const dayTotals = weekDays.map(d => getLogsTotalSeconds(allLogs.filter(l => l.userId === m.id && l.date === d)))
                const weekSecs = dayTotals.reduce((s, x) => s + x, 0)
                const daySessions = weekDays.map(d => allLogs.filter(l => l.userId === m.id && l.date === d))
                return (
                  <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '120px repeat(7,1fr)', gap: 4, marginBottom: 8, alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Av member={m} size={22} />
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ color: T.t1, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name.split(' ')[0]}</div>
                        <div style={{ color: T.t3, fontSize: 10 }}>{fmtS(weekSecs)}</div>
                      </div>
                    </div>
                    {weekDays.map((d, i) => {
                      const sessions = daySessions[i]
                      const secs      = dayTotals[i]
                      const dayState = sumTimeStates(sessions.map(getLogDisplayTimeState))
                      const taskSecs  = dayState.task
                      const breakSecs = dayState.break
                      const idleSecs  = dayState.idle
                      const cappedSecs = Math.min(secs, DAY_CAP)
                      const isOverCap  = secs > DAY_CAP
                      const firstLogin = sessions.find(s => s.loginAt)?.loginAt
                      const lastLogout = sessions.find(s => s.logoutAt)?.logoutAt
                      const taskPct  = Math.min(100, taskSecs  / maxSecs * 100)
                      const breakPct = Math.min(100, breakSecs / maxSecs * 100)
                      const idlePct  = Math.min(100, idleSecs  / maxSecs * 100)
                      const tip = secs > 0
                        ? `${fmtS(cappedSecs)}${isOverCap ? ' (capped 9h)' : ''} · 🟢 ${fmtS(taskSecs)} productive · 🟡 ${fmtS(breakSecs)} break · 🔴 ${fmtS(idleSecs)} idle${firstLogin ? ' · In: ' + new Date(firstLogin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}${lastLogout ? ' · Out: ' + new Date(lastLogout).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`
                        : 'No sessions'
                      return (
                        <div key={d} title={tip} style={{
                          height: 32, background: T.bg3, borderRadius: 6, overflow: 'hidden',
                          position: 'relative', cursor: secs > 0 ? 'help' : 'default',
                          outline: isOverCap ? `1px solid ${T.red || '#f85149'}` : 'none'
                        }}>
                          {idlePct > 0 && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${idlePct}%`, background: T.red || '#f85149', minHeight: 2 }} />}
                          {breakPct > 0 && <div style={{ position: 'absolute', bottom: `${idlePct}%`, left: 0, right: 0, height: `${breakPct}%`, background: T.yl, minHeight: 2 }} />}
                          {taskPct  > 0 && <div style={{ position: 'absolute', bottom: `${idlePct + breakPct}%`, left: 0, right: 0, height: `${taskPct}%`, background: T.grn, minHeight: 2 }} />}
                          {secs > 0 && (
                            <div style={{
                              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                              justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 700,
                              textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                            }}>
                              {Math.round(cappedSecs / 3600 * 10) / 10}h{isOverCap ? '⚠' : ''}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              <div style={{ color: T.t3, fontSize: 11, marginTop: 8 }}>
                Bars: 🔵 &lt;3h · 🟡 3–6h · 🟢 6h+. Max bar = 9h. 🔴 Over daily limit.
              </div>
            </div>
          )}
        </div>
        {isAdmin && (
          <div style={{ background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14, padding: isMobile ? 14 : 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 16 }}>Session Times</h3>
              <span style={{ color: T.acc, fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtS(adminSessionTotal)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr', gap: 8, marginBottom: 12 }}>
              <input
                type="date"
                value={adminSessionDate}
                onChange={e => setAdminSessionDate(e.target.value)}
                style={{ ...IS(T), padding: '7px 10px', fontSize: 12 }}
              />
              <select
                value={adminSessionUser}
                onChange={e => setAdminSessionUser(e.target.value)}
                style={{ ...IS(T), padding: '7px 10px', fontSize: 12 }}
              >
                <option value="all">All users</option>
                {visibleMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            {adminSessionLogs.length === 0 ? (
              <div style={{ color: T.t3, fontSize: 12, padding: '18px 0', textAlign: 'center' }}>No sessions for this filter.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: isMobile ? 'none' : 460, overflowY: isMobile ? 'visible' : 'auto', paddingRight: isMobile ? 0 : 2 }}>
                {adminSessionLogs.map(l => {
                  const m = getMember(l.userId)
                  const state = getLogDisplayTimeState(l)
                  return (
                    <div key={l.id || `${l.userId}-${l.loginAt}`} style={{ background: T.bg3, border: `1px solid ${T.brd}`, borderRadius: 10, padding: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                        {m && <Av member={m} size={24} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: T.t1, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m?.name || 'Unknown'}</div>
                          <div style={{ color: T.t3, fontSize: 10 }}>
                            {l.loginAt ? `In ${new Date(l.loginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'In --:--'}
                            {l.logoutAt ? ` · Out ${new Date(l.logoutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' · Running'}
                          </div>
                        </div>
                        <div style={{ color: T.acc, fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtS(getLogTotalSeconds(l))}</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr) auto', gap: 7, alignItems: 'center' }}>
                        {[
                          { label: 'Prod', val: state.task, color: T.grn },
                          { label: 'Break', val: state.break, color: T.yl },
                          { label: 'Idle', val: state.idle, color: T.red || '#f85149' },
                        ].map(s => (
                          <div key={s.label}>
                            <div style={{ color: T.t3, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
                            <div style={{ color: s.color, fontSize: 11, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtS(s.val)}</div>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 3 }}>
                          <button onClick={() => openEdit(l)} title="Edit session" style={{ background: 'none', border: 'none', color: T.acc, cursor: 'pointer', padding: 3 }}><I n="edit" size={13} /></button>
                          <button onClick={() => setConfirm(l)} title="Delete session" style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', padding: 3 }}><I n="trash" size={13} /></button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
        </div>
      )}

      {view === 'sessions' && <>
        {ownPreviewDates.length > 0 && (
          <div style={{ background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14, padding: isMobile ? 12 : 16, marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 16 }}>Session Preview</h3>
              <span style={{ color: T.t3, fontSize: 11, fontWeight: 700 }}>{ownPreviewDates.length} days</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
              {ownPreviewDates.map(date => {
                const sessions = ownLogsByDate[date]
                const rawDay = sumTimeStates(sessions.map(getLogDisplayTimeState))
                const daySummary = normalizeDayTimeState(rawDay)
                const isOpen = openPreviewDate === date
                return (
                  <button key={date} onClick={() => setOpenPreviewDate(isOpen ? null : date)} style={{
                    textAlign: 'left',
                    background: isOpen ? `${T.acc}12` : T.bg3,
                    border: `1px solid ${isOpen ? T.acc : T.brd}`,
                    borderRadius: 10,
                    padding: 12,
                    cursor: 'pointer',
                    color: T.t1,
                    fontFamily: "'Plus Jakarta Sans', sans-serif"
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 9 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: T.t1, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </div>
                        <div style={{ color: T.t3, fontSize: 11 }}>{sessions.length} session{sessions.length === 1 ? '' : 's'}</div>
                      </div>
                      <div style={{ color: T.acc, fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtS(getLogsTotalSeconds(sessions))}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
                      {[
                        { label: 'Prod', val: daySummary.task, color: T.grn },
                        { label: 'Break', val: daySummary.break, color: T.yl },
                        { label: 'Idle', val: daySummary.idle, color: T.red || '#f85149' },
                      ].map(s => (
                        <div key={s.label}>
                          <div style={{ color: T.t3, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
                          <div style={{ color: s.color, fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtS(s.val)}</div>
                        </div>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
            {openPreviewDate && ownLogsByDate[openPreviewDate] && (
              <div style={{ marginTop: 12, borderTop: `1px solid ${T.brd}`, paddingTop: 12 }}>
                <div style={{ color: T.t2, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  {new Date(openPreviewDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {ownLogsByDate[openPreviewDate].map((l, i) => {
                    const state = getLogDisplayTimeState(l)
                    return (
                      <div key={l.id || i} style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : `1.1fr repeat(4,auto)${isAdmin ? ' auto' : ''}`,
                        gap: isMobile ? 5 : 12,
                        alignItems: 'center',
                        background: T.bg3,
                        border: `1px solid ${T.brd}`,
                        borderRadius: 8,
                        padding: '9px 11px'
                      }}>
                        <div style={{ color: T.t2, fontSize: 11 }}>
                          {l.manual ? (l.note || 'Manual log') : (
                            <>
                              {l.loginAt ? `In ${new Date(l.loginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'In --:--'}
                              {l.logoutAt ? ` · Out ${new Date(l.logoutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' · Running'}
                            </>
                          )}
                        </div>
                        {[
                          { label: 'Total', val: getLogTotalSeconds(l), color: T.acc },
                          { label: 'Prod', val: state.task, color: T.grn },
                          { label: 'Break', val: state.break, color: T.yl },
                          { label: 'Idle', val: state.idle, color: T.red || '#f85149' },
                        ].map(s => (
                          <div key={s.label} style={{ textAlign: isMobile ? 'left' : 'right' }}>
                            <span style={{ color: T.t3, fontSize: 10, fontWeight: 700, marginRight: 5 }}>{s.label}</span>
                            <span style={{ color: s.color, fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtS(s.val)}</span>
                          </div>
                        ))}
                        {isAdmin && (
                          <div style={{ display: 'flex', justifyContent: isMobile ? 'flex-start' : 'flex-end', gap: 3 }}>
                            <button onClick={() => openEdit(l)} title="Edit session" style={{ background: 'none', border: 'none', color: T.acc, cursor: 'pointer', padding: 3 }}><I n="edit" size={13} /></button>
                            <button onClick={() => setConfirm(l)} title="Delete session" style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', padding: 3 }}><I n="trash" size={13} /></button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        {dates.length === 0 && (
          <div style={{ textAlign: 'center', padding: '70px 0', color: T.t3 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏱️</div>
            <div>No sessions logged yet.</div>
          </div>
        )}
        {dates.map(date => (
          <div key={date} style={{ marginBottom: 20 }}>
            <div style={{ color: T.t2, fontSize: 12, fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>
              {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              <span style={{ color: T.t3, fontWeight: 400, marginLeft: 12, fontSize: 11 }}>
                {fmtS(getLogsTotalSeconds(byDate[date]))} total
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {byDate[date].map((l, i) => {
                const m = getMember(l.userId)
                const isOwn = l.userId === user.id
                // Per-member day total for this date
                const memberDayTotal = byDate[date].filter(x => x.userId === l.userId).reduce((s, x) => s + getLogDisplayTimeState(x).task, 0)
                const isOverLimit = memberDayTotal > DAY_CAP
                const state = getLogDisplayTimeState(l)
                const sessionSeconds = getLogTotalSeconds(l)
                return (
                  <div key={i} style={{
                    background: T.bg2,
                    border: `1px solid ${isOverLimit && isOwn ? T.red + '66' : l.manual ? T.acc + '44' : T.brd}`,
                    borderRadius: 12, padding: isMobile ? '12px 12px' : '12px 16px', display: 'flex', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 14,
                    flexDirection: isMobile ? 'column' : 'row'
                  }}>
                    {m && <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <Av member={m} size={isMobile ? 28 : 32} />
                      <div style={{ width: isMobile ? 'auto' : 110, flexShrink: 0, minWidth: 0 }}>
                        <div style={{ color: T.t1, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name.split(' ')[0]}</div>
                        <div style={{ color: T.t3, fontSize: 10, textTransform: 'capitalize' }}>{m.role}</div>
                      </div>
                    </div>}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: T.acc, fontSize: 18, fontWeight: 700 }}>{fmtS(sessionSeconds)}</span>
                        {l.manual && <span style={{
                          background: `${T.acc}18`, color: T.acc,
                          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4
                        }}>MANUAL</span>}
                        {isOverLimit && <span style={{
                          background: `${T.red}18`, color: T.red,
                          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4
                        }}>⚠️ OVER 9H</span>}
                      </div>
                      <div style={{ color: T.t3, fontSize: 11, marginTop: 2 }}>
                        {l.manual ? (l.note || 'Manually logged')
                          : <>
                            {l.loginAt && `In: ${new Date(l.loginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                            {l.logoutAt && ` · Out: ${new Date(l.logoutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                            {!l.loginAt && !l.logoutAt && 'Session (no timestamps)'}
                            {l.taskSeconds !== undefined && (
                              <span style={{ marginLeft: 8 }}>
                                <span style={{ color: T.grn, fontWeight: 600 }}>Tasks: {fmtS(state.task)}</span>
                                {' · '}
                                <span style={{ color: T.yl, fontWeight: 600 }}>Break: {fmtS(state.break)}</span>
                                {' · '}
                                <span style={{ color: T.red || '#f85149', fontWeight: 600 }}>Idle: {fmtS(state.idle)}</span>
                              </span>
                            )}
                          </>
                        }
                      </div>
                    </div>
                    <div style={{ width: isMobile ? '100%' : 120, height: 8, background: T.bg3, borderRadius: 4, flexShrink: 0, display: 'flex', overflow: 'hidden', border: `1px solid ${T.brd}` }}>
                      {l.taskSeconds !== undefined ? (
                        <>
                          <div style={{ height: '100%', background: T.grn, width: `${Math.min(100, state.task / (9 * 3600) * 100)}%` }} title={`Productive Task Time: ${fmtS(state.task)}`} />
                          <div style={{ height: '100%', background: T.yl, width: `${Math.min(100, state.break / (9 * 3600) * 100)}%` }} title={`Break Time: ${fmtS(state.break)}`} />
                          <div style={{ height: '100%', background: T.red || '#f85149', width: `${Math.min(100, state.idle / (9 * 3600) * 100)}%` }} title={`Idle Time: ${fmtS(state.idle)}`} />
                        </>
                      ) : (
                        <div style={{ height: '100%', background: T.acc, width: `${Math.min(100, sessionSeconds / (9 * 3600) * 100)}%` }} />
                      )}
                    </div>
                    <div style={{ color: T.t3, fontSize: 11, minWidth: 36, textAlign: isMobile ? 'left' : 'right' }}>
                      {Math.round(sessionSeconds / 3600 * 10) / 10}h
                    </div>
                    {canEditEntry(l) && (
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button onClick={() => openEdit(l)} style={{ background: 'none', border: 'none', color: T.acc, cursor: 'pointer', padding: '3px' }}><I n="edit" size={13} /></button>
                        <button onClick={() => setConfirm(l)} style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', padding: '3px' }}><I n="trash" size={13} /></button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </>}

      {/* Manual add modal */}
      {showManualAdd && (
        <Modal open onClose={() => { setShowManualAdd(false); setManErr('') }} title="Log Time Manually" width={400}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Remaining today indicator */}
            <div style={{
              background: remainingToday > 0 ? `${T.acc}0d` : `${T.red}0d`,
              border: `1px solid ${remainingToday > 0 ? T.acc : T.red}33`,
              borderRadius: 8, padding: '9px 13px',
              color: remainingToday > 0 ? T.acc : T.red, fontSize: 12
            }}>
              {remainingToday > 0
                ? `You can log up to ${Math.floor(remainingToday / 3600)}h ${Math.floor((remainingToday % 3600) / 60)}m more today (9h daily cap).`
                : `You've reached the 9h daily limit for today. Edit or delete an existing entry to make room.`
              }
            </div>
            {manErr && (
              <div style={{
                background: `${T.red}15`, border: `1px solid ${T.red}44`, borderRadius: 8,
                padding: '9px 13px', color: T.red, fontSize: 12
              }}>{manErr}</div>
            )}
            <div>
              <label style={{ color: T.t2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>DATE</label>
              <input type="date" value={manForm.date}
                onChange={e => { setManForm({ ...manForm, date: e.target.value }); setManErr('') }} style={IS(T)} />
              {/* Show remaining for selected date */}
              {(() => {
                const selExisting = dayProductiveTotal(user.id, manForm.date)
                const selRemaining = Math.max(0, DAY_CAP - selExisting)
                if (manForm.date !== new Date().toISOString().slice(0, 10)) return (
                  <div style={{ color: selRemaining > 0 ? T.t3 : T.red, fontSize: 11, marginTop: 5 }}>
                    {selRemaining > 0
                      ? `${Math.floor(selRemaining / 3600)}h ${Math.floor((selRemaining % 3600) / 60)}m available on this date`
                      : '9h already logged on this date'}
                  </div>
                )
              })()}
            </div>
            <div>
              <label style={{ color: T.t2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>DURATION</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <input type="number" min={0} max={9} placeholder="0" value={manForm.hours || ''}
                    onChange={e => { setManForm({ ...manForm, hours: Math.min(9, +e.target.value) }); setManErr('') }}
                    style={{ ...IS(T), width: 70 }} />
                  <span style={{ color: T.t2, fontSize: 13 }}>h</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <input type="number" min={0} max={59} placeholder="0" value={manForm.minutes || ''}
                    onChange={e => { setManForm({ ...manForm, minutes: +e.target.value }); setManErr('') }}
                    style={{ ...IS(T), width: 70 }} />
                  <span style={{ color: T.t2, fontSize: 13 }}>min</span>
                </div>
              </div>
            </div>
            <div>
              <label style={{ color: T.t2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>NOTE <span style={{ color: T.t3, fontWeight: 400 }}>(optional)</span></label>
              <input placeholder="e.g. Remote work, client visit…" value={manForm.note}
                onChange={e => setManForm({ ...manForm, note: e.target.value })} style={IS(T)} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => { setShowManualAdd(false); setManErr('') }} style={GH(T)}>Cancel</button>
              <button onClick={submitManualAdd} style={BT(T.acc)}>Add Log</button>
            </div>
          </div>
        </Modal>
      )}

      {editEntry && (
        <Modal open onClose={() => { setEditEntry(null); setEditErr('') }} title="Edit Time Entry" width={360}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ color: T.t2, fontSize: 13 }}>
              {new Date(editEntry.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              {editEntry.manual && <span style={{ color: T.acc, marginLeft: 8, fontSize: 11, fontWeight: 700 }}>MANUAL</span>}
            </div>
            {/* Show how much headroom exists */}
            {(() => {
              const othersTotal = dayProductiveTotal(editEntry.userId, editEntry.date, editEntry)
              const headroom = Math.max(0, DAY_CAP - othersTotal)
              return (
                <div style={{ background: `${T.bg3}`, border: `1px solid ${T.brd}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: T.t3 }}>
                  Max allowed for this entry: <strong style={{ color: T.t1 }}>{Math.floor(headroom / 3600)}h {Math.floor((headroom % 3600) / 60)}m</strong> (9h/day cap)
                </div>
              )
            })()}
            {editErr && (
              <div style={{
                background: `${T.red}15`, border: `1px solid ${T.red}44`, borderRadius: 8,
                padding: '9px 13px', color: T.red, fontSize: 12
              }}>{editErr}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <input type="number" min={0} max={9} value={editHours}
                  onChange={e => { setEditHours(Math.min(9, +e.target.value)); setEditErr('') }} style={{ ...IS(T), width: 70 }} />
                <span style={{ color: T.t2, fontSize: 13 }}>h</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <input type="number" min={0} max={59} value={editMins}
                  onChange={e => { setEditMins(+e.target.value); setEditErr('') }} style={{ ...IS(T), width: 70 }} />
                <span style={{ color: T.t2, fontSize: 13 }}>min</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => { setEditEntry(null); setEditErr('') }} style={GH(T)}>Cancel</button>
              <button onClick={saveEdit} style={BT(T.acc)}>Save</button>
            </div>
          </div>
        </Modal>
      )}

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} msg="Delete this time log entry?"
        onOk={() => deleteEntry(confirm)} />
    </div>
  )
}

// ── Awards ────────────────────────────────────────────────────────────────────
function Awards({ tasks, members, user, onResetPoints, rewards, timeLogs, focusResetAt }) {
  const { T, bp } = useT()
  const isMobile = bp === 'mobile'
  const [confirm, setConfirm] = useState(false)
  const [sortBy, setSortBy] = useState('xp') // 'xp' | 'done'
  const isAdmin = user?.role === 'admin'
  const visibleMembers = visibleMembersForUser(members, user)

  // Mirror the same XP formula from PeerRewards so numbers match everywhere
  const getBaseXP = (memberId) => {
    const tasksXP = (tasks || []).reduce((s, t) => (
      t.assignee === memberId && t.status === 'done' && !t.archived ? s + getTaskXP(t) : s
    ), 0)
    const approvalXP = (tasks || []).reduce((s, t) => s + ((t.approvals || []).includes(memberId) ? 5 : 0), 0)
    const rewardXP = (rewards || []).reduce((s, r) => r.toId === memberId ? s + (r.points || 15) : s, 0)
    return tasksXP + approvalXP + rewardXP
  }
  const getXP = (memberId) => Math.max(0, getBaseXP(memberId) - getProductivityAdjustment(timeLogs, memberId, focusResetAt).penalty)

  const stats = [...visibleMembers].map(m => ({
    ...m,
    xp: getXP(m.id),
    completed: (tasks || []).filter(t => t.assignee === m.id && t.status === 'done' && !t.archived).length,
    active: (tasks || []).filter(t => t.assignee === m.id && t.status === 'inprogress').length,
    total: (tasks || []).filter(t => t.assignee === m.id && !t.archived).length,
    rewardsReceived: (rewards || []).filter(r => r.toId === m.id).length,
  })).sort((a, b) => sortBy === 'xp' ? b.xp - a.xp : b.completed - a.completed)

  const MEDALS = ['🥇', '🥈', '🥉']
  const maxXP = Math.max(...stats.map(s => s.xp), 1)

  return (
    <div style={{ padding: isMobile ? '14px 12px' : 26, overflowY: 'auto', flex: 1, paddingBottom: isMobile ? 76 : 26 }}>
      <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', marginBottom: isMobile ? 16 : 22, flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: isMobile ? 18 : 22 }}>Awards &amp; Leaderboard</h2>
          <p style={{ color: T.t2, fontSize: isMobile ? 11 : 13, marginTop: 3, lineHeight: 1.45 }}>Total points earned = story points (2 XP/SP) + approvals (×5) + peer rewards</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 8, overflow: 'hidden', flex: isMobile ? 1 : undefined }}>
            {[['xp', '⚡ By XP'], ['done', '✅ By Tasks Done']].map(([k, l]) => (
              <button key={k} onClick={() => setSortBy(k)} style={{
                background: sortBy === k ? T.acc : 'transparent', border: 'none',
                color: sortBy === k ? '#fff' : T.t2, padding: '5px 13px', cursor: 'pointer', fontSize: 12,
                fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: sortBy === k ? 600 : 400,
                flex: isMobile ? 1 : undefined, whiteSpace: 'nowrap'
              }}>{l}</button>
            ))}
          </div>
          {isAdmin && (
            <button onClick={() => setConfirm(true)} style={{ ...BT(T.red), display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
              <I n="trash" size={13} /> Reset
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {stats.map((m, i) => {
          const tier = getTier(m.xp)
          const adjustment = getProductivityAdjustment(timeLogs, m.id, focusResetAt)
          const pct = Math.min(100, m.xp / maxXP * 100)
          return (
            <div key={m.id} style={{
              background: T.bg2,
              border: `1px solid ${i === 0 ? T.yl : T.brd}`,
              borderRadius: 14, padding: isMobile ? '14px 14px' : '18px 20px',
              boxShadow: i === 0 ? `0 0 0 1px ${T.yl}22, 0 4px 24px ${T.yl}0a` : undefined
            }}>
              <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 12 : 14, flexDirection: isMobile ? 'column' : 'row' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: isMobile ? 22 : 28, width: isMobile ? 28 : 36, textAlign: 'center', flexShrink: 0 }}>
                  {MEDALS[i] || `#${i + 1}`}
                </div>
                <Av member={m} size={isMobile ? 34 : 42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: T.t1, fontWeight: 700, fontSize: isMobile ? 13 : 15, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                    <span style={{ color: tier.color, fontSize: 12, fontWeight: 600 }}>{tier.emoji} {tier.name}</span>
                  </div>
                  {/* XP progress bar */}
                  <div style={{ background: T.bg3, borderRadius: 5, height: 6, marginTop: 7, maxWidth: isMobile ? '100%' : 300 }}>
                    <div style={{
                      height: '100%', borderRadius: 5, background: tier.color,
                      width: `${pct}%`, transition: 'width 0.6s ease'
                    }} />
                  </div>
                  {adjustment.penalty > 0 && <div style={{ color: T.red, fontSize: 10, marginTop: 4 }}>Focus -{adjustment.penalty} XP</div>}
                </div>
                </div>
                {/* Stats grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: isMobile ? 8 : 14, textAlign: 'center', flexShrink: 0, width: isMobile ? '100%' : undefined }}>
                  <div>
                    <div style={{ color: tier.color, fontSize: isMobile ? 16 : 20, fontWeight: 800 }}>{m.xp}</div>
                    <div style={{ color: T.t3, fontSize: 10, fontWeight: 600 }}>XP</div>
                  </div>
                  <div>
                    <div style={{ color: T.grn, fontSize: isMobile ? 16 : 20, fontWeight: 700 }}>{m.completed}</div>
                    <div style={{ color: T.t3, fontSize: 10 }}>Done</div>
                  </div>
                  <div>
                    <div style={{ color: T.yl, fontSize: isMobile ? 16 : 20, fontWeight: 700 }}>{m.active}</div>
                    <div style={{ color: T.t3, fontSize: 10 }}>Active</div>
                  </div>
                  <div>
                    <div style={{ color: '#a371f7', fontSize: isMobile ? 16 : 20, fontWeight: 700 }}>{m.rewardsReceived}</div>
                    <div style={{ color: T.t3, fontSize: 10 }}>Rewards</div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <Confirm open={confirm} onClose={() => setConfirm(false)}
        msg="This will reset all completed tasks back to 'To Do' and clear existing focus XP penalties. This affects every member. Are you sure?"
        onOk={() => { onResetPoints(); setConfirm(false) }} okLabel="Reset All Points" okColor={T.red} />
    </div>
  )
}

// ── Whiteboard ────────────────────────────────────────────────────────────────
function Whiteboard({ notes, onNoteSave }) {
  const { T } = useT()
  const [tab, setTab] = useState('canvas')
  const canvasRef = useRef(null)
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('#58a6ff')
  const [size, setSize] = useState(3)
  const drawing = useRef(false)
  const lastPt = useRef(null)
  const historyRef = useRef([])
  const histPos = useRef(-1)
  const [textInput, setTextInput] = useState(null)
  const [textVal, setTextVal] = useState('')
  const [noteTab, setNoteTab] = useState('personal')
  const [noteSaved, setNoteSaved] = useState(true)
  const noteTimerRef = useRef()


  const handleNoteChange = val => {
    onNoteSave(noteTab, val)
    setNoteSaved(false)
    clearTimeout(noteTimerRef.current)
    noteTimerRef.current = setTimeout(() => { setNoteSaved(true) }, 800)
  }

  const pushHistory = () => {
    const cv = canvasRef.current; if (!cv) return
    const snap = cv.toDataURL('image/jpeg', 0.6)
    historyRef.current = historyRef.current.slice(0, histPos.current + 1)
    historyRef.current.push(snap)
    if (historyRef.current.length > 20) historyRef.current.shift()
    histPos.current = historyRef.current.length - 1
  }

  const undo = () => {
    if (histPos.current <= 0) return
    histPos.current--
    const img = new Image()
    img.onload = () => {
      const ctx = canvasRef.current.getContext('2d')
      ctx.clearRect(0, 0, 1600, 1000); ctx.drawImage(img, 0, 0)
    }
    img.src = historyRef.current[histPos.current]
  }

  const getPos = e => {
    const cv = canvasRef.current; if (!cv) return [0, 0]
    const r = cv.getBoundingClientRect()
    const s = e.touches?.[0] || e
    return [(s.clientX - r.left) * cv.width / r.width, (s.clientY - r.top) * cv.height / r.height]
  }

  const snapRef = useRef(null)
  const startDraw = e => {
    e.preventDefault()
    if (tool === 'text') { const [x, y] = getPos(e); setTextInput({ x, y }); setTextVal(''); return }
    if (['rect', 'circle', 'line', 'arrow'].includes(tool)) {
      snapRef.current = canvasRef.current.toDataURL('image/jpeg', 0.6)
    }
    drawing.current = true; const [x, y] = getPos(e); lastPt.current = { x, y }
    if (tool === 'pen' || tool === 'eraser') {
      const ctx = canvasRef.current.getContext('2d'), pt = lastPt.current
      ctx.beginPath(); ctx.arc(pt.x, pt.y, (tool === 'eraser' ? size * 4 : size) / 2, 0, Math.PI * 2)
      ctx.fillStyle = tool === 'eraser' ? '#ffffff' : color; ctx.fill()
    }
  }

  const draw = e => {
    e.preventDefault(); if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d'), [x, y] = getPos(e), pt = { x, y }
    if (tool === 'pen' || tool === 'eraser') {
      ctx.beginPath(); ctx.moveTo(lastPt.current.x, lastPt.current.y); ctx.lineTo(pt.x, pt.y)
      ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color
      ctx.lineWidth = tool === 'eraser' ? size * 5 : size
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke()
      lastPt.current = pt
    } else {
      if (snapRef.current) {
        const img = new Image(); img.onload = () => {
          ctx.clearRect(0, 0, 1600, 1000); ctx.drawImage(img, 0, 0)
          drawShape(ctx, tool, lastPt.current, pt, color, size)
        }; img.src = snapRef.current
      } else drawShape(ctx, tool, lastPt.current, pt, color, size)
    }
  }

  const stopDraw = () => {
    if (!drawing.current) return
    drawing.current = false; snapRef.current = null; pushHistory()
  }

  const placeText = () => {
    if (!textVal.trim() || !textInput) { setTextInput(null); return }
    const ctx = canvasRef.current.getContext('2d')
    ctx.fillStyle = color; ctx.font = `${Math.max(size * 5, 14)}px Plus Jakarta Sans, sans-serif`
    ctx.fillText(textVal, textInput.x, textInput.y); setTextInput(null); setTextVal('')
    pushHistory()
  }


  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '12px 22px', borderBottom: `1px solid ${T.brd}`, display: 'flex', gap: 8, background: T.bg2 }}>
        {[['canvas', '🎨 Canvas'], ['notes', '📝 Notes']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            ...GH(T), background: tab === k ? T.acc : 'transparent',
            color: tab === k ? '#fff' : T.t2, borderColor: tab === k ? T.acc : T.brd,
            borderRadius: 10, padding: '7px 18px'
          }}>{l}</button>
        ))}
      </div>

      {tab === 'canvas' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: T.bg2, borderBottom: `1px solid ${T.brd}`, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4, background: T.bg3, padding: 3, borderRadius: 10 }}>
              {WHITEBOARD_TOOLS.map(t => (
                <button key={t.id} onClick={() => setTool(t.id)} style={{
                  background: tool === t.id ? T.acc : 'transparent',
                  color: tool === t.id ? '#fff' : T.t2, border: 'none', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600
                }}>{t.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginLeft: 6 }}>
              {WHITEBOARD_COLORS.slice(0, 8).map(c => (
                <button key={c} onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen') }} style={{
                  width: 20, height: 20, borderRadius: '50%', background: c, border: `2px solid ${color === c ? T.t1 : 'transparent'}`, cursor: 'pointer', transform: color === c ? 'scale(1.2)' : 'scale(1)', transition: 'all 0.15s'
                }} />
              ))}
              <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
              <input type="range" min={1} max={24} value={size} onChange={e => setSize(+e.target.value)} style={{ width: 60 }} />
              <span style={{ color: T.t2, fontSize: 11, minWidth: 20 }}>{size}px</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={undo} style={{ ...GH(T), fontSize: 11, padding: '5px 12px' }}>↩ Undo</button>
              <button onClick={() => {
                const cv = canvasRef.current; if (!cv) return
                const a = document.createElement('a'); a.href = cv.toDataURL(); a.download = 'whiteboard.png'; a.click()
              }} style={{ ...GH(T), fontSize: 11, padding: '5px 12px' }}>Export PNG</button>
              <button onClick={() => { canvasRef.current.getContext('2d').clearRect(0, 0, 1600, 1000); pushHistory() }}
                style={{ ...GH(T), fontSize: 11, padding: '5px 12px', color: T.red, borderColor: T.red + '55' }}>Clear</button>
            </div>
          </div>

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', touchAction: 'none', background: T.bg3, padding: 20, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <canvas ref={canvasRef} width={1600} height={1000}
              style={{
                maxWidth: '100%', maxHeight: '100%', background: '#ffffff', borderRadius: 12,
                cursor: tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair',
                touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', boxShadow: `0 8px 40px ${T.shadow}`
              }}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
            {textInput && (
              <div style={{ position: 'absolute', top: (textInput.y / 1000 * 100) + '%', left: (textInput.x / 1600 * 100) + '%', zIndex: 10 }}>
                <input autoFocus value={textVal} onChange={e => setTextVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') placeText(); if (e.key === 'Escape') setTextInput(null) }}
                  onBlur={placeText}
                  style={{ ...IS(T), width: 200, fontSize: Math.max(size * 4, 14) + 'px', color, background: `${T.bg}cc`, border: `2px solid ${T.acc}` }}
                  placeholder="Type & press Enter" />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 22, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 4, background: T.bg3, padding: 3, borderRadius: 10 }}>
              {[['personal', '👤 Personal', T.acc], ['meeting', '🤝 Meeting', '#d29922'], ['lecture', '📚 Lecture', '#3fb950']].map(([k, l, c]) => (
                <button key={k} onClick={() => setNoteTab(k)} style={{
                  background: noteTab === k ? c : 'transparent',
                  color: noteTab === k ? '#fff' : T.t2,
                  border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                }}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: noteSaved ? T.grn : T.yl, fontWeight: 600 }}>{noteSaved ? '✓ Saved' : '● Saving…'}</span>
              <button onClick={() => {
                const body = `## Notes: ${noteTab}\n\n${notes?.[noteTab] || ''}`
                const a = document.createElement('a'); a.href = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(body); a.download = `${noteTab}-notes.md`; a.click()
              }} style={{ ...GH(T), fontSize: 11, padding: '5px 12px' }}>Export .md</button>
            </div>
          </div>
          <textarea
            value={notes?.[noteTab] || ''}
            onChange={e => handleNoteChange(e.target.value)}
            placeholder={`Write your ${noteTab} notes here…`}
            style={{
              flex: 1, background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 16,
              color: T.t1, fontSize: 15, padding: 24, resize: 'none', outline: 'none',
              fontFamily: 'inherit', lineHeight: 1.8, boxShadow: `inset 0 2px 10px ${T.shadow}`
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── File Storage ──────────────────────────────────────────────────────────────
function FileStorage({ files, user, onUpload, onDelete, onShare }) {
  const { T } = useT()
  const [tab, setTab] = useState('personal')
  const [confirm, setConfirm] = useState(null)
  const fileRef = useRef(null)

  const [sizeWarn, setSizeWarn] = useState('')
  const onFileChange = e => {
    ;[...e.target.files].forEach(f => {
      if (f.size > 500 * 1024) {
        setSizeWarn(`"${f.name}" is ${(f.size / 1024).toFixed(0)}KB — files over 500KB may cause storage issues. For large files, use Google Drive and paste the link in chat.`)
        return
      }
      const r = new FileReader()
      r.onload = ev => onUpload({ id: uid(), name: f.name, size: f.size, type: f.type, data: ev.target.result, owner: user.id, shared: false, created: Date.now() })
      r.readAsDataURL(f)
    })
    e.target.value = ''
  }

  const visible = tab === 'personal'
    ? files.filter(f => f.owner === user.id)
    : files.filter(f => f.shared || f.owner === user.id)

  const fmtBytes = b => b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b > 1e3 ? `${(b / 1e3).toFixed(0)} KB` : `${b} B`
  const fileIcon = f => f.type?.startsWith('image/') ? '🖼️' : f.type?.includes('pdf') ? '📄' : f.type?.startsWith('video/') ? '🎥' : f.type?.startsWith('audio/') ? '🎵' : '📁'

  return (
    <div style={{ padding: 26, overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
        <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: 22 }}>File Storage</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {[['personal', '🔒 My Files'], ['shared', '🌐 Shared Files']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              ...GH(T), background: tab === id ? `${T.acc}1a` : undefined,
              color: tab === id ? T.acc : T.t2, fontSize: 12
            }}>{label}</button>
          ))}
          <input type="file" ref={fileRef} onChange={onFileChange} multiple style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} style={{ ...BT(T.acc), display: 'flex', alignItems: 'center', gap: 5 }}>
            <I n="upload" size={13} /> Upload
          </button>
        </div>
      </div>

      {sizeWarn && (
        <div style={{ background: `${T.yl}1a`, border: `1px solid ${T.yl}44`, borderRadius: 10, padding: '10px 16px', color: T.yl, fontSize: 13, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {sizeWarn}</span>
          <button onClick={() => setSizeWarn('')} style={{ background: 'none', border: 'none', color: T.yl, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
      )}
      {visible.length === 0 && (
        <div style={{ color: T.t3, textAlign: 'center', padding: '70px 0', fontSize: 14 }}>
          No files {tab === 'personal' ? 'uploaded yet' : 'shared with you'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 12 }}>
        {visible.map(f => (
          <div key={f.id} style={{ background: T.bg2, border: `1px solid ${f.shared ? T.grn : T.brd}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 42, height: 42, background: `${T.acc}1a`, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0
              }}>{fileIcon(f)}</div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ color: T.t1, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                <div style={{ color: T.t3, fontSize: 11, marginTop: 2 }}>{fmtBytes(f.size)} · {f.shared ? <span style={{ color: T.grn }}>shared</span> : 'private'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <a href={f.data} download={f.name} style={{ flex: 1 }}>
                <button style={{ ...GH(T), width: '100%', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <I n="download" size={12} /> Download
                </button>
              </a>
              {f.owner === user.id && (
                <>
                  <button onClick={() => onShare(f.id)} style={{
                    ...GH(T), padding: '6px 10px',
                    background: f.shared ? `${T.grn}1a` : undefined,
                    borderColor: f.shared ? T.grn : T.brd, color: f.shared ? T.grn : T.t2
                  }}><I n="share" size={13} /></button>
                  <button onClick={() => setConfirm(f.id)} style={{ ...GH(T), padding: '6px 10px' }}>
                    <I n="trash" size={13} color={T.red} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} msg="Permanently delete this file?"
        onOk={() => { onDelete(confirm); setConfirm(null) }} />
    </div>
  )
}

// ── AdminPanel ────────────────────────────────────────────────────────────────
function AdminPanel({ members, tasks, messages, projects, meetings, onDeleteTask, onDeleteMsg, onDeleteProject, onUpdateMember, onAddProject, onAddMember, onDeleteMember, currentUserId, onDeleteMeeting }) {
  const { T, bp } = useT()
  const isMobile = bp === 'mobile'
  const [tab, setTab] = useState('members')
  const TABS = [
    { id: 'members', label: 'Members' },
    { id: 'passwords', label: 'Passwords' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'chat', label: 'Chat' },
    { id: 'meetings', label: 'Meetings' },
    { id: 'projects', label: 'Projects' },
    { id: 'recovery', label: '🛟 Recovery' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: isMobile ? '10px 12px' : '13px 22px', borderBottom: `1px solid ${T.brd}`, display: 'flex', gap: 6, flexWrap: 'wrap', background: T.bg2, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            ...GH(T), background: tab === t.id ? `${T.acc}1a` : undefined,
            color: tab === t.id ? T.acc : T.t2, borderColor: tab === t.id ? T.acc : T.brd,
            fontSize: isMobile ? 12 : 13, whiteSpace: 'nowrap', flexShrink: 0
          }}>{t.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 12px' : 24, paddingBottom: isMobile ? 76 : 24 }}>
        {tab === 'members' && <AdminMembers members={members} tasks={tasks} onUpdate={onUpdateMember} onAdd={onAddMember} onDelete={onDeleteMember} currentUserId={currentUserId} />}
        {tab === 'passwords' && <AdminPasswords members={members} onUpdate={onUpdateMember} />}
        {tab === 'tasks' && <AdminTasks tasks={tasks} members={members} onDelete={onDeleteTask} />}
        {tab === 'chat' && <AdminChat messages={messages} members={members} onDelete={onDeleteMsg} />}
        {tab === 'meetings' && <AdminMeetings meetings={meetings} members={members} onDelete={onDeleteMeeting} />}
        {tab === 'projects' && <AdminProjects projects={projects} members={members} onDelete={onDeleteProject} onAdd={onAddProject} />}
        {tab === 'recovery' && <AdminRecovery members={members} onAdd={onAddMember} />}
      </div>
    </div>
  )
}

// ── Admin: Recovery ───────────────────────────────────────────────────────────
function AdminRecovery({ members, onAdd }) {
  const { T } = useT()
  const [bulk, setBulk] = useState('')
  const [result, setResult] = useState([])
  const [done, setDone] = useState(false)

  const parseBulk = () => {
    const lines = bulk.split('\n').map(l => l.trim()).filter(Boolean)
    const toAdd = []
    const skipped = []
    lines.forEach(line => {
      // Accept "Name <email>" or just "email@..."
      const emailMatch = line.match(/[\w.+-]+@[\w.-]+\.\w+/)
      if (!emailMatch) { skipped.push(line + ' (no valid email)'); return }
      const email = emailMatch[0].toLowerCase()
      if (members.find(m => m.email.toLowerCase() === email)) {
        skipped.push(email + ' (already exists)')
        return
      }
      const namePart = line.replace(emailMatch[0], '').replace(/[<>]/g, '').trim()
      const name = namePart || email.split('@')[0]
      toAdd.push({ id: uid(), name, email, role: 'member', pw: '', avatar: '', mustChangePw: false })
    })
    toAdd.forEach(m => onAdd(m))
    setResult([
      ...toAdd.map(m => `✅ Added: ${m.name} (${m.email})`),
      ...skipped.map(s => `⚠️ Skipped: ${s}`)
    ])
    setBulk('')
    setDone(true)
  }

  return (
    <div>
      <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 18, marginBottom: 5 }}>🛟 Team Recovery</h3>
      <p style={{ color: T.t2, fontSize: 13, marginBottom: 18, lineHeight: 1.6 }}>
        If your team's data was lost, paste member emails below (one per line) to restore access.
        Members added here can then log back in via <strong>Google SSO</strong> or you can set their passwords in the Passwords tab.
      </p>

      <div style={{ background: `${T.yl}15`, border: `1px solid ${T.yl}44`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ color: T.yl, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>📋 How to restore your team:</div>
        <div style={{ color: T.t2, fontSize: 13, lineHeight: 1.8 }}>
          1. Go to <strong style={{ color: T.acc }}>Firebase Console → Authentication → Users</strong><br />
          2. Copy each email address from the list<br />
          3. Paste them below (one per line)<br />
          4. Click <strong>Add Members from List</strong><br />
          5. Each member logs back in via <strong>Google SSO</strong>
        </div>
      </div>

      <label style={{ color: T.t2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
        PASTE EMAILS (one per line, format: "Name &lt;email&gt;" or just "email"):
      </label>
      <textarea
        value={bulk}
        onChange={e => { setBulk(e.target.value); setDone(false); setResult([]) }}
        placeholder={'Jane Smith <jane@gmail.com>john@gmail.comteammate@company.com...'}
        style={{ ...IS(T), height: 160, resize: 'vertical', fontFamily: 'monospace', fontSize: 13, marginBottom: 14 }}
      />
      <button onClick={parseBulk} disabled={!bulk.trim()}
        style={{ ...BT(T.acc), display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, opacity: bulk.trim() ? 1 : 0.5 }}>
        <I n="plus" size={14} /> Add Members from List
      </button>

      {result.length > 0 && (
        <div style={{ background: T.bg3, border: `1px solid ${T.brd}`, borderRadius: 12, padding: 16 }}>
          <div style={{ color: T.t1, fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Results:</div>
          {result.map((r, i) => (
            <div key={i} style={{ color: r.startsWith('✅') ? T.grn : T.yl, fontSize: 13, marginBottom: 5, fontFamily: 'monospace' }}>{r}</div>
          ))}
          {done && <p style={{ color: T.t2, fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
            ✅ Done! Added members can now log in via <strong>Google SSO</strong>. Use the <strong>Passwords tab</strong> to set email/password for anyone without Google.
            Go to <strong>Members tab</strong> to set admin roles if needed.
          </p>}
        </div>
      )}
    </div>
  )
}

// ── Admin: Members ─────────────────────────────────────────────────────────────
function AdminMembers({ members, tasks, onUpdate, onAdd, onDelete, currentUserId }) {
  const { T } = useT()
  const [edit, setEdit] = useState(null)
  const [f, setF] = useState({ name: '', role: 'member', email: '' })
  const [showAdd, setShowAdd] = useState(false)
  const [nf, setNf] = useState({ name: '', email: '', role: 'member', pw: '' })
  const [nErr, setNErr] = useState('')
  const [confirm, setConfirm] = useState(null)

  const openEdit = m => { setEdit(m.id); setF({ name: m.name, role: m.role, email: m.email }) }
  const save = () => { onUpdate(edit, f); setEdit(null) }

  const doAdd = () => {
    if (!nf.name.trim()) return setNErr('Name is required.')
    if (!nf.email.trim()) return setNErr('Email is required.')
    if (members.find(m => m.email.toLowerCase() === nf.email.toLowerCase()))
      return setNErr('A member with this email already exists.')
    onAdd({
      id: uid(), name: nf.name.trim(), email: nf.email.trim(),
      role: nf.role, pw: nf.pw || 'changeme', mustChangePw: !nf.pw,
      avatar: '', color: '#58a6ff'
    })
    setNf({ name: '', email: '', role: 'member', pw: '' })
    setNErr(''); setShowAdd(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 18, marginBottom: 3 }}>Team Members</h3>
          <p style={{ color: T.t2, fontSize: 13 }}>Edit member details, add or remove members.</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ ...BT(T.acc), display: 'flex', alignItems: 'center', gap: 7 }}>
          <I n="plus" size={14} /> Add Member
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {members.map(m => (
          <div key={m.id} style={{
            background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 13,
            padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14
          }}>
            <Av member={m} size={42} />
            <div style={{ flex: 1 }}>
              <div style={{ color: T.t1, fontWeight: 600, fontSize: 14 }}>{m.name}</div>
              <div style={{ color: T.t3, fontSize: 12, marginTop: 2 }}>
                {m.email} ·
                <span style={{ textTransform: 'capitalize', color: m.role === 'admin' ? T.yl : T.t3, fontWeight: 600 }}>{m.role}</span>
              </div>
            </div>
            <div style={{ textAlign: 'center', marginRight: 8 }}>
              <div style={{ color: T.t1, fontWeight: 700, fontSize: 18 }}>{tasks.filter(t => t.assignee === m.id && t.status === 'done').length}</div>
              <div style={{ color: T.t3, fontSize: 11 }}>done</div>
            </div>
            <button onClick={() => openEdit(m)} style={{ ...GH(T), padding: '7px 11px' }} title="Edit">
              <I n="edit" size={14} />
            </button>
            <button
              onClick={() => m.id === currentUserId
                ? alert("You can't delete your own account.")
                : setConfirm(m)
              }
              style={{ ...GH(T), padding: '7px 11px', borderColor: T.red + '55', color: T.red }}
              title="Remove member"
            ><I n="trash" size={14} /></button>
          </div>
        ))}
      </div>

      <Confirm
        open={!!confirm} onClose={() => setConfirm(null)}
        msg={`Remove ${confirm?.name} from FlowHub? Their tasks will remain but they won't be able to log in.`}
        onOk={() => { onDelete(confirm.id); setConfirm(null) }}
      />

      {edit && (
        <Modal open onClose={() => setEdit(null)} title="Edit Member">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Full name" style={IS(T)} autoFocus />
            <input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="Email" style={IS(T)} />
            <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })} style={IS(T)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setEdit(null)} style={GH(T)}>Cancel</button>
              <button onClick={save} style={BT(T.acc)}>Save Changes</button>
            </div>
          </div>
        </Modal>
      )}

      {showAdd && (
        <Modal open onClose={() => { setShowAdd(false); setNErr('') }} title="Add New Member">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {nErr && <div style={{ background: `${T.red}1a`, border: `1px solid ${T.red}44`, borderRadius: 8, padding: '9px 13px', color: T.red, fontSize: 13 }}>{nErr}</div>}
            <input value={nf.name} onChange={e => setNf({ ...nf, name: e.target.value })} placeholder="Full name" style={IS(T)} autoFocus />
            <input value={nf.email} onChange={e => setNf({ ...nf, email: e.target.value })} placeholder="Email address" style={IS(T)} />
            <select value={nf.role} onChange={e => setNf({ ...nf, role: e.target.value })} style={IS(T)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <input value={nf.pw} onChange={e => setNf({ ...nf, pw: e.target.value })} type="password"
              placeholder="Password (leave blank → user sets on first login)" style={IS(T)} />
            <p style={{ color: T.t3, fontSize: 12, marginTop: -4 }}>If no password is set, the user will be prompted to create one on first login.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => { setShowAdd(false); setNErr('') }} style={GH(T)}>Cancel</button>
              <button onClick={doAdd} style={BT(T.acc)}>Add Member</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Admin: Passwords ──────────────────────────────────────────────────────────
function AdminPasswords({ members, onUpdate }) {
  const { T } = useT()
  const [sel, setSel] = useState('')
  const [np, setNp] = useState('')
  const [mustChange, setMustChange] = useState(false)
  const [flash, setFlash] = useState('')

  const setNewPw = () => {
    if (!sel) return setFlash('⚠️ Select a member first.')
    if (np.length < 6) return setFlash('⚠️ Password must be 6+ characters.')
    onUpdate(sel, { pw: np, mustChangePw: mustChange })
    setFlash('✓ Password updated successfully.')
    setNp(''); setMustChange(false)
    setTimeout(() => setFlash(''), 3500)
  }

  const removeReq = id => {
    onUpdate(id, { mustChangePw: false })
    setFlash('✓ Change requirement removed.')
    setTimeout(() => setFlash(''), 3000)
  }

  return (
    <div>
      <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 18, marginBottom: 5 }}>Password Management</h3>
      <p style={{ color: T.t2, fontSize: 13, marginBottom: 22 }}>Set passwords or force a member to change theirs on next login.</p>

      <div style={{ background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14, padding: 22, marginBottom: 18 }}>
        <h4 style={{ color: T.t1, fontSize: 15, marginBottom: 16, fontWeight: 600 }}>Set Member Password</h4>
        {flash && (
          <div style={{
            background: flash.startsWith('✓') ? `${T.grn}18` : `${T.yl}18`,
            border: `1px solid ${flash.startsWith('✓') ? T.grn : T.yl}44`,
            borderRadius: 8, padding: '9px 13px', fontSize: 13,
            color: flash.startsWith('✓') ? T.grn : T.yl, marginBottom: 14
          }}>{flash}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <select value={sel} onChange={e => setSel(e.target.value)} style={IS(T)}>
            <option value="">— Choose a member —</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input type="password" placeholder="New password (min 6 chars)" value={np}
            onChange={e => setNp(e.target.value)} style={IS(T)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={mustChange} onChange={e => setMustChange(e.target.checked)} />
            <span style={{ color: T.t2, fontSize: 13 }}>Require this member to change their password on next login</span>
          </label>
          <button onClick={setNewPw} style={{ ...BT(T.acc), display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
            <I n="key" size={13} /> Set Password
          </button>
        </div>
      </div>

      <div style={{ background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14, padding: 22 }}>
        <h4 style={{ color: T.t1, fontSize: 15, marginBottom: 16, fontWeight: 600 }}>Change Requirements</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {members.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Av member={m} size={30} />
              <span style={{ color: T.t1, fontSize: 13, fontWeight: 500, flex: 1 }}>{m.name}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, textTransform: 'uppercase',
                background: m.mustChangePw ? `${T.yl}18` : `${T.grn}18`,
                color: m.mustChangePw ? T.yl : T.grn
              }}>{m.mustChangePw ? 'Must change' : 'OK'}</span>
              {m.mustChangePw && (
                <button onClick={() => removeReq(m.id)} style={{ ...GH(T), fontSize: 11, padding: '3px 10px' }}>
                  Remove req
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Admin: Tasks ──────────────────────────────────────────────────────────────
function AdminTasks({ tasks, members, onDelete }) {
  const { T } = useT()
  const [confirm, setConfirm] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = tasks.filter(t => {
    const matchType = filter === 'all' || t.type === filter
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  const STATUS_COLOR = { todo: T.t2, inprogress: T.yl, done: T.grn }
  const TYPE_COLOR = { private: T.acc, group: T.grn, public: T.yl }
  const STATUS_LABEL = { todo: 'To Do', inprogress: 'In Progress', done: 'Done' }

  return (
    <div>
      <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 18, marginBottom: 5 }}>Task Management</h3>
      <p style={{ color: T.t2, fontSize: 13, marginBottom: 20 }}>
        View and delete any task across all boards. {tasks.length} tasks total.
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...IS(T), flex: '1 1 180px' }} />
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {['all', 'private', 'group', 'public'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              ...GH(T), background: filter === f ? `${T.acc}1a` : undefined,
              color: filter === f ? T.acc : T.t2, fontSize: 12, padding: '5px 12px', textTransform: 'capitalize'
            }}>{f}</button>
          ))}
        </div>
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div style={{ color: T.t3, textAlign: 'center', padding: '48px 0' }}>No tasks match the filter</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(t => {
            const assignee = members.find(m => m.id === t.assignee)
            const creator = members.find(m => m.id === t.creator)
            return (
              <div key={t.id} style={{
                background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 12,
                padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 14
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 5 }}>
                    <span style={{ color: T.t1, fontWeight: 600, fontSize: 13 }}>{t.title}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 5, textTransform: 'uppercase',
                      background: `${TYPE_COLOR[t.type]}18`, color: TYPE_COLOR[t.type]
                    }}>{t.type}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 5, textTransform: 'uppercase',
                      background: P_BG[t.priority], color: P_COLOR[t.priority]
                    }}>{t.priority}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: STATUS_COLOR[t.status], fontSize: 12, fontWeight: 600 }}>
                      {STATUS_LABEL[t.status]}
                    </span>
                    {assignee && (
                      <span style={{ color: T.t3, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Av member={assignee} size={16} /> {assignee.name}
                      </span>
                    )}
                    {creator && creator.id !== assignee?.id && (
                      <span style={{ color: T.t3, fontSize: 12 }}>by {creator.name}</span>
                    )}
                    <span style={{ color: T.t3, fontSize: 11 }}>{new Date(t.created).toLocaleDateString()}</span>
                  </div>
                </div>
                <button onClick={() => setConfirm(t.id)} style={{ ...GH(T), padding: '7px 10px', flexShrink: 0 }}>
                  <I n="trash" size={14} color={T.red} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} msg="Permanently delete this task? This cannot be undone."
        onOk={() => { onDelete(confirm); setConfirm(null) }} />
    </div>
  )
}

// ── Admin: Chat ───────────────────────────────────────────────────────────────
function AdminChat({ messages, members, onDelete }) {
  const { T } = useT()
  const [confirm, setConfirm] = useState(null)
  const [search, setSearch] = useState('')

  const filtered = [...messages]
    .filter(m => !search || m.text?.toLowerCase().includes(search.toLowerCase()))
    .reverse()

  return (
    <div>
      <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 18, marginBottom: 5 }}>Chat Moderation</h3>
      <p style={{ color: T.t2, fontSize: 13, marginBottom: 20 }}>
        Review and delete messages. {messages.length} messages total.
      </p>

      <input placeholder="Search messages…" value={search} onChange={e => setSearch(e.target.value)}
        style={{ ...IS(T), marginBottom: 18 }} />

      {filtered.length === 0 ? (
        <div style={{ color: T.t3, textAlign: 'center', padding: '48px 0' }}>No messages found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(msg => {
            const sender = members.find(m => m.id === msg.userId)
            return (
              <div key={msg.id} style={{
                background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 12,
                padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12
              }}>
                <Av member={sender} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5, flexWrap: 'wrap' }}>
                    <span style={{ color: T.t1, fontWeight: 600, fontSize: 13 }}>{sender?.name || 'Unknown'}</span>
                    <span style={{ color: T.t3, fontSize: 11 }}>{new Date(msg.time).toLocaleString()}</span>
                  </div>
                  {msg.text && (
                    <p style={{ color: T.t2, fontSize: 13, lineHeight: 1.55, wordBreak: 'break-word' }}>{msg.text}</p>
                  )}
                  {msg.files?.length > 0 && (
                    <div style={{ color: T.t3, fontSize: 12, marginTop: 5 }}>
                      📎 {msg.files.length} attachment{msg.files.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <button onClick={() => setConfirm(msg.id)} style={{ ...GH(T), padding: '7px 10px', flexShrink: 0 }}>
                  <I n="trash" size={14} color={T.red} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} msg="Delete this message from the team chat?"
        onOk={() => { onDelete(confirm); setConfirm(null) }} />
    </div>
  )
}


// ── Admin: Meetings ───────────────────────────────────────────────────────────
function AdminMeetings({ meetings, members, onDelete }) {
  const { T } = useT()
  const [search, setSearch] = useState('')
  const [confirm, setConfirm] = useState(null)

  const filtered = meetings.filter(m =>
    m.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 18, marginBottom: 5 }}>Meetings</h3>
      <p style={{ color: T.t2, fontSize: 13, marginBottom: 16 }}>View and delete scheduled meetings.</p>
      <input placeholder="Search meetings..." value={search} onChange={e => setSearch(e.target.value)}
        style={{ ...IS(T), marginBottom: 16 }} />
      {filtered.length === 0 && (
        <div style={{ color: T.t3, textAlign: 'center', padding: '40px 0' }}>No meetings found</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(m => {
          const creator = members.find(x => x.id === m.creator)
          return (
            <div key={m.id} style={{
              background: T.bg3, border: `1px solid ${T.brd}`, borderRadius: 12,
              padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: T.t1, fontWeight: 600, fontSize: 14 }}>{m.title}</div>
                <div style={{ color: T.t2, fontSize: 12, marginTop: 3 }}>
                  {new Date(m.time).toLocaleString()} · {m.duration} min
                  {creator && <span style={{ color: T.t3 }}> · by {creator.name}</span>}
                </div>
                {m.link && <div style={{ color: T.acc, fontSize: 12, marginTop: 2 }}>{m.link}</div>}
              </div>
              <button onClick={() => setConfirm(m.id)}
                style={{ ...GH(T), padding: '7px 11px', borderColor: T.red + '55', color: T.red }}>
                <I n="trash" size={14} />
              </button>
            </div>
          )
        })}
      </div>
      <Confirm open={!!confirm} onClose={() => setConfirm(null)}
        msg="Delete this meeting permanently?"
        onOk={() => { onDelete(confirm); setConfirm(null) }} />
    </div>
  )
}

// ── Admin: Projects ───────────────────────────────────────────────────────────
function AdminProjects({ projects, members, onDelete, onAdd }) {
  const { T } = useT()
  const [confirm, setConfirm] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [f, setF] = useState({ name: '', desc: '', color: '#58a6ff', members: [] })

  const resetForm = () => setF({ name: '', desc: '', color: '#58a6ff', members: [] })

  const save = () => {
    if (!f.name.trim()) return
    onAdd({ id: uid(), ...f })
    resetForm(); setShowForm(false)
  }

  const toggleMember = id => setF(prev => ({
    ...prev,
    members: prev.members.includes(id)
      ? prev.members.filter(m => m !== id)
      : [...prev.members, id]
  }))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22, gap: 10 }}>
        <div>
          <h3 className="fh-fraunces" style={{ color: T.t1, fontSize: 18, marginBottom: 5 }}>Projects</h3>
          <p style={{ color: T.t2, fontSize: 13 }}>Manage project groups and team assignments. {projects.length} projects.</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ ...BT(T.acc), display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <I n="plus" size={13} /> New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div style={{ color: T.t3, textAlign: 'center', padding: '48px 0' }}>No projects yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {projects.map(p => (
            <div key={p.id} style={{
              background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14,
              padding: 20, display: 'flex', alignItems: 'flex-start', gap: 16
            }}>
              <div style={{
                width: 46, height: 46, borderRadius: 12,
                background: `${p.color}18`, border: `2px solid ${p.color}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <I n="files" size={20} color={p.color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.t1, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{p.name}</div>
                {p.desc && <p style={{ color: T.t2, fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>{p.desc}</p>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {p.members.map(mid => {
                    const m = members.find(x => x.id === mid)
                    return m ? <Av key={mid} member={m} size={26} /> : null
                  })}
                  <span style={{ color: T.t3, fontSize: 12 }}>
                    {p.members.length} member{p.members.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <button onClick={() => setConfirm(p.id)} style={{ ...GH(T), padding: '7px 10px', flexShrink: 0 }}>
                <I n="trash" size={14} color={T.red} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal open onClose={() => { setShowForm(false); resetForm() }} title="Create New Project" width={500}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <input placeholder="Project name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} style={IS(T)} autoFocus />
            <textarea placeholder="Description (optional)…" value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })}
              style={{ ...IS(T), height: 72, resize: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: T.t2, fontSize: 13 }}>Accent color:</span>
              <input type="color" value={f.color} onChange={e => setF({ ...f, color: e.target.value })}
                style={{ width: 38, height: 38, borderRadius: 8, border: `1px solid ${T.brd}`, cursor: 'pointer', background: 'none' }} />
              <div style={{ width: 38, height: 38, borderRadius: 8, background: `${f.color}18`, border: `2px solid ${f.color}55` }} />
            </div>
            <div>
              <div style={{ color: T.t2, fontSize: 13, marginBottom: 10, fontWeight: 600 }}>Team members:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {members.map(m => (
                  <label key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
                    background: f.members.includes(m.id) ? `${f.color}10` : T.bg3,
                    border: `1px solid ${f.members.includes(m.id) ? f.color : T.brd}`,
                    borderRadius: 9, padding: '8px 12px', transition: 'all 0.15s'
                  }}>
                    <input type="checkbox" checked={f.members.includes(m.id)} onChange={() => toggleMember(m.id)} />
                    <Av member={m} size={24} />
                    <span style={{ color: T.t1, fontSize: 13 }}>{m.name.split(' ')[0]}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => { setShowForm(false); resetForm() }} style={GH(T)}>Cancel</button>
              <button onClick={save} style={BT(T.acc)}>Create Project</button>
            </div>
          </div>
        </Modal>
      )}

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} msg="Delete this project? This cannot be undone."
        onOk={() => { onDelete(confirm); setConfirm(null) }} />
    </div>
  )
}


// ── Calendar ──────────────────────────────────────────────────────────────────
const CAL_TYPES = [
  { id: 'out', label: 'Out of Daylight', color: '#f85149', emoji: '🌑' },
  { id: 'milestone', label: 'Milestone', color: '#3fb950', emoji: '🎯' },
  { id: 'deadline', label: 'Deadline', color: '#d29922', emoji: '⏰' },
  { id: 'holiday', label: 'Holiday', color: '#58a6ff', emoji: '🎉' },
  { id: 'reminder', label: 'Reminder', color: '#a371f7', emoji: '🔔' },
  { id: 'meeting', label: 'Meeting', color: '#ffa657', emoji: '📅' },
]

// Build a Google Calendar "Add event" URL (works without any API key)
const gcalUrl = (ev) => {
  const datePart = ev.date.replace(/-/g, '')
  const start = ev.time
    ? `${datePart}T${ev.time.replace(':', '')}00`
    : datePart
  const end = ev.time
    ? `${datePart}T${String(parseInt(ev.time.slice(0, 2)) + 1).padStart(2, '0')}${ev.time.slice(2)}00`
    : datePart
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${start}/${end}`,
    details: ev.note || '',
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

const icalDownload = (ev) => {
  const datePart = ev.date.replace(/-/g, '')
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  let dtStart, dtEnd
  if (ev.time) {
    const startMs = new Date(`${ev.date}T${ev.time}:00`).getTime()
    const endMs = startMs + 3600000
    const toIcal = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace('.000', '')
    dtStart = `DTSTART;TZID=${tz}:${toIcal(startMs).slice(0, 15)}`
    dtEnd = `DTEND;TZID=${tz}:${toIcal(endMs).slice(0, 15)}`
  } else {
    dtStart = `DTSTART;VALUE=DATE:${datePart}`
    dtEnd = `DTEND;VALUE=DATE:${datePart}`
  }
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Daylighting//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${ev.id}@daylighting`, dtStart, dtEnd,
    `SUMMARY:${ev.title}`,
    ev.note ? `DESCRIPTION:${ev.note.replace(/\n/g, '\\n')}` : '',
    `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${ev.title.replace(/[^a-z0-9]/gi, '_')}.ics`
  a.click(); URL.revokeObjectURL(url)
}

function Calendar({ calendarEvents, onAdd, onDelete, user }) {
  const { T, bp } = useT()
  const isMobile = bp === 'mobile'
  const today = new Date()
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [showForm, setShowForm] = useState(false)
  const [selDate, setSelDate] = useState(null)
  const [form, setForm] = useState({ title: '', type: 'reminder', note: '', time: '' })
  const [confirm, setConfirm] = useState(null)
  const [viewDay, setViewDay] = useState(null)

  // ── Google Calendar API (optional) ─────────────────────────────────────────
  // If GOOGLE_CAL_CLIENT_ID is configured, this allows creating events directly
  // in the user's Google Calendar without opening a new tab.
  const [gcalToken, setGcalToken] = useState(null)   // OAuth2 access token
  const [gcalConnecting, setGcalConnecting] = useState(false)
  const [gcalStatus, setGcalStatus] = useState('')     // '' | 'connected' | 'error'
  const tokenClientRef = useRef(null)

  useEffect(() => {
    if (!GOOGLE_CAL_CLIENT_ID) return
    // Load Google Identity Services (lighter than gapi)
    if (window.google?.accounts?.oauth2) { initTokenClient(); return }
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = initTokenClient
    s.onerror = () => setGcalStatus('error')
    document.head.appendChild(s)

    function initTokenClient() {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CAL_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/calendar.events',
        callback: (resp) => {
          setGcalConnecting(false)
          if (resp?.access_token) { setGcalToken(resp.access_token); setGcalStatus('connected') }
          else setGcalStatus('error')
        },
      })
    }
  }, [])

  const connectGCal = () => {
    if (!tokenClientRef.current) return
    setGcalConnecting(true)
    tokenClientRef.current.requestAccessToken()
  }

  // Push an event to Google Calendar API (only used when access token exists)
  const pushToGCal = async (ev) => {
    if (!gcalToken) return
    const body = {
      summary: ev.title,
      description: ev.note || '',
      start: ev.time
        ? { dateTime: new Date(`${ev.date}T${ev.time}:00`).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        : { date: ev.date },
      end: ev.time
        ? { dateTime: new Date(new Date(`${ev.date}T${ev.time}:00`).getTime() + 3600000).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        : { date: ev.date },
    }
    try {
      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${gcalToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 401) { setGcalToken(null); setGcalStatus('') } // token expired
    } catch (_) { }
  }

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))

  const dateStr = (d) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const eventsForDay = (d) => (calendarEvents || []).filter(e => e.date === dateStr(d))

  const openAdd = (d) => {
    setSelDate(dateStr(d))
    setForm({ title: '', type: 'reminder', note: '', time: '' })
    setShowForm(true)
  }

  const save = () => {
    if (!form.title.trim()) return
    const newEvent = { id: uid(), ...form, title: form.title.trim(), date: selDate, creator: user.id, created: Date.now() }
    onAdd(newEvent)
    if (gcalToken) pushToGCal(newEvent)  // sync to Google Calendar if connected
    setShowForm(false)
  }

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const upcoming = [...(calendarEvents || [])]
    .filter(e => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8)

  const typeInfo = id => CAL_TYPES.find(t => t.id === id) || CAL_TYPES[4]

  // Google Calendar connect banner logic
  const showGCalBanner = GOOGLE_CAL_CLIENT_ID && gcalStatus !== 'connected'

  return (
    <div style={{ padding: isMobile ? '16px 12px' : 26, overflowY: 'auto', flex: 1, paddingBottom: isMobile ? 76 : 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showGCalBanner ? 12 : 20 }}>
        <div>
          <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: isMobile ? 20 : 22 }}>Calendar</h2>
          <p style={{ color: T.t2, fontSize: 13, marginTop: 3 }}>Mark important dates, absences, and milestones.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Add Event button — always visible in header on mobile */}
          {isMobile && (
            <button onClick={() => { setSelDate(todayStr); setForm({ title: '', type: 'reminder', note: '', time: '' }); setShowForm(true) }}
              style={{ ...BT(T.acc), display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', fontSize: 13 }}>
              <I n="plus" size={13} /> Add Event
            </button>
          )}
          {/* Google Calendar status badge */}
          {gcalStatus === 'connected' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, background: `${T.grn}18`,
              border: `1px solid ${T.grn}44`, borderRadius: 20, padding: '5px 14px'
            }}>
              <span style={{ fontSize: 14 }}>📅</span>
              <span style={{ color: T.grn, fontSize: 12, fontWeight: 700 }}>Google Calendar synced</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Google Calendar connect banner ── */}
      {showGCalBanner && (
        <div style={{
          background: `${T.acc}0f`, border: `1px solid ${T.acc}33`, borderRadius: 12,
          padding: '12px 18px', marginBottom: 18,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
        }}>
          <span style={{ fontSize: 20 }}>📅</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ color: T.t1, fontWeight: 600, fontSize: 13 }}>Connect Google Calendar</div>
            <div style={{ color: T.t2, fontSize: 12, marginTop: 2 }}>
              {GOOGLE_CAL_CLIENT_ID
                ? 'Sync events you add here directly to your Google Calendar.'
                : 'Set GOOGLE_CAL_CLIENT_ID in the source to enable direct sync. In the meantime, use the "Add to Google Cal" button on each event.'}
            </div>
          </div>
          {GOOGLE_CAL_CLIENT_ID && (
            <button onClick={connectGCal} disabled={gcalConnecting} style={{
              ...BT(gcalStatus === 'error' ? T.red : T.acc),
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: gcalConnecting ? 0.7 : 1
            }}>
              {gcalConnecting ? '⏳ Connecting…' : gcalStatus === 'error' ? '⚠️ Retry' : '🔗 Connect'}
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: 20 }}>
        {/* ── Calendar grid ── */}
        <div style={{ background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: `1px solid ${T.brd}` }}>
            <button onClick={prevMonth} style={{ ...GH(T), padding: '6px 12px', fontSize: 18 }}>‹</button>
            <span className="fh-fraunces" style={{ color: T.t1, fontSize: 18, fontWeight: 700 }}>
              {MONTH_NAMES[month]} {year}
            </span>
            <button onClick={nextMonth} style={{ ...GH(T), padding: '6px 12px', fontSize: 18 }}>›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: T.bg3 }}>
            {DAY_NAMES.map(d => (
              <div key={d} style={{ textAlign: 'center', padding: '8px 0', color: T.t3, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>{d}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, background: T.brd }}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e${i}`} style={{ background: T.bg2, minHeight: 90 }} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
              const ds = dateStr(d)
              const evs = eventsForDay(d)
              const isToday = ds === todayStr
              return (
                <div key={d} onClick={() => { setViewDay(ds); setSelDate(ds) }}
                  style={{
                    background: T.bg2, minHeight: 90, padding: 6, cursor: 'pointer',
                    borderLeft: isToday ? `3px solid ${T.acc}` : undefined,
                    transition: 'background 0.12s', position: 'relative'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = T.bg3}
                  onMouseLeave={e => e.currentTarget.style.background = T.bg2}>
                  <div style={{ fontWeight: isToday ? 800 : 400, color: isToday ? T.acc : T.t2, fontSize: 13, marginBottom: 4 }}>{d}</div>
                  {evs.slice(0, 3).map(ev => {
                    const ti = typeInfo(ev.type)
                    return (
                      <div key={ev.id} style={{
                        background: `${ti.color}22`, color: ti.color,
                        fontSize: 10, borderRadius: 4, padding: '1px 5px', marginBottom: 2,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600
                      }}>{ti.emoji} {ev.time ? ev.time + ' ' : ''}{ev.title}</div>
                    )
                  })}
                  {evs.length > 3 && <div style={{ color: T.t3, fontSize: 10 }}>+{evs.length - 3} more</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <button onClick={() => { setSelDate(todayStr); setForm({ title: '', type: 'reminder', note: '', time: '' }); setShowForm(true) }}
            style={{ ...BT(T.acc), width: '100%', padding: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <I n="plus" size={14} /> Add Event
          </button>

          {/* Legend */}
          <div style={{ background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14, padding: 16 }}>
            <div style={{ color: T.t2, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>EVENT TYPES</div>
            {CAL_TYPES.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                <span style={{ color: T.t2, fontSize: 12 }}>{t.emoji} {t.label}</span>
              </div>
            ))}
          </div>

          {/* Upcoming events */}
          <div style={{ background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14, padding: 16, flex: 1, overflowY: 'auto' }}>
            <div style={{ color: T.t2, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>UPCOMING</div>
            {upcoming.length === 0 && (
              <div style={{ color: T.t3, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No upcoming events</div>
            )}
            {upcoming.map(ev => {
              const ti = typeInfo(ev.type)
              const dt = new Date(ev.date + 'T12:00:00')
              return (
                <div key={ev.id} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12,
                  paddingBottom: 12, borderBottom: `1px solid ${T.brd}`
                }}>
                  <div style={{ background: `${ti.color}22`, color: ti.color, borderRadius: 8, padding: '4px 7px', fontSize: 16, flexShrink: 0 }}>{ti.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: T.t1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
                    <div style={{ color: T.t3, fontSize: 11, marginTop: 2 }}>
                      {dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {ev.time && <span style={{ color: T.acc, fontWeight: 600 }}> · {ev.time}</span>}
                    </div>
                    {ev.note && <div style={{ color: T.t2, fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>{ev.note}</div>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <a href={gcalUrl(ev)} target="_blank" rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600,
                          textDecoration: 'none', padding: '3px 8px', borderRadius: 5,
                          background: '#1a73e822', color: '#1a73e8', border: '1px solid #1a73e844'
                        }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="#1a73e8"><path d="M22 12A10 10 0 0 0 12 2a10 10 0 0 0-10 10 10 10 0 0 0 10 10 10 10 0 0 0 10-10zm-11.5 6.5v-5H9V12h1.5V9.25C10.5 7.74 11.6 7 12.9 7c.61 0 1.24.05 1.85.15v1.9h-1.26c-1 0-1.2.47-1.2 1.16V12H15l-.35 1.5H12.3v5H10.5z" /></svg>
                        Google
                      </a>
                      <button onClick={() => icalDownload(ev)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600,
                          cursor: 'pointer', padding: '3px 8px', borderRadius: 5,
                          background: '#00000015', color: T.t2, border: `1px solid ${T.brd}`,
                          fontFamily: "'Plus Jakarta Sans',sans-serif"
                        }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                        Apple
                      </button>
                    </div>
                  </div>
                  {(user?.role === 'admin' || ev.creator === user?.id) && (
                    <button onClick={() => setConfirm(ev.id)}
                      style={{ background: 'none', border: 'none', color: T.t3, cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
                      <I n="trash" size={12} color={T.red} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Day popover ── */}
      {viewDay && (
        <Modal open onClose={() => setViewDay(null)} title={new Date(viewDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} width={420}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(calendarEvents || []).filter(e => e.date === viewDay).length === 0 && (
              <div style={{ color: T.t3, textAlign: 'center', padding: '20px 0' }}>No events on this day</div>
            )}
            {(calendarEvents || []).filter(e => e.date === viewDay).map(ev => {
              const ti = typeInfo(ev.type)
              return (
                <div key={ev.id} style={{
                  display: 'flex', gap: 12, alignItems: 'center', background: T.bg3,
                  borderRadius: 10, padding: '10px 14px', borderLeft: `3px solid ${ti.color}`
                }}>
                  <span style={{ fontSize: 20 }}>{ti.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: T.t1, fontWeight: 600, fontSize: 14 }}>{ev.title}</div>
                    {ev.time && <div style={{ color: ti.color, fontSize: 12, fontWeight: 700, marginTop: 1 }}>⏰ {ev.time}</div>}
                    {ev.note && <div style={{ color: T.t2, fontSize: 12, marginTop: 2 }}>{ev.note}</div>}
                    <div style={{ color: ti.color, fontSize: 11, marginTop: 2, fontWeight: 600 }}>{ti.label}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                      <a href={gcalUrl(ev)} target="_blank" rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
                          textDecoration: 'none', padding: '5px 10px', borderRadius: 6,
                          background: '#1a73e822', color: '#1a73e8', border: '1px solid #1a73e844'
                        }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#1a73e8"><path d="M22 12A10 10 0 0 0 12 2a10 10 0 0 0-10 10 10 10 0 0 0 10 10 10 10 0 0 0 10-10zm-11.5 6.5v-5H9V12h1.5V9.25C10.5 7.74 11.6 7 12.9 7c.61 0 1.24.05 1.85.15v1.9h-1.26c-1 0-1.2.47-1.2 1.16V12H15l-.35 1.5H12.3v5H10.5z" /></svg>
                        Google Calendar
                      </a>
                      <button onClick={() => icalDownload(ev)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', padding: '5px 10px', borderRadius: 6,
                          background: '#00000015', color: T.t2, border: `1px solid ${T.brd}`,
                          fontFamily: "'Plus Jakarta Sans',sans-serif"
                        }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                        Apple Calendar
                      </button>
                    </div>
                  </div>
                  {(user?.role === 'admin' || ev.creator === user?.id) && (
                    <button onClick={() => { onDelete(ev.id) }}
                      style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer' }}>
                      <I n="trash" size={14} />
                    </button>
                  )}
                </div>
              )
            })}
            <button onClick={() => { setViewDay(null); setShowForm(true) }}
              style={{ ...BT(T.acc), marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <I n="plus" size={13} /> Add Event on this Day
            </button>
          </div>
        </Modal>
      )}

      {/* ── Mobile FAB — Add Event ── */}
      {isMobile && (
        <button
          onClick={() => { setSelDate(todayStr); setForm({ title: '', type: 'reminder', note: '', time: '' }); setShowForm(true) }}
          style={{
            position: 'fixed', bottom: 72, right: 16, zIndex: 1200,
            width: 52, height: 52, borderRadius: '50%',
            background: T.acc, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.32)',
          }}
          aria-label="Add Event"
        >
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {/* ── Add event form ── */}
      {showForm && (
        <Modal open onClose={() => setShowForm(false)} title={`Add Event — ${selDate}`} width={420}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input placeholder="Event title…" value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })} style={IS(T)} autoFocus />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={IS(T)}>
              {CAL_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
              ))}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ color: T.t2, fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>DATE</label>
                <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)} style={IS(T)} />
              </div>
              <div>
                <label style={{ color: T.t2, fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>TIME <span style={{ color: T.t3, fontWeight: 400 }}>(optional)</span></label>
                <input type="time" value={form.time || ''} onChange={e => setForm({ ...form, time: e.target.value })} style={IS(T)} />
              </div>
            </div>
            <textarea placeholder="Notes (optional)…" value={form.note}
              onChange={e => setForm({ ...form, note: e.target.value })}
              style={{ ...IS(T), height: 72, resize: 'vertical' }} />
            {/* Google Calendar sync indicator */}
            {gcalStatus === 'connected' && (
              <div style={{
                background: `${T.grn}15`, border: `1px solid ${T.grn}33`, borderRadius: 8,
                padding: '7px 12px', color: T.grn, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6
              }}>
                📅 Will also sync to your Google Calendar
              </div>
            )}
            <div style={{
              display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4,
              ...(isMobile ? {
                position: 'sticky', bottom: 0, background: T.bg2,
                padding: '12px 0 4px', borderTop: `1px solid ${T.brd}`,
                marginLeft: -24, marginRight: -24, paddingLeft: 24, paddingRight: 24
              } : {})
            }}>
              <button onClick={() => setShowForm(false)} style={GH(T)}>Cancel</button>
              <button onClick={save} style={BT(T.acc)}>Add Event</button>
            </div>
          </div>
        </Modal>
      )}

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} msg="Delete this calendar event?"
        onOk={() => { onDelete(confirm); setConfirm(null) }} />
    </div>
  )
}

// ── Task Collaborative Notes Panel ────────────────────────────────────────────
// ── Archive ───────────────────────────────────────────────────────────────────
function Archive({ tasks, members, user, onUnarchive, onDelete }) {
  const { T, bp } = useT()
  const isMobile = bp === 'mobile'
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('archivedAt')
  const [confirm, setConfirm] = useState(null)
  const visibleMembers = visibleMembersForUser(members, user)

  const archived = tasks.filter(t => {
    if (!t.archived) return false
    const assigneeMember = t.assignee ? members.find(m => m.id === t.assignee) : null
    return !assigneeMember || canSeeMember(user, assigneeMember)
  })

  const categories = [...new Set(archived.map(t => t.category).filter(Boolean))]

  const filtered = archived.filter(t => {
    if (filterAssignee !== 'all' && t.assignee !== filterAssignee) return false
    if (filterCategory !== 'all' && t.category !== filterCategory) return false
    if (filterType !== 'all' && t.type !== filterType) return false
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
      !(t.desc || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  }).sort((a, b) => {
    if (sortBy === 'archivedAt') return (b.archivedAt || 0) - (a.archivedAt || 0)
    if (sortBy === 'createdAt') return (b.createdAt || b.created || 0) - (a.createdAt || a.created || 0)
    if (sortBy === 'title') return a.title.localeCompare(b.title)
    return 0
  })

  const canManage = t => user?.role === 'admin' || t.creator === user?.id || t.createdBy === user?.id

  return (
    <div style={{ padding: isMobile ? '14px 12px' : 26, overflowY: 'auto', flex: 1, paddingBottom: isMobile ? 76 : 26 }}>
      <div style={{ marginBottom: isMobile ? 14 : 20 }}>
        <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: isMobile ? 18 : 22 }}>Archive</h2>
        <p style={{ color: T.t2, fontSize: isMobile ? 11 : 13, marginTop: 3 }}>
          Completed tasks archived after 5 days of inactivity. {archived.length} tasks archived.
        </p>
      </div>

      {/* Filter Bar */}
      <div style={{ background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14, padding: isMobile ? 12 : 18, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          {/* Search */}
          <div style={{ gridColumn: '1 / -1' }}>
            <input placeholder="Search archived tasks…" value={search} onChange={e => setSearch(e.target.value)}
              style={IS(T)} />
          </div>
          {/* Assignee */}
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={IS(T)}>
            <option value="all">All Members</option>
            {visibleMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {/* Category */}
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={IS(T)}>
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {/* Type */}
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={IS(T)}>
            <option value="all">All Types</option>
            <option value="private">🔒 Private</option>
            <option value="group">👥 Group</option>
            <option value="public">🌐 Public</option>
          </select>
          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={IS(T)}>
            <option value="archivedAt">Archived Date</option>
            <option value="createdAt">Created Date</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: T.t3, fontSize: 12 }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          {(filterAssignee !== 'all' || filterCategory !== 'all' || filterType !== 'all' || filterStatus !== 'all' || search) && (
            <button onClick={() => { setFilterAssignee('all'); setFilterCategory('all'); setFilterType('all'); setFilterStatus('all'); setSearch('') }}
              style={{ ...GH(T), fontSize: 11, padding: '3px 10px', color: T.red, borderColor: T.red + '55' }}>
              ✕ Clear filters
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '70px 0', color: T.t3 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <div style={{ fontSize: 14 }}>{archived.length === 0 ? 'No archived tasks yet.' : 'No tasks match your filters.'}</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(t => {
          const assignee = visibleMembers.find(m => m.id === t.assignee)
          const history = t.history || []
          return (
            <div key={t.id} style={{
              background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 14,
              padding: isMobile ? '12px 14px' : '16px 20px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start', gap: isMobile ? 10 : 16
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ color: T.t1, fontWeight: 600, fontSize: 14 }}>{t.title}</span>
                  {t.category && (
                    <span style={{
                      background: `${T.acc}15`, color: T.acc, fontSize: 10, fontWeight: 600,
                      padding: '1px 7px', borderRadius: 20, border: `1px solid ${T.acc}30`
                    }}>
                      {t.category}
                    </span>
                  )}
                  <span style={{
                    background: P_BG[t.priority], color: P_COLOR[t.priority],
                    fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase'
                  }}>
                    {t.priority}
                  </span>
                  {t.type === 'private' && <span style={{ color: T.t3, fontSize: 10 }}>🔒</span>}
                  {t.type === 'group' && <span style={{ color: T.t3, fontSize: 10 }}>👥</span>}
                  {t.type === 'public' && <span style={{ color: T.t3, fontSize: 10 }}>🌐</span>}
                </div>
                {t.desc && <p style={{ color: T.t2, fontSize: 12, marginBottom: 6, lineHeight: 1.4 }}>{t.desc}</p>}
                <div style={{ color: T.t3, fontSize: 11, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {t.createdAt && <span>Created: {new Date(t.createdAt).toLocaleDateString()}</span>}
                  {t.archivedAt && <span>Archived: {new Date(t.archivedAt).toLocaleDateString()}</span>}
                  {t.storyPoints > 0 && <span>SP {t.storyPoints} ({SP_HOURS(t.storyPoints)}h)</span>}
                </div>
                {/* Transition history summary */}
                {history.length > 1 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {history.slice(0, -1).map((h, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <span style={{ color: T.t3, fontSize: 10 }}>→</span>}
                        <span style={{
                          background: `${STATUS_COLOR[h.to] || T.acc}18`, color: STATUS_COLOR[h.to] || T.acc,
                          fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 4
                        }}>
                          {STATUS_LABEL[h.to] || h.to}
                        </span>
                      </React.Fragment>
                    ))}
                    <span style={{ color: T.t3, fontSize: 10 }}>→</span>
                    <span style={{ background: `${T.t3}18`, color: T.t3, fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 4 }}>
                      Archived
                    </span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
                {assignee && <Av member={assignee} size={28} />}
                {canManage(t) && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => onUnarchive(t.id)} title="Restore task"
                      style={{ ...GH(T), fontSize: 11, padding: '4px 10px', color: T.grn, borderColor: T.grn + '55' }}>
                      ↩ Restore
                    </button>
                    <button onClick={() => setConfirm(t.id)}
                      style={{ ...GH(T), padding: '4px 8px', color: T.red, borderColor: T.red + '55' }}>
                      <I n="trash" size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} msg="Permanently delete this archived task?"
        onOk={() => { onDelete(confirm); setConfirm(null) }} />
    </div>
  )
}

// ── Job Board ─────────────────────────────────────────────────────────────────
function JobBoard({ jobLinks, members, user, onAdd, onEdit, onDelete }) {
  const { T, bp } = useT()
  const isMobile = bp === 'mobile'
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const [confirmDel, setConfirmDel] = useState(null)
  const EMPTY = { title: '', company: '', url: '', desc: '', matchedTo: [] }
  const [form, setForm] = useState(EMPTY)
  const [formErr, setFormErr] = useState('')
  const visibleMembers = visibleMembersForUser(members, user)
  const visibleMemberIds = visibleMemberIdsForUser(members, user)

  const openAdd = () => { setForm(EMPTY); setEditTarget(null); setFormErr(''); setShowForm(true) }
  const openEdit = (j, e) => {
    e.stopPropagation()
    setForm({
      title: j.title, company: j.company || '', url: j.url, desc: j.desc || '',
      matchedTo: Array.isArray(j.matchedTo) ? j.matchedTo : (j.matchedTo ? [j.matchedTo] : [])
    })
    setEditTarget(j); setFormErr(''); setShowForm(true)
  }
  const toggleMember = id => setForm(f => ({
    ...f, matchedTo: f.matchedTo.includes(id) ? f.matchedTo.filter(x => x !== id) : [...f.matchedTo, id]
  }))
  const handleSubmit = () => {
    if (!form.title.trim()) return setFormErr('Job title is required.')
    if (!form.url.trim()) return setFormErr('Job URL is required.')
    if (!form.matchedTo.length) return setFormErr('Select at least one person.')
    let url = form.url.trim()
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    if (editTarget) {
      onEdit({
        ...editTarget, title: form.title.trim(), company: form.company.trim(),
        url, desc: form.desc.trim(), matchedTo: form.matchedTo, updatedAt: Date.now()
      })
      setSelected(s => s?.id === editTarget.id ? {
        ...s, title: form.title.trim(),
        company: form.company.trim(), url, desc: form.desc.trim(), matchedTo: form.matchedTo
      } : s)
    } else {
      onAdd({
        id: uid(), title: form.title.trim(), company: form.company.trim(),
        url, desc: form.desc.trim(), matchedTo: form.matchedTo, postedBy: user.id, postedAt: Date.now()
      })
    }
    setShowForm(false); setEditTarget(null)
  }
  const norm = j => ({ ...j, matchedTo: Array.isArray(j.matchedTo) ? j.matchedTo : (j.matchedTo ? [j.matchedTo] : []) })
  const filtered = (jobLinks || []).map(norm).filter(j => {
    if (filter === 'all') return user?.role === 'admin' || j.matchedTo.some(id => visibleMemberIds.has(id)) || j.postedBy === user.id
    if (filter === 'mine') return j.matchedTo.includes(user.id)
    return j.matchedTo.includes(filter)
  })
  const memberById = id => visibleMembers.find(m => m.id === id)
  const fmt = ts => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const ACCENTS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#a371f7', '#ffa657', '#39d353', '#ff7b72']
  const cardAccent = idx => ACCENTS[idx % ACCENTS.length]

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 12px 76px' : '24px 28px 26px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: 20, marginBottom: 2 }}>Job Board</h2>
          <div style={{ color: T.t3, fontSize: 13 }}>Share job postings matched to teammates</div>
        </div>
        <button onClick={openAdd} style={BT(T.acc, '#fff', { display: 'flex', alignItems: 'center', gap: 6 })}>
          <I n="plus" size={15} /> Share a Job
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: T.t3, fontSize: 12 }}>Filter:</span>
        {[{ id: 'all', label: 'All' }, { id: 'mine', label: 'Mine' }, ...visibleMembers.map(m => ({ id: m.id, label: m.name, member: m }))].map(opt => (
          <button key={opt.id} onClick={() => setFilter(opt.id)} style={{
            ...GH(T, filter === opt.id ? T.acc : T.t2),
            background: filter === opt.id ? T.acc + '22' : 'transparent',
            borderColor: filter === opt.id ? T.acc : T.brd,
            padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5,
          }}>{opt.member && <Av member={opt.member} size={16} />}{opt.label}</button>
        ))}
      </div>
      {filtered.length === 0 && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60, color: T.t3 }}>
          <I n="briefcase" size={40} color={T.brd} />
          <div style={{ fontSize: 14, fontWeight: 600, color: T.t2 }}>No postings yet</div>
          <div style={{ fontSize: 12 }}>Hit "Share a Job" to add one</div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
        {filtered.map((j, idx) => {
          const isOwner = j.postedBy === user.id || user.role === 'admin'
          const accent = cardAccent(idx)
          return (
            <div key={j.id} onClick={() => setSelected(j)} style={{
              position: 'relative', aspectRatio: '1/1', background: T.bg2,
              border: `1px solid ${T.brd}`, borderRadius: 12, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 8, padding: '12px 10px', overflow: 'hidden',
              transition: 'border-color .15s,transform .12s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.brd; e.currentTarget.style.transform = 'translateY(0)' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent, borderRadius: '12px 12px 0 0' }} />
              <div style={{ width: 36, height: 36, borderRadius: 10, background: accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <I n="briefcase" size={18} color={accent} />
              </div>
              <div style={{
                fontSize: 12, fontWeight: 600, color: T.t1, textAlign: 'center', lineHeight: 1.35,
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', width: '100%'
              }}>
                {j.title}
              </div>
              {isOwner && (
                <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                  <button onClick={e => openEdit(j, e)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.t3, padding: 3, borderRadius: 5, display: 'flex', alignItems: 'center' }}><I n="edit" size={12} /></button>
                  <button onClick={e => { e.stopPropagation(); setConfirmDel(j.id) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.t3, padding: 3, borderRadius: 5, display: 'flex', alignItems: 'center' }}><I n="trash" size={12} /></button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Job Details" width={480}>
        {selected && (() => {
          const j = norm(selected); const poster = memberById(j.postedBy)
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontWeight: 700, color: T.t1, fontSize: 17, lineHeight: 1.3 }}>{j.title}</div>
                {j.company && <div style={{ color: T.t3, fontSize: 13, marginTop: 3 }}>{j.company}</div>}
              </div>
              <div>
                <div style={{ fontSize: 12, color: T.t3, marginBottom: 6 }}>Matched for</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {j.matchedTo.map(id => {
                    const m = memberById(id); if (!m) return null; return (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: T.bg3, border: `1px solid ${T.brd}`, borderRadius: 20, padding: '4px 10px 4px 5px', fontSize: 12, color: T.t1 }}>
                        <Av member={m} size={20} />{m.name}
                      </div>
                    )
                  })}
                </div>
              </div>
              {j.desc && <div style={{ background: T.bg3, borderRadius: 8, padding: '10px 12px', color: T.t2, fontSize: 13, lineHeight: 1.6 }}>{j.desc}</div>}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: T.bg3, borderRadius: 8, padding: '10px 12px' }}>
                <I n="link" size={14} color={T.acc} style={{ marginTop: 1, flexShrink: 0 }} />
                <a href={j.url} target="_blank" rel="noopener noreferrer" style={{ color: T.acc, fontSize: 13, wordBreak: 'break-all', textDecoration: 'none', lineHeight: 1.5 }}>{j.url}</a>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                <a href={j.url} target="_blank" rel="noopener noreferrer"
                  style={{ ...BT(T.acc, '#fff', { fontSize: 13, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }), textDecoration: 'none' }}>
                  <I n="link" size={13} /> View Posting
                </a>
                <div style={{ color: T.t3, fontSize: 11, textAlign: 'right' }}>
                  <div>{fmt(j.postedAt)}</div>
                  {poster && <div style={{ marginTop: 1 }}>by {poster.name}</div>}
                </div>
              </div>
            </div>
          )
        })()}
      </Modal>
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditTarget(null) }} title={editTarget ? 'Edit Job Posting' : 'Share a Job Posting'} width={500}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div><label style={{ fontSize: 12, color: T.t3, display: 'block', marginBottom: 4 }}>Job Title *</label>
            <input style={IS(T)} value={form.title} placeholder="e.g. Senior Product Designer" onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><label style={{ fontSize: 12, color: T.t3, display: 'block', marginBottom: 4 }}>Company</label>
            <input style={IS(T)} value={form.company} placeholder="e.g. Acme Corp" onChange={e => setForm(f => ({ ...f, company: e.target.value }))} /></div>
          <div><label style={{ fontSize: 12, color: T.t3, display: 'block', marginBottom: 4 }}>Job Posting URL *</label>
            <input style={IS(T)} value={form.url} placeholder="https://..." onChange={e => setForm(f => ({ ...f, url: e.target.value }))} /></div>
          <div><label style={{ fontSize: 12, color: T.t3, display: 'block', marginBottom: 4 }}>Why it's a match (optional)</label>
            <textarea style={{ ...IS(T), minHeight: 64, resize: 'vertical' }} value={form.desc} placeholder="Describe why this role is a great fit…" onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} /></div>
          <div>
            <label style={{ fontSize: 12, color: T.t3, display: 'block', marginBottom: 6 }}>Match to * (select one or more)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {visibleMembers.map(m => {
                const sel = form.matchedTo.includes(m.id); return (
                  <button key={m.id} onClick={() => toggleMember(m.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
                    fontSize: 12, fontFamily: "'Plus Jakarta Sans',sans-serif",
                    border: `1.5px solid ${sel ? T.acc : T.brd}`, background: sel ? T.acc + '22' : T.bg3,
                    color: sel ? T.acc : T.t2, fontWeight: sel ? 600 : 400,
                  }}><Av member={m} size={18} />{m.name}{sel && <I n="check" size={12} color={T.acc} />}</button>
                )
              })}
            </div>
          </div>
          {formErr && <div style={{ color: T.red, fontSize: 13 }}>{formErr}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={() => { setShowForm(false); setEditTarget(null) }} style={GH(T)}>Cancel</button>
            <button onClick={handleSubmit} style={BT(T.acc, '#fff', { display: 'flex', alignItems: 'center', gap: 6 })}>
              <I n={editTarget ? 'edit' : 'share'} size={14} />{editTarget ? 'Save Changes' : 'Share Job'}
            </button>
          </div>
        </div>
      </Modal>
      <Confirm open={!!confirmDel} onClose={() => setConfirmDel(null)} msg="Remove this job posting?"
        onOk={() => { onDelete(confirmDel); setConfirmDel(null) }} />
    </div>
  )
}

// ── Deleted Dash ──────────────────────────────────────────────────────────────
function DeletedDash({ deletedItems, members, user, onRestore, onPurge }) {
  const { T } = useT()
  const [tab, setTab] = useState('tasks')
  const [confirm, setConfirm] = useState(null)
  const [tick, setTick] = useState(0)
  const DAY = 86400000
  const visibleMembers = visibleMembersForUser(members, user)

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(iv)
  }, [])

  const now = Date.now()
  const isExpired = (deletedAt) => (now - deletedAt) >= DAY
  const timeLeft = (deletedAt) => {
    const ms = DAY - (now - deletedAt)
    if (ms <= 0) return null
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`
  }

  const canPurge = (d) => {
    if (user?.role === 'admin') return true
    if (d.type === 'task') return d.data.creator === user?.id || d.data.createdBy === user?.id
    if (d.type === 'chat') return d.data.userId === user?.id
    return false
  }

  const items = (deletedItems || []).filter(d => tab === 'tasks' ? d.type === 'task' : d.type === 'chat').sort((a, b) => b.deletedAt - a.deletedAt)
  const taskCount = (deletedItems || []).filter(d => d.type === 'task').length
  const chatCount = (deletedItems || []).filter(d => d.type === 'chat').length
  const confirmItem = confirm ? (deletedItems || []).find(d => d.id === confirm) : null
  const confirmLabel = confirmItem
    ? confirmItem.type === 'task'
      ? `"${confirmItem.data.title}"`
      : `chat message from ${visibleMembers.find(m => m.id === confirmItem.data.userId)?.name || 'unknown'}`
    : ''

  return (
    <div style={{ padding: 26, overflowY: 'auto', flex: 1 }}>
      <div style={{ marginBottom: 22 }}>
        <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: 22 }}>🗑️ Deleted Items</h2>
        <p style={{ color: T.t2, fontSize: 13, marginTop: 3 }}>
          Items can be restored within 24 hours. Only the original creator can permanently delete.
        </p>
      </div>

      <div style={{
        display: 'flex', background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 10,
        overflow: 'hidden', marginBottom: 20, width: 'fit-content'
      }}>
        {[['tasks', `📋 Tasks (${taskCount})`], ['chat', `💬 Chat (${chatCount})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            background: tab === k ? T.acc : 'transparent', border: 'none',
            color: tab === k ? '#fff' : T.t2, padding: '7px 18px', cursor: 'pointer', fontSize: 13,
            fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: tab === k ? 600 : 400
          }}>{l}</button>
        ))}
      </div>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: T.t3 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Nothing here</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Deleted items appear here for 24 hours.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(d => {
            const expired = isExpired(d.deletedAt)
            const remaining = timeLeft(d.deletedAt)
            const sender = visibleMembers.find(m => m.id === d.data.userId)
            const assignee = visibleMembers.find(m => m.id === d.data.assignee)
            const deleter = visibleMembers.find(m => m.id === d.deletedBy)
            const allowPurge = canPurge(d)
            return (
              <div key={d.id} style={{
                background: T.bg2, border: `1px solid ${expired ? T.red + '55' : T.brd}`,
                borderRadius: 12, padding: '14px 16px', opacity: expired ? 0.65 : 1
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {d.type === 'task' && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          {assignee && <Av member={assignee} size={20} />}
                          <span style={{ color: T.t1, fontWeight: 600, fontSize: 14 }}>{d.data.title}</span>
                          <span style={{
                            background: `${STATUS_COLOR[d.data.status] || '#8b949e'}18`,
                            border: `1px solid ${STATUS_COLOR[d.data.status] || '#8b949e'}44`,
                            borderRadius: 5, padding: '1px 7px',
                            color: STATUS_COLOR[d.data.status] || T.t2, fontSize: 11, fontWeight: 600
                          }}>
                            {STATUS_LABEL[d.data.status] || d.data.status}
                          </span>
                        </div>
                        {d.data.desc && <p style={{ color: T.t2, fontSize: 12, margin: '4px 0' }}>{d.data.desc}</p>}
                      </>
                    )}
                    {d.type === 'chat' && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                        {sender && <Av member={sender} size={28} />}
                        <div>
                          <span style={{ color: T.t2, fontSize: 12, fontWeight: 600 }}>{sender?.name}</span>
                          <div style={{ color: T.t1, fontSize: 13, marginTop: 3 }}>{d.data.text || '(attachment only)'}</div>
                        </div>
                      </div>
                    )}
                    <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ color: T.t3, fontSize: 11 }}>
                        Deleted by {deleter?.name || 'unknown'} · {new Date(d.deletedAt).toLocaleString()}
                      </span>
                      {!expired && remaining && <span style={{ color: T.yl, fontSize: 11, fontWeight: 600 }}>⏱ {remaining}</span>}
                      {expired && <span style={{ color: T.red, fontSize: 11, fontWeight: 600 }}>⛔ Expired</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexShrink: 0, flexDirection: 'column', alignItems: 'flex-end' }}>
                    {!expired && (
                      <button onClick={() => onRestore(d.id)} style={{
                        ...BT(T.grn), fontSize: 11, padding: '5px 14px',
                        display: 'flex', alignItems: 'center', gap: 5
                      }}>↩ Restore</button>
                    )}
                    {allowPurge ? (
                      <button onClick={() => setConfirm(d.id)} style={{
                        background: `${T.red}12`, border: `1px solid ${T.red}44`,
                        borderRadius: 8, color: T.red, fontSize: 11, fontWeight: 600,
                        padding: '5px 12px', cursor: 'pointer',
                        fontFamily: "'Plus Jakarta Sans',sans-serif"
                      }}>🗑 Delete forever</button>
                    ) : (
                      <span style={{ color: T.t3, fontSize: 11, fontStyle: 'italic', textAlign: 'right' }}>
                        Only creator<br />can delete
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {confirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }} onClick={() => setConfirm(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: T.bg2, border: `2px solid ${T.red}66`,
            borderRadius: 16, padding: 32, maxWidth: 420, width: '90%',
            boxShadow: `0 12px 40px rgba(0,0,0,0.5)`
          }}>
            <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 14 }}>⚠️</div>
            <h3 style={{ color: T.t1, fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 10 }}>
              Permanently Delete?
            </h3>
            <p style={{ color: T.t2, fontSize: 13, textAlign: 'center', lineHeight: 1.7, marginBottom: 24 }}>
              <strong style={{ color: T.t1 }}>{confirmLabel}</strong>
              <br />will be <strong style={{ color: T.red }}>gone forever</strong> and cannot be recovered.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setConfirm(null)} style={{ ...GH(T), padding: '9px 24px', fontSize: 13 }}>Cancel</button>
              <button onClick={() => { onPurge(confirm); setConfirm(null) }} style={{ ...BT(T.red), padding: '9px 24px', fontSize: 13 }}>
                Yes, delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TaskCollabPanel({ task, members, user, taskNotes, onSave, onClose }) {
  const { T } = useT()
  const note = taskNotes?.[task.id] || {}
  const [mode, setMode] = useState('freetext') // 'freetext' | 'sections'
  const [content, setContent] = useState(note.content || '')
  const [sections, setSections] = useState(note.sections || [])
  const [saved, setSaved] = useState(true)
  const [banner, setBanner] = useState('')    // "X just updated this"
  const saveTimer = useRef()
  const lastLocalRef = useRef(0)   // timestamp of last LOCAL keystroke

  // Sync incoming real-time changes from other users
  useEffect(() => {
    const remote = taskNotes?.[task.id]
    if (!remote) return
    // Only apply if we haven't typed in last 2.5s (avoids cursor jumping)
    if (Date.now() - lastLocalRef.current > 2500) {
      if (remote.content !== undefined) setContent(remote.content)
      if (remote.sections !== undefined) setSections(remote.sections)
      if (remote.lastBy && remote.lastBy !== user.id) {
        const name = visibleMembersForUser(members, user).find(m => m.id === remote.lastBy)?.name || 'Someone'
        setBanner(`📡 ${name} updated this document`)
        setTimeout(() => setBanner(''), 4000)
      }
    }
  }, [taskNotes?.[task.id]?.lastAt])

  const persist = (c, s) => {
    setSaved(false)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      onSave(task.id, { content: c, sections: s, lastBy: user.id, lastAt: Date.now() })
      setSaved(true)
    }, 600)
  }

  const changeContent = val => {
    setContent(val); lastLocalRef.current = Date.now(); persist(val, sections)
  }

  const addSection = () => {
    const s = [...sections, { id: uid(), title: 'New Section', content: '' }]
    setSections(s); lastLocalRef.current = Date.now(); persist(content, s)
  }
  const updateSection = (id, field, val) => {
    const s = sections.map(x => x.id === id ? { ...x, [field]: val } : x)
    setSections(s); lastLocalRef.current = Date.now(); persist(content, s)
  }
  const removeSection = id => {
    const s = sections.filter(x => x.id !== id)
    setSections(s); lastLocalRef.current = Date.now(); persist(content, s)
  }

  const visibleMembers = visibleMembersForUser(members, user)
  const lastEditor = note.lastBy ? visibleMembers.find(m => m.id === note.lastBy) : null

  // Who can access this doc
  const accessMembers = user.role === 'admin'
    ? members
    : task.type === 'public'
      ? visibleMembers
      : visibleMembers.filter(m =>
        m.id === task.assignee || m.id === task.creator ||
        m.id === task.createdBy || m.id === user.id
      )

  const exportMd = () => {
    const body = mode === 'freetext'
      ? content
      : sections.map(s => `## ${s.title}\n\n${s.content}`).join('\n\n---\n\n')
    const a = document.createElement('a')
    a.href = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(`# ${task.title}\n\n${body}`)
    a.download = `${task.title.replace(/\s+/g, '-')}-collab.md`
    a.click()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2500,
      background: 'rgba(0,0,0,0.72)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 18,
        width: '100%', maxWidth: 800, height: '88vh',
        display: 'flex', flexDirection: 'column', boxShadow: `0 32px 80px ${T.shadow}`
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${T.brd}`,
          display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <h2 className="fh-fraunces" style={{
                color: T.t1, fontSize: 17,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>{task.title}</h2>
              <span style={{
                background: STATUS_COLOR[task.status] + '22',
                color: STATUS_COLOR[task.status], borderRadius: 20,
                fontSize: 10, fontWeight: 700, padding: '2px 8px', flexShrink: 0
              }}>{STATUS_LABEL[task.status]}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {lastEditor && (
                <span style={{ color: T.t3, fontSize: 11 }}>
                  Last edited by <strong style={{ color: T.t2 }}>{lastEditor.name}</strong>
                  {note.lastAt ? ` · ${new Date(note.lastAt).toLocaleString()}` : ''}
                </span>
              )}
              <span style={{ fontSize: 11, color: saved ? T.grn : T.yl, fontWeight: 600 }}>
                {saved ? '✓ Saved' : '● Saving…'}
              </span>
            </div>
          </div>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 2, background: T.bg3, borderRadius: 9, padding: 3, flexShrink: 0 }}>
            {[['freetext', '📝 Free Text'], ['sections', '📋 Sections']].map(([m, l]) => (
              <button key={m} onClick={() => setMode(m)} style={{
                background: mode === m ? T.acc : 'transparent',
                color: mode === m ? '#fff' : T.t2,
                border: 'none', borderRadius: 7, padding: '5px 13px',
                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                fontFamily: "'Plus Jakarta Sans',sans-serif"
              }}>{l}</button>
            ))}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.t2, cursor: 'pointer', fontSize: 22, lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>

        {/* ── Remote update banner ── */}
        {banner && (
          <div style={{
            background: `${T.acc}18`, borderBottom: `1px solid ${T.acc}33`,
            padding: '7px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{ color: T.acc, fontSize: 12 }}>{banner}</span>
            <button onClick={() => setBanner('')} style={{ background: 'none', border: 'none', color: T.acc, cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* ── Editor area ── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {mode === 'freetext' ? (
            <textarea
              value={content}
              onChange={e => changeContent(e.target.value)}
              placeholder={`Write collaborative notes for "${task.title}"…\n\nAll assigned members can edit this document in real-time.\n\nMarkdown supported:\n  # Heading 1\n  ## Heading 2\n  **bold**  _italic_\n  - bullet list\n  1. numbered list\n  > quote block`}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: T.t1, fontSize: 14, lineHeight: 1.85, padding: '22px 26px',
                resize: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif"
              }}
            />
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {sections.length === 0 && (
                <div style={{ textAlign: 'center', padding: '50px 0', color: T.t3 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                  <p style={{ marginBottom: 8 }}>No sections yet.</p>
                  <p style={{ fontSize: 12 }}>Sections let different members own different parts of the document.</p>
                </div>
              )}
              {sections.map((sec, idx) => (
                <div key={sec.id} style={{
                  marginBottom: 16, border: `1px solid ${T.brd}`,
                  borderRadius: 12, overflow: 'hidden'
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 14px', background: T.bg3,
                    borderBottom: `1px solid ${T.brd}`
                  }}>
                    <span style={{ color: T.t3, fontSize: 11, fontWeight: 700 }}>§{idx + 1}</span>
                    <input
                      value={sec.title}
                      onChange={e => updateSection(sec.id, 'title', e.target.value)}
                      style={{
                        flex: 1, background: 'none', border: 'none', outline: 'none',
                        color: T.t1, fontSize: 14, fontWeight: 700,
                        fontFamily: "'Plus Jakarta Sans',sans-serif"
                      }}
                      placeholder="Section title…"
                    />
                    <button onClick={() => removeSection(sec.id)}
                      style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', padding: 2 }}>
                      <I n="trash" size={13} />
                    </button>
                  </div>
                  <textarea
                    value={sec.content}
                    onChange={e => updateSection(sec.id, 'content', e.target.value)}
                    placeholder="Write section content… (Markdown supported)"
                    style={{
                      width: '100%', background: 'transparent', border: 'none', outline: 'none',
                      color: T.t1, fontSize: 13, lineHeight: 1.75,
                      padding: '12px 14px', resize: 'none', fontFamily: 'inherit',
                      minHeight: 110, boxSizing: 'border-box'
                    }}
                  />
                </div>
              ))}
              <button onClick={addSection} style={{
                ...BT(T.acc), display: 'flex', alignItems: 'center', gap: 6, marginTop: 6
              }}>
                <I n="plus" size={13} /> Add Section
              </button>
            </div>
          )}
        </div>

        {/* ── Footer: who has access + export ── */}
        <div style={{
          padding: '10px 20px', borderTop: `1px solid ${T.brd}`, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'
        }}>
          <span style={{ color: T.t3, fontSize: 12 }}>
            {task.type === 'public' ? '🌐 All members' : task.type === 'group' ? '👥 Group members' : '🔒 Assignee & creator'}
          </span>
          <div style={{ display: 'flex', gap: 2 }}>
            {accessMembers.slice(0, 7).map(m => (
              <Av key={m.id} member={m} size={22} />
            ))}
            {accessMembers.length > 7 && (
              <span style={{ color: T.t3, fontSize: 11, alignSelf: 'center', marginLeft: 4 }}>
                +{accessMembers.length - 7}
              </span>
            )}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={exportMd} style={{
              ...GH(T), fontSize: 12, display: 'flex', alignItems: 'center', gap: 5
            }}>
              <I n="download" size={12} /> Export .md
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Email Notification Helper ─────────────────────────────────────────────────
// Writes a doc to the Firestore `mail` collection.
// Requires the "Trigger Email from Firestore" Firebase Extension to actually send.
// If the Extension is not installed, this is a no-op — in-app notifications still work.
const sendTaskEmail = (toEmail, subject, htmlBody) => {
  if (!toEmail || !subject) return
  addDoc(MAIL_COL, {
    to: [toEmail],
    message: { subject, html: htmlBody },
  }).catch(() => { }) // fail silently
}

const buildAssignmentEmailHtml = (task, assigneeName, fromName, verb = 'assigned') => `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:580px;margin:0 auto;background:#f6f8fa;padding:24px;border-radius:12px;">
  <div style="background:#fff;border-radius:10px;padding:32px;border:1px solid #d0d7de;">
    <div style="margin-bottom:20px;">
      <span style="font-size:32px;">☀️</span>
      <h1 style="font-size:20px;margin:6px 0 0;color:#1f2328;">Daylighting</h1>
    </div>
    <h2 style="color:#0969da;font-size:18px;margin:0 0 16px;">Task ${verb} to you</h2>
    <p style="color:#57606a;margin:0 0 20px;">Hi <strong style="color:#1f2328;">${assigneeName}</strong>, <strong>${fromName}</strong> has ${verb} a task to you.</p>
    <div style="background:#f6f8fa;border-left:4px solid #0969da;border-radius:6px;padding:16px 20px;margin:0 0 24px;">
      <p style="font-size:17px;font-weight:700;color:#1f2328;margin:0 0 8px;">${task.title}</p>
      ${task.desc ? `<p style="color:#57606a;margin:0 0 8px;font-size:14px;">${task.desc}</p>` : ''}
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;">
        <span style="background:#fff;border:1px solid #d0d7de;border-radius:5px;padding:3px 10px;font-size:12px;color:#57606a;font-weight:600;">Priority: ${task.priority}</span>
        <span style="background:#fff;border:1px solid #d0d7de;border-radius:5px;padding:3px 10px;font-size:12px;color:#57606a;font-weight:600;">Type: ${task.type}</span>
        ${task.storyPoints ? `<span style="background:#fff;border:1px solid #d0d7de;border-radius:5px;padding:3px 10px;font-size:12px;color:#57606a;font-weight:600;">${task.storyPoints} SP</span>` : ''}
      </div>
    </div>
    <a href="${window.location.origin}" style="display:inline-block;background:#0969da;color:#fff;text-decoration:none;padding:11px 24px;border-radius:8px;font-weight:600;font-size:14px;">Open Daylighting →</a>
    <p style="color:#8c959f;font-size:12px;margin:24px 0 0;">You received this because a task was assigned to you on Daylighting. To stop receiving emails, contact your admin.</p>
  </div>
</div>`

// ── Password Reset Confirm (handles Firebase email link redirect) ─────────────
// Firebase sends reset emails that land on /__/auth/action.
// Configure Firebase Console → Auth → Templates → Password Reset → Action URL
// to point to https://team-dashboard-grg.web.app so users land here instead.
// This component reads ?mode=resetPassword&oobCode=XXX from the URL.
function PasswordResetConfirm({ onDone, members, onUpdate }) {
  const { T } = useT()
  const params = new URLSearchParams(window.location.search)
  const oobCode = params.get('oobCode')
  const [np1, setNp1] = useState('')
  const [np2, setNp2] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (!oobCode) { setErr('Invalid or missing reset code.'); setChecking(false); return }
    verifyPasswordResetCode(firebaseAuth, oobCode)
      .then(e => { setEmail(e); setChecking(false) })
      .catch(() => { setErr('This reset link has expired or already been used. Please request a new one.'); setChecking(false) })
  }, [oobCode])

  const doReset = async () => {
    if (np1.length < 6) return setErr('Password must be at least 6 characters.')
    if (np1 !== np2) return setErr('Passwords do not match.')
    try {
      // Reset Firebase Auth password
      await confirmPasswordReset(firebaseAuth, oobCode, np1)
      // ALSO update our Firestore members pw so the app stays in sync
      const member = members.find(m => m.email.toLowerCase() === email.toLowerCase())
      if (member) onUpdate(member.id, { pw: np1, mustChangePw: false })
      setOk(true)
      // Clear the oobCode from URL without reload
      window.history.replaceState({}, '', window.location.pathname)
      setTimeout(onDone, 2500)
    } catch (e) {
      setErr('Failed to reset password. The link may have expired — please request a new one.')
    }
  }

  const card = children => (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{
        background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 20, padding: 40,
        width: '100%', maxWidth: 420, boxShadow: `0 32px 80px ${T.shadow}`
      }}>
        {children}
      </div>
    </div>
  )

  if (checking) return card(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
      <p style={{ color: T.t2 }}>Verifying reset link…</p>
    </div>
  )

  if (ok) return card(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
      <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: 22, marginBottom: 8 }}>Password Updated!</h2>
      <p style={{ color: T.t2, fontSize: 13 }}>Returning to sign in…</p>
    </div>
  )

  return card(<>
    <div style={{ textAlign: 'center', marginBottom: 24 }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
      <h2 className="fh-fraunces" style={{ color: T.t1, fontSize: 22 }}>Set New Password</h2>
      {email && <p style={{ color: T.acc, fontSize: 13, marginTop: 6 }}>{email}</p>}
    </div>
    {err && <div style={{
      background: `${T.red}1a`, border: `1px solid ${T.red}44`, borderRadius: 8,
      padding: '10px 14px', color: T.red, fontSize: 13, marginBottom: 14
    }}>{err}</div>}
    {!err && <>
      <input type="password" placeholder="New password (min 6 chars)" value={np1}
        onChange={e => { setNp1(e.target.value); setErr('') }}
        style={{ ...IS(T), marginBottom: 10 }} autoFocus />
      <input type="password" placeholder="Confirm new password" value={np2}
        onChange={e => { setNp2(e.target.value); setErr('') }}
        onKeyDown={e => e.key === 'Enter' && doReset()}
        style={{ ...IS(T), marginBottom: 20 }} />
      <button onClick={doReset} style={{ ...BT(T.acc), width: '100%', padding: '11px' }}>
        Set New Password
      </button>
    </>}
    {err && <button onClick={onDone} style={{ ...GH(T), width: '100%', padding: '10px', marginTop: 12 }}>
      ← Back to Sign In
    </button>}
  </>)
}

// ── In-App Video Meeting (Jitsi Meet embedded) ────────────────────────────────
function VideoMeetingRoom({ meeting, user, onLeave }) {
  const { T } = useT()
  const containerRef = useRef()
  const apiRef = useRef(null)
  const [status, setStatus] = useState('loading') // 'loading'|'ready'|'error'
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    let disposed = false

    const init = () => {
      if (disposed || !containerRef.current) return
      if (!window.JitsiMeetExternalAPI) {
        setErrMsg('Jitsi Meet library failed to load. Check your internet connection.')
        setStatus('error'); return
      }

      // Room name: only alphanumeric + hyphens, max 50 chars
      const room = `dl-${meeting.id}`.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50)

      try {
        apiRef.current = new window.JitsiMeetExternalAPI('meet.jit.si', {
          roomName: room,
          width: '100%',
          height: '100%',
          parentNode: containerRef.current,
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableDeepLinking: true,
            prejoinPageEnabled: false,
            enableWelcomePage: false,
            disableInitialGUM: false,
            toolbarButtons: [
              'microphone', 'camera', 'closedcaptions', 'desktop',
              'fullscreen', 'fodeviceselection', 'hangup', 'chat',
              'raisehand', 'videoquality', 'filmstrip', 'participants-pane', 'tileview',
            ],
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_CHROME_EXTENSION_BANNER: false,
            DEFAULT_BACKGROUND: '#0d1117',
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
          },
          userInfo: {
            displayName: user.name || 'Daylighting User',
            email: user.email || '',
          },
        })

        // Clear loading when Jitsi signals ready
        const onJoined = () => { if (!disposed) setStatus('ready') }
        apiRef.current.addEventListener('videoConferenceJoined', onJoined)
        apiRef.current.addEventListener('readyToClose', onLeave)

        // Fallback: if joined event never fires, clear loading after 10s
        const fallback = setTimeout(() => { if (!disposed) setStatus('ready') }, 10000)
        apiRef.current.addEventListener('videoConferenceJoined', () => clearTimeout(fallback))

      } catch (e) {
        setErrMsg('Could not start meeting: ' + e.message)
        setStatus('error')
      }
    }

    // Load Jitsi External API script once
    if (window.JitsiMeetExternalAPI) {
      init()
    } else {
      // Remove any stale failed script
      const old = document.querySelector('script[src*="meet.jit.si/external_api"]')
      if (old) old.remove()

      const s = document.createElement('script')
      s.src = 'https://meet.jit.si/external_api.js'
      s.async = true
      s.onload = init
      s.onerror = () => {
        setErrMsg('Failed to load Jitsi Meet. Please check your connection and try again.')
        setStatus('error')
      }
      document.head.appendChild(s)
    }

    return () => {
      disposed = true
      if (apiRef.current) { try { apiRef.current.dispose() } catch (_) { }; apiRef.current = null }
    }
  }, [meeting.id])  // only re-init if meeting changes

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 3000, background: '#0d1117',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Thin header bar ── */}
      <div style={{
        height: 48, background: '#161b22', borderBottom: '1px solid #30363d',
        display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12,
        flexShrink: 0, zIndex: 1,
      }}>
        <span style={{ fontSize: 18 }}>☀️</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            color: '#e6edf3', fontWeight: 700, fontSize: 14,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {meeting.title}
          </span>
          <span style={{ color: '#8b949e', fontSize: 12, marginLeft: 10 }}>
            {new Date(meeting.time).toLocaleString()} · {meeting.duration} min
          </span>
        </div>
        {status === 'ready' && (
          <span style={{
            background: '#3fb95020', border: '1px solid #3fb95050',
            color: '#3fb950', borderRadius: 20, fontSize: 11, fontWeight: 700,
            padding: '3px 10px'
          }}>● LIVE</span>
        )}
        <button onClick={() => { if (apiRef.current) { try { apiRef.current.executeCommand('hangup') } catch (_) { } }; setTimeout(onLeave, 400) }}
          style={{
            background: '#f85149', border: 'none', borderRadius: 8,
            color: '#fff', cursor: 'pointer', padding: '7px 18px',
            fontSize: 13, fontWeight: 700, flexShrink: 0
          }}>
          ✕ Leave
        </button>
      </div>

      {/* ── Jitsi container — always in DOM so iframe can load ── */}
      <div ref={containerRef} style={{
        flex: 1, overflow: 'hidden', position: 'relative',
        // Hide via opacity while loading so Jitsi still loads in background
        opacity: status === 'loading' ? 0 : 1,
        transition: 'opacity 0.4s',
      }} />

      {/* ── Loading overlay — sits above Jitsi, disappears when ready ── */}
      {status === 'loading' && (
        <div style={{
          position: 'absolute', top: 48, left: 0, right: 0, bottom: 0,
          background: '#0d1117',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 18,
          zIndex: 2, pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 48 }}>☀️</span>
          <div style={{ color: '#e6edf3', fontWeight: 700, fontSize: 20 }}>{meeting.title}</div>
          <div style={{ color: '#8b949e', fontSize: 14 }}>Starting video meeting…</div>
          <div style={{
            width: 40, height: 40, border: '3px solid #30363d',
            borderTop: '3px solid #58a6ff', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ color: '#8b949e', fontSize: 12, marginTop: 4 }}>
            Please allow camera & microphone access when prompted
          </div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* ── Error state ── */}
      {status === 'error' && (
        <div style={{
          position: 'absolute', top: 48, left: 0, right: 0, bottom: 0,
          background: '#0d1117',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 2,
        }}>
          <span style={{ fontSize: 48 }}>⚠️</span>
          <div style={{ color: '#f85149', fontSize: 15, textAlign: 'center', maxWidth: 440, lineHeight: 1.6 }}>
            {errMsg}
          </div>
          <button onClick={onLeave} style={{
            background: '#30363d', border: 'none', borderRadius: 8,
            color: '#e6edf3', padding: '11px 28px', cursor: 'pointer', fontSize: 14,
          }}>Close</button>
        </div>
      )}
    </div>
  )
}

// ── Error Boundary — catches crashes and shows a friendly message ─────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#161b22', border: '1px solid #f85149', borderRadius: 16, padding: 36, maxWidth: 520, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ color: '#e6edf3', fontFamily: "'Plus Jakarta Sans',sans-serif", marginBottom: 12 }}>Something went wrong</h2>
          <p style={{ color: '#8b949e', fontSize: 14, marginBottom: 20, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
            {this.state.error?.message || 'An unexpected error occurred. Try reloading Daylighting.'}
          </p>
          <button onClick={() => window.location.reload()}
            style={{ background: '#58a6ff', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
            Reload App
          </button>
        </div>
      </div>
    )
    return this.props.children
  }
}

// ── Root App ──────────────────────────────────────────────────────────────────
function App() {
  // Dark mode: per-user localStorage, NOT synced to Firestore (fix #6)
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('dl_dark')
    return stored !== null ? stored === 'true' : true
  })
  const toggleDark = (val) => {
    const next = typeof val === 'boolean' ? val : !dark
    setDark(next)
    localStorage.setItem('dl_dark', String(next))
  }
  const T = dark ? DARK : LIGHT
  const bp = useBreakpoint()
  const isMobile = bp === 'mobile'
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [user, setUser] = useState(null)
  const [members, setMembers] = useState(SEED_MEMBERS)
  const [presenceTick, setPresenceTick] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setPresenceTick(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])

  const [presence, setPresence] = useState({})

  const [tasks, setTasks] = useState(SEED_TASKS)
  const [messages, setMessages] = useState(SEED_MESSAGES)
  const [meetings, setMeetings] = useState(SEED_MEETINGS)
  const [projects, setProjects] = useState(SEED_PROJECTS)
  const [rewards, setRewards] = useState([])
  const [notes, setNotes] = useState({ meeting: '', lecture: '', personal: '' })
  const [files, setFiles] = useState([])
  const [groupCanvases, setGroupCanvases] = useState({})
  const [groupNotes, setGroupNotes] = useState({})
  const [page, setPage] = useState(() => localStorage.getItem('dl_page') || 'overview')
  const [timeState, setTimeState] = useState({ task: 0, break: 0, idle: 0 })
  const onlineTime = timeState.task + timeState.break + timeState.idle
  const [activeSession, setActiveSession] = useState(null)
  const [onBreak, setOnBreak] = useState(false)
  const [timeLogs, setTimeLogs] = useState([])
  const [focusResetAt, setFocusResetAt] = useState(0)
  const [privateCanvases, setPrivateCanvases] = useState({})
  const [privateNotes, setPrivateNotes] = useState({})
  const [privateMaterials, setPrivateMaterials] = useState({})
  const [calendarEvents, setCalendarEvents] = useState([])
  const [notifications, setNotifications] = useState([])
  const [taskNotes, setTaskNotes] = useState({})
  const [categories, setCategories] = useState([])
  const [jobLinks, setJobLinks] = useState([])
  const [toast, setToast] = useState(null)
  const [collabTask, setCollabTask] = useState(null) // task whose collab doc is open
  const prevNotifsRef = useRef([])
  const [appLoading, setAppLoading] = useState(true)  // prevents login flash on refresh
  const timerRef = useRef(null)
  const lastTimerTickRef = useRef(null)
  const loginTimeRef = useRef(null)
  const sessionIdRef = useRef(null)
  const sessionTaskBaseRef = useRef(0)
  const mainUnsubRef = useRef(null)
  const tasksRef = useRef(tasks)
  useEffect(() => { tasksRef.current = tasks }, [tasks])
  const timeLogsRef = useRef(timeLogs)
  useEffect(() => { timeLogsRef.current = timeLogs }, [timeLogs])

  // ── Firestore persistence ──────────────────────────────────────────────────
  const [dbLoaded, setDbLoaded] = useState(false)
  const [dbLoadError, setDbLoadError] = useState(null)
  const [deletedItems, setDeletedItems] = useState([])

  // remoteRef stores the exact object references received from Firestore.
  // Save-effects compare state === remoteRef[field] — if they match, the value
  // came from a snapshot and must NOT be written back (prevents loops / data loss).
  const remoteRef = useRef({})
  const schedulerRef = useRef(createSaveScheduler())

  // Helper: apply remote data and record the references
  const applyRemote = useCallback((d) => {
    const s = schedulerRef.current
    if (!s.hasPending('members') && Array.isArray(d.members) && d.members.length) { remoteRef.current.members = d.members; setMembers(d.members); cacheMembersToStorage(d.members) }
    if (!s.hasPending('tasks') && Array.isArray(d.tasks)) { remoteRef.current.tasks = d.tasks; setTasks(d.tasks) }
    if (!s.hasPending('messages') && Array.isArray(d.messages)) { remoteRef.current.messages = d.messages; setMessages(d.messages) }
    if (!s.hasPending('meetings') && Array.isArray(d.meetings)) { remoteRef.current.meetings = d.meetings; setMeetings(d.meetings) }
    if (!s.hasPending('projects') && Array.isArray(d.projects) && d.projects.length) { remoteRef.current.projects = d.projects; setProjects(d.projects) }
    if (!s.hasPending('notes') && d.notes) { remoteRef.current.notes = d.notes; setNotes(d.notes) }
    if (!s.hasPending('files') && Array.isArray(d.files)) { remoteRef.current.files = d.files; setFiles(d.files) }
    if (!s.hasPending('groupNotes') && d.groupNotes) { remoteRef.current.groupNotes = d.groupNotes; setGroupNotes(d.groupNotes) }
    if (!s.hasPending('rewards') && Array.isArray(d.rewards)) { remoteRef.current.rewards = d.rewards; setRewards(d.rewards) }
    if (!s.hasPending('privateCanvases') && d.privateCanvases) { remoteRef.current.privateCanvases = d.privateCanvases; setPrivateCanvases(d.privateCanvases) }
    if (!s.hasPending('privateNotes') && d.privateNotes) { remoteRef.current.privateNotes = d.privateNotes; setPrivateNotes(d.privateNotes) }
    if (!s.hasPending('privateMaterials') && d.privateMaterials) { remoteRef.current.privateMaterials = d.privateMaterials; setPrivateMaterials(d.privateMaterials) }
    if (!s.hasPending('timeLogs') && Array.isArray(d.timeLogs)) { remoteRef.current.timeLogs = d.timeLogs; setTimeLogs(d.timeLogs) }
    if (!s.hasPending('focusResetAt') && typeof d.focusResetAt === 'number') { remoteRef.current.focusResetAt = d.focusResetAt; setFocusResetAt(d.focusResetAt) }
    if (!s.hasPending('calendarEvents') && Array.isArray(d.calendarEvents)) { remoteRef.current.calendarEvents = d.calendarEvents; setCalendarEvents(d.calendarEvents) }
    if (!s.hasPending('notifications') && Array.isArray(d.notifications)) { remoteRef.current.notifications = d.notifications; setNotifications(d.notifications) }
    // NOTE: dark is intentionally NOT synced from Firestore — it's per-user via localStorage
    if (!s.hasPending('groupCanvases') && d.groupCanvases) { remoteRef.current.groupCanvases = d.groupCanvases; setGroupCanvases(d.groupCanvases) }
    if (!s.hasPending('categories') && Array.isArray(d.categories)) { remoteRef.current.categories = d.categories; setCategories(d.categories) }
    if (!s.hasPending('jobLinks') && Array.isArray(d.jobLinks)) { remoteRef.current.jobLinks = d.jobLinks; setJobLinks(d.jobLinks) }
    // deletedItems — always wire remoteRef so the saveAll guard works (prevents spurious writes)
    const _di = Array.isArray(d.deletedItems) ? d.deletedItems : []
    remoteRef.current.deletedItems = _di
    if (!s.hasPending('deletedItems')) setDeletedItems(_di)
    if (d.presence) { remoteRef.current.presence = d.presence; setPresence(prev => ({ ...prev, ...d.presence })) }
  }, [])

  // ── Main Firestore listener ─────────────────────────────────────────────────
  useEffect(() => {
    // Real-time listener started unconditionally — acts as both initial load AND
    // live sync. Previously nested inside getDoc.then(), which meant a failed
    // getDoc (network hiccup, cold start) would prevent the listener from ever
    // starting and leave the app stuck on an empty "no members" state.
    mainUnsubRef.current = onSnapshot(FH_DOC, snap => {
      // Apply remote data BEFORE setting dbLoaded so the session-restore effect
      // always sees populated members when it runs.
      if (snap.exists()) {
        const d = snap.data()
        applyRemote(d)
        // Keep the logged-in user object fresh (e.g. name/avatar changed on another client)
        setUser(cu => {
          if (!cu) return cu
          const fresh = (d.members || []).find(m => m.id === cu.id)
          return fresh ? { ...cu, ...fresh } : cu
        })
      }
      setDbLoaded(true)
    }, e => {
      console.error('[FlowHub] Firestore snapshot error:', e?.code, e?.message)
      setDbLoadError(e)
      setDbLoaded(true)  // Don't hang on the loading screen if Firestore is unreachable
    })

    // Separate listener for group canvas (stored in its own doc to avoid 1MB limit)
    const unsubCanvas = onSnapshot(doc(db, 'flowhub', 'canvas'), snap => {
      if (snap.exists()) {
        const d = snap.data()
        if (d.groupCanvases) {
          remoteRef.current.groupCanvases = d.groupCanvases
          setGroupCanvases(gc => JSON.stringify(gc) === JSON.stringify(d.groupCanvases) ? gc : d.groupCanvases)
        }
      }
    }, e => console.error('[FlowHub] Canvas snapshot error:', e?.code, e?.message))

    return () => {
      if (mainUnsubRef.current) mainUnsubRef.current()
      unsubCanvas()
    }
  }, [applyRemote])

  // ── Task Notes — separate Firestore doc (avoids 1MB limit on main doc) ────
  const TASK_NOTES_DOC = doc(db, 'flowhub', 'tasknotes')
  const taskNotesSaveRef = useRef(null)
  const taskNotesRemote = useRef({})

  useEffect(() => {
    // Initial load
    getDoc(TASK_NOTES_DOC).then(snap => {
      if (snap.exists()) { taskNotesRemote.current = snap.data(); setTaskNotes(snap.data()) }
    }).catch(e => console.error('[FlowHub] taskNotes initial load failed:', e?.code, e?.message))
    // Real-time listener
    const unsub = onSnapshot(TASK_NOTES_DOC, snap => {
      if (!snap.exists()) return
      const d = snap.data()
      taskNotesRemote.current = d
      setTaskNotes(d)
    }, e => console.error('[FlowHub] taskNotes snapshot error:', e?.code, e?.message))
    return () => unsub()
  }, [])

  const saveTaskNote = useCallback((taskId, noteData) => {
    setTaskNotes(prev => ({ ...prev, [taskId]: noteData }))
    clearTimeout(taskNotesSaveRef.current)
    taskNotesSaveRef.current = setTimeout(() => {
      setDoc(TASK_NOTES_DOC, { [taskId]: noteData }, { merge: true }).catch(e => {
        console.error('[FlowHub] taskNote save failed:', e?.code, e?.message)
      })
    }, 600)
  }, [])



  // Only write to Firestore if the value is DIFFERENT from what we last received
  // from a snapshot. Same reference = came from remote, don't echo it back.
  const saveAll = useCallback((patch) => {
    const key = Object.keys(patch)[0]
    const value = patch[key]
    if (value === remoteRef.current[key]) return  // remote data — skip to prevent loop

    // Firebase Firestore rejects undefined values. Strip them out recursively.
    const cleanPatch = JSON.parse(JSON.stringify(patch))

    schedulerRef.current.schedule(key, async () => {
      try {
        if (key.includes('.')) {
          await updateDoc(FH_DOC, cleanPatch)
        } else {
          await setDoc(FH_DOC, cleanPatch, { merge: true })
        }
      } catch (e) {
        console.error(`[FlowHub] Firestore write failed for "${key}":`, e?.code, e?.message)
      }
    }, 800)
  }, [])

  const updatePresence = useCallback((id, online) => {
    if (!id) return
    const p = { online, lastSeen: Date.now() }
    setPresence(prev => ({ ...prev, [id]: p }))
    saveAll({ [`presence.${id}`]: p })
  }, [saveAll])

  const activeMembers = useMemo(() => {
    const ids = new Set()
    for (const [id, p] of Object.entries(presence)) {
      if (p.online && (presenceTick - (p.lastSeen || 0) < 300000)) ids.add(id)
    }
    return ids
  }, [presence, presenceTick])

  useEffect(() => {
    if (!user) return
    // Initial mark as online
    updatePresence(user.id, true)
    const id = setInterval(() => updatePresence(user.id, true), 120000) // 2 min heartbeat
    return () => clearInterval(id)
  }, [user?.id, updatePresence])

  useEffect(() => { if (dbLoaded) saveAll({ members }) }, [members, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ tasks }) }, [tasks, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ messages }) }, [messages, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ meetings }) }, [meetings, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ projects }) }, [projects, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ notes }) }, [notes, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ files }) }, [files, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ groupCanvases }) }, [groupCanvases, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ groupNotes }) }, [groupNotes, dbLoaded])
  // dark is NOT synced to Firestore — saved per-user in localStorage instead
  useEffect(() => { if (dbLoaded) saveAll({ rewards }) }, [rewards, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ privateCanvases }) }, [privateCanvases, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ privateNotes }) }, [privateNotes, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ privateMaterials }) }, [privateMaterials, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ timeLogs }) }, [timeLogs, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ focusResetAt }) }, [focusResetAt, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ calendarEvents }) }, [calendarEvents, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ notifications }) }, [notifications, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ categories }) }, [categories, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ jobLinks }) }, [jobLinks, dbLoaded])
  useEffect(() => { if (dbLoaded) saveAll({ deletedItems }) }, [deletedItems, dbLoaded])
  useEffect(() => { localStorage.setItem('dl_page', page) }, [page])

  // ── Firebase Auth persistence (stay logged in across refreshes) ──────────
  const [authSettled, setAuthSettled] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, firebaseUser => {
      if (!firebaseUser) { setAuthSettled(true); return }
      const tryMatch = (attempt = 0) => {
        setMembers(currentMembers => {
          const match = currentMembers.find(m =>
            m.email.toLowerCase() === firebaseUser.email.toLowerCase()
          )
          if (match) {
            setUser(u => u ? u : match)
            setAuthSettled(true)
            setAppLoading(false)  // ensure loading clears for Google SSO session restores
          } else if (attempt < 15) {
            setTimeout(() => tryMatch(attempt + 1), 300)
          } else {
            setAuthSettled(true)  // give up after ~4.5s
          }
          return currentMembers
        })
      }
      setTimeout(tryMatch, 200)
    })
    return unsub
  }, [])

  // ── Email/password session restore + appLoading gate ─────────────────────
  // Waits for BOTH Firestore data AND Firebase Auth to settle before showing UI.
  // This fully eliminates the login flash on refresh.
  useEffect(() => {
    if (!dbLoaded) return
    const savedUid = localStorage.getItem('dl_uid')
    if (savedUid) {
      setMembers(curr => {
        const m = curr.find(x => x.id === savedUid)
        if (m) {
          setUser(m); setAuthSettled(true)
        } else if (curr.length > 0) {
          // Only purge stale session when Firestore returned real members but this
          // UID wasn't among them. If curr is empty it means Firestore failed to
          // load (permission-denied or network error) — don't clear the session.
          localStorage.removeItem('dl_uid')
        }
        return curr
      })
    }
    // Wait up to 2500ms for Firebase Auth onAuthStateChanged + tryMatch to complete.
    // If Firebase still has an active session (Google SSO restore), don't dismiss
    // the loading screen — let tryMatch finish finding their member record instead.
    const t = setTimeout(() => {
      if (!firebaseAuth.currentUser) {
        // No Firebase session at all → show login screen
        setAuthSettled(true)
        setAppLoading(false)
      }
      // If currentUser exists, onAuthStateChanged tryMatch is still polling (up to 4.5s).
      // It will call setAuthSettled(true) itself, which triggers the effect below.
    }, 2500)
    return () => clearTimeout(t)
  }, [dbLoaded])

  // Only clear loading once both DB and Auth have settled
  useEffect(() => {
    if (dbLoaded && authSettled) setAppLoading(false)
  }, [dbLoaded, authSettled])

  // ── Show toast when a new notification arrives for this user ─────────────
  useEffect(() => {
    if (!user || !dbLoaded) return
    const mine = notifications.filter(n => n.userId === user.id && !n.read)
    const prev = prevNotifsRef.current
    const newOne = mine.find(n => !prev.find(p => p.id === n.id))
    if (newOne) setToast(newOne)
    prevNotifsRef.current = mine
  }, [notifications, user?.id, dbLoaded])
  useEffect(() => {
    let el = document.getElementById('fh3css')
    if (!el) { el = document.createElement('style'); el.id = 'fh3css'; document.head.appendChild(el) }
    el.textContent = mkCSS(dark)
  }, [dark])

  // ── Online timer (persists per day) ────────────────────────────────────────
  const todayStr = () => new Date().toISOString().slice(0, 10)
  const sessionStorageKey = userId => `dl_active_session_${userId}`
  const getLoggedDayUsage = (logs, userId, date, excludeSessionId = null, excludeSessionGroupKey = null) =>
    sumTimeStates(canonicalizeSessionLogs((logs || [])
      .filter(l =>
        l.userId === userId &&
        l.date === date &&
        l.id !== excludeSessionId &&
        (!excludeSessionGroupKey || getSessionGroupKey(l) !== excludeSessionGroupKey)
      ))
      .map(getLogDisplayTimeState))

  // On login: continue an open session after refresh, or start a fresh session after logout.
  useEffect(() => {
    if (!user || !dbLoaded) return
    const today = todayStr()
    const storedSession = (() => {
      try { return JSON.parse(localStorage.getItem(sessionStorageKey(user.id)) || 'null') }
      catch { return null }
    })()
    const canUseStoredSession = storedSession?.date === today && storedSession?.id
    const storedOpen = canUseStoredSession
      ? (timeLogsRef.current || []).find(l => l.id === storedSession.id && l.userId === user.id && l.date === today && !l.manual && !l.logoutAt)
      : null
    const rawLatestOpen = storedOpen || null
    const latestOpenGroup = rawLatestOpen
      ? (timeLogsRef.current || []).filter(l => !l.manual && l.userId === user.id && l.date === today && getSessionGroupKey(l) === getSessionGroupKey(rawLatestOpen))
      : []
    const latestOpen = getCanonicalSessionLog(latestOpenGroup) || rawLatestOpen
    const sessionId = (latestOpen?.id || canUseStoredSession) ? (latestOpen?.id || storedSession.id) : uid()
    const loginAt = latestOpen?.loginAt || storedSession?.loginAt || Date.now()
    const restoredSessionState = latestOpen ? getLogDisplayTimeState(latestOpen) : { ...EMPTY_TIME_STATE }
    const taskFloor = getTodayTaskTimerSeconds({
      tasks: tasksRef.current,
      userId: user.id,
      today,
      nowMs: Date.now(),
    })

    sessionIdRef.current = sessionId
    loginTimeRef.current = loginAt
    sessionTaskBaseRef.current = Math.max(0, taskFloor - (restoredSessionState.task || 0))
    setActiveSession({ id: sessionId, loginAt, date: today })
    localStorage.setItem(sessionStorageKey(user.id), JSON.stringify({ id: sessionId, loginAt, date: today }))
    const restoredBreakState = resolveInitialBreakState({ userId: user.id, tasks: tasksRef.current })
    setOnBreak(restoredBreakState)
    setStoredBreakState(user.id, restoredBreakState)
    setTimeState(restoredSessionState)
    lastTimerTickRef.current = Date.now()
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setOnBreak(ob => {
        const tickAt = Date.now()
        const deltaSeconds = Math.floor((tickAt - (lastTimerTickRef.current || tickAt)) / 1000)
        lastTimerTickRef.current = tickAt
        setTimeState(prev => {
          const uid = user.id
          const currentDate = todayStr()
          const activeGroupKey = getSessionGroupKey({
            userId: uid,
            date: currentDate,
            loginAt: loginTimeRef.current,
            id: sessionIdRef.current,
          })
          const dayUsage = getLoggedDayUsage(timeLogsRef.current, uid, currentDate, sessionIdRef.current, activeGroupKey)
          const mode = getActiveTimerMode({
            tasks: tasksRef.current,
            userId: uid,
            onBreak: ob,
            breakSeconds: (dayUsage.break || 0) + (prev.break || 0),
            breakLimitSeconds: BREAK_LIMIT_SECS,
          })
          const taskFloor = getTodayTaskTimerSeconds({
            tasks: tasksRef.current,
            userId: uid,
            today: currentDate,
            nowMs: tickAt,
          })
          const sessionTaskFloor = Math.max(0, taskFloor - (sessionTaskBaseRef.current || 0))
          const productiveRoom = Math.max(0, PRODUCTIVE_LIMIT_SECS - (dayUsage.task || 0))
          const sessionTaskFloorCapped = Math.min(sessionTaskFloor, productiveRoom)
          const productiveOverflow = Math.max(0, sessionTaskFloor - productiveRoom)
          const taskCaughtUp = mode === 'task' && (sessionTaskFloorCapped > (prev.task || 0) || productiveOverflow > (prev.idle || 0))
          const synced = taskCaughtUp
            ? { ...prev, task: Math.max(prev.task || 0, sessionTaskFloorCapped), idle: Math.max(prev.idle || 0, productiveOverflow) }
            : prev
          const deltaForMode = mode === 'task' && taskCaughtUp ? 0 : deltaSeconds
          return advanceTimeState({
            state: synced,
            deltaSeconds: deltaForMode,
            mode,
            breakLimitSeconds: BREAK_LIMIT_SECS,
            breakUsedSeconds: dayUsage.break || 0,
            productiveLimitSeconds: PRODUCTIVE_LIMIT_SECS,
            productiveUsedSeconds: dayUsage.task || 0,
          })
        })
        return ob
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [user?.id, dbLoaded])

  // Save running session time every 30s so refresh doesn't lose it
  useEffect(() => {
    if (!user || !dbLoaded || onlineTime === 0) return
    const today = todayStr()
    setTimeLogs(prev => {
      const sessionId = sessionIdRef.current || uid()
      if (!sessionIdRef.current) sessionIdRef.current = sessionId
      const idx = prev.findIndex(l => l.id === sessionId && l.userId === user.id && l.date === today && !l.manual)
      const newData = { id: sessionId, seconds: onlineTime, taskSeconds: timeState.task, breakSeconds: timeState.break, idleSeconds: timeState.idle }
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = { ...updated[idx], ...newData }
        return updated
      }
      return [...prev, { userId: user.id, date: today, ...newData, loginAt: loginTimeRef.current }]
    })
  }, [Math.floor(onlineTime / 30)])  // save every 30 seconds

  // If Firebase has a larger canonical copy of the active session, bring the
  // local live timer up to it so user and admin panels stay in sync.
  useEffect(() => {
    if (!user || !dbLoaded || !activeSession?.id) return
    const activeKey = getSessionGroupKey({
      userId: user.id,
      date: activeSession.date,
      loginAt: activeSession.loginAt,
      id: activeSession.id,
    })
    const activeGroup = (timeLogs || []).filter(l =>
      !l.manual &&
      l.userId === user.id &&
      l.date === activeSession.date &&
      (l.id === activeSession.id || getSessionGroupKey(l) === activeKey)
    )
    const canonical = getCanonicalSessionLog(activeGroup)
    const savedTotal = getLogTotalSeconds(canonical)
    if (!canonical || savedTotal <= onlineTime + 1) return

    const syncedState = getLogDisplayTimeState(canonical)
    const taskFloor = getTodayTaskTimerSeconds({
      tasks: tasksRef.current,
      userId: user.id,
      today: activeSession.date,
      nowMs: Date.now(),
    })
    sessionTaskBaseRef.current = Math.max(0, taskFloor - (syncedState.task || 0))
    setTimeState(syncedState)
  }, [timeLogs, user?.id, dbLoaded, activeSession?.id, activeSession?.date, activeSession?.loginAt, onlineTime])

  // Midnight reset: save today's log and restart counter for the new day
  useEffect(() => {
    if (!user || !dbLoaded) return
    const scheduleMidnightReset = () => {
      const now = new Date()
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      const msUntilMidnight = tomorrow - now
      return setTimeout(() => {
        // The 30s-interval effect will have already saved near-midnight time.
        // Just reset the counter so the new day starts at zero.
        const loginAt = Date.now()
        const newSession = { id: uid(), loginAt, date: todayStr() }
        loginTimeRef.current = loginAt
        sessionIdRef.current = newSession.id
        sessionTaskBaseRef.current = getTodayTaskTimerSeconds({ tasks: tasksRef.current, userId: user.id, today: todayStr(), nowMs: loginAt })
        setActiveSession(newSession)
        localStorage.setItem(sessionStorageKey(user.id), JSON.stringify(newSession))
        setTimeState({ task: 0, break: 0, idle: 0 })
        setOnBreak(false)
        clearStoredBreakState(user.id)
        scheduleMidnightReset() // arm next day
      }, msUntilMidnight)
    }
    const t = scheduleMidnightReset()
    return () => clearTimeout(t)
  }, [user?.id, dbLoaded])

  // ── onLogin ────────────────────────────────────────────────────────────────
  const onLogin = (member, newPw) => {
    if (newPw) {
      const updated = members.map(m =>
        m.id === member.id ? { ...m, pw: newPw, mustChangePw: false } : m
      )
      // Write immediately so the password change survives a refresh
      setDoc(FH_DOC, { members: updated }, { merge: true })
        .then(() => { remoteRef.current.members = updated })
        .catch(e => console.error('[FlowHub] onLogin save failed:', e?.code, e?.message))
      setMembers(updated)
      const loggedIn = updated.find(m => m.id === member.id)
      localStorage.setItem('dl_uid', loggedIn.id)
      setUser(loggedIn)
    } else {
      const loggedIn = members.find(m => m.id === member.id) || member
      localStorage.setItem('dl_uid', loggedIn.id)
      setUser(loggedIn)
    }
  }
  const onRegister = (newMember) => {
    setMembers(prev => {
      const updated = [...prev, newMember]
      // Write immediately — do NOT rely on the 800ms debounce for registration.
      // If the user refreshes before the debounce fires, the member is lost.
      setDoc(FH_DOC, { members: updated }, { merge: true })
        .then(() => { remoteRef.current.members = updated })
        .catch(e => console.error('[FlowHub] onRegister save failed:', e?.code, e?.message))
      return updated
    })
    localStorage.setItem('dl_uid', newMember.id)
    setUser(newMember)
  }
  const handleBreakToggle = () => {
    const ts = Date.now()
    setOnBreak(prev => {
      const goingOnBreak = !prev
      setStoredBreakState(user?.id, goingOnBreak)
      if (goingOnBreak) {
        // Pause all running tasks for this user without consuming a pause slot
        setTasks(p => p.map(x => {
          if (x.timerState === 'running' && x.assignee === user?.id) {
            const elapsed = Math.floor((ts - (x.lastStartedAt || ts)) / 1000)
            return { ...x, timerState: 'paused', accumulatedTime: (x.accumulatedTime || 0) + elapsed, pausedAt: ts, pausedByBreak: true, updatedAt: now() }
          }
          return x
        }))
      } else {
        // Resume tasks that were paused by break (restores them automatically)
        setTasks(p => p.map(x => {
          if (x.pausedByBreak && x.assignee === user?.id) {
            return { ...x, timerState: 'running', lastStartedAt: ts, pausedAt: null, pausedByBreak: false, updatedAt: now() }
          }
          return x
        }))
      }
      return goingOnBreak
    })
  }

  const onLogout = () => {
    if (user && onlineTime > 0) {
      const today = todayStr()
      const sessionId = sessionIdRef.current || uid()
      const logoutAt = Date.now()
      setTimeLogs(prev => {
        const idx = prev.findIndex(l => l.id === sessionId && l.userId === user.id && l.date === today && !l.manual)
        const entry = { id: sessionId, userId: user.id, date: today, seconds: onlineTime, taskSeconds: timeState.task, breakSeconds: timeState.break, idleSeconds: timeState.idle, loginAt: loginTimeRef.current, logoutAt }
        const closed = prev.map(l => (
          l.userId === user.id && l.date === today && !l.manual && !l.logoutAt
            ? { ...l, logoutAt }
            : l
        ))
        if (idx >= 0) { closed[idx] = { ...closed[idx], ...entry }; return closed }
        return [...closed, entry]
      })
    }
    // Stop any running task timers so they don't get stuck in 'running' state after logout
    const logoutTs = Date.now()
    setTasks(prev => prev.map(t => {
      if (t.pausedByBreak && t.assignee === user?.id) {
        return { ...t, timerState: 'paused', pausedAt: logoutTs, pausedByBreak: false, updatedAt: now() }
      }
      if (t.timerState === 'running' && t.assignee === user?.id) {
        const elapsed = Math.floor((logoutTs - (t.lastStartedAt || logoutTs)) / 1000)
        return { ...t, timerState: 'paused', accumulatedTime: (t.accumulatedTime || 0) + elapsed, pausedAt: logoutTs, pausedByBreak: false, updatedAt: now() }
      }
      return t
    }))
    localStorage.removeItem('dl_uid')
    clearStoredBreakState(user?.id)
    if (user?.id) localStorage.removeItem(sessionStorageKey(user.id))
    sessionIdRef.current = null
    loginTimeRef.current = null
    sessionTaskBaseRef.current = 0
    setActiveSession(null)
    // Remove user from active members
    if (user?.id) updatePresence(user.id, false)
    setUser(null); setTimeState({ task: 0, break: 0, idle: 0 }); setOnBreak(false); localStorage.removeItem('dl_page'); setPage('overview')
  }

  // ── Notification helper ────────────────────────────────────────────────────
  // Pushes a notification to one or more user IDs, skipping the actor themselves.
  // Auto-prunes notifications older than 30 days to keep the doc small.
  const notify = useCallback((recipientIds, type, title, body, relatedId = '', taskType = '', groupId = '') => {
    if (!user) return
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000
    const note = { id: uid(), type, title, body, relatedId, taskType, groupId, read: false, created: Date.now() }
    setNotifications(prev => {
      const pruned = prev.filter(n => n.created > cutoff)
      const toAdd = recipientIds
        .filter(id => id && id !== user.id)
        .map(id => ({ ...note, id: uid(), userId: id }))
      return [...pruned, ...toAdd]
    })
  }, [user])

  useEffect(() => {
    if (!user || !dbLoaded) return
    const today = todayStr()
    const peerIds = visibleMembersForUser(members, user)
      .filter(m => m.id !== user.id)
      .map(m => m.id)
    const activeGroupKey = getSessionGroupKey({
      userId: user.id,
      date: today,
      loginAt: loginTimeRef.current,
      id: sessionIdRef.current,
    })
    const loggedUsage = getLoggedDayUsage(timeLogsRef.current, user.id, today, sessionIdRef.current, activeGroupKey)
    const dayUsage = sumTimeStates([loggedUsage, timeState])
    const normalizedUsage = normalizeDayTimeState(dayUsage)

    const breakKey = `dl_productivity_alert_${user.id}_${today}_break`
    if (dayUsage.break > BREAK_LIMIT_SECS && !localStorage.getItem(breakKey)) {
      notify(peerIds, 'productivity_alert', '⚠️ Break limit exceeded',
        `${user.name} has exceeded the 1h break limit today.`)
      localStorage.setItem(breakKey, 'true')
    }

    const idleKey = `dl_productivity_alert_${user.id}_${today}_idle`
    if (normalizedUsage.idle > IDLE_LIMIT_SECS && !localStorage.getItem(idleKey)) {
      notify(peerIds, 'productivity_alert', '⚠️ Idle time alert',
        `${user.name} has spent more than 30 minutes idle today.`)
      const selfNote = {
        id: uid(),
        type: 'productivity_alert',
        title: 'Start a task',
        body: 'You have spent more than 30 minutes idle. Pick or start a task to stay on track.',
        relatedId: '',
        taskType: '',
        groupId: '',
        read: false,
        created: Date.now(),
        userId: user.id
      }
      setNotifications(prev => [...prev.filter(n => n.id !== selfNote.id), selfNote])
      localStorage.setItem(idleKey, 'true')
    }
  }, [user?.id, dbLoaded, timeState.break, timeState.idle, members, notify])

  // ── Task ops ───────────────────────────────────────────────────────────────
  const now = () => Date.now()

  const addTask = t => {
    const histEntry = { from: null, to: t.status || 'todo', by: user?.id, byName: user?.name, at: now() }
    const task = {
      ...t,
      createdBy: user?.id || t.assignee,
      createdAt: now(),
      updatedAt: now(),
      history: [histEntry],
      approvals: [],
      archived: false,
      archivedAt: null,
    }
    setTasks(p => [...p, task])
    if (task.assignee && task.assignee !== task.creator) {
      notify([task.assignee], 'task_assigned', '📋 New task assigned to you',
        task.title, task.id, task.type, task.groupId)
      // Send email notification (requires Firebase "Trigger Email" Extension)
      const assigneeMember = members.find(m => m.id === task.assignee)
      if (assigneeMember?.email) {
        sendTaskEmail(
          assigneeMember.email,
          `📋 New task assigned: ${task.title}`,
          buildAssignmentEmailHtml(task, assigneeMember.name, user?.name || 'A teammate', 'assigned')
        )
      }
    }
  }

  const editTask = t => {
    setTasks(p => {
      const old = p.find(x => x.id === t.id)
      if (old && (t.comments || []).length > (old.comments || []).length) {
        notify(
          [...new Set([old.creator, old.assignee, old.createdBy].filter(Boolean))],
          'task_comment', '💬 New comment on task', t.title, t.id, t.type, t.groupId
        )
      }
      // Email when assignee changes
      if (old && t.assignee && old.assignee !== t.assignee) {
        notify([t.assignee], 'task_assigned', '📋 Task reassigned to you', t.title, t.id, t.type, t.groupId)
        const assigneeMember = members.find(m => m.id === t.assignee)
        if (assigneeMember?.email) {
          sendTaskEmail(
            assigneeMember.email,
            `📋 Task reassigned to you: ${t.title}`,
            buildAssignmentEmailHtml(t, assigneeMember.name, user?.name || 'A teammate', 'reassigned')
          )
        }
      }
      return p.map(x => x.id === t.id ? { ...t, updatedAt: now() } : x)
    })
  }

  const deleteTask = id => {
    const t = tasks.find(x => x.id === id)
    if (t) setDeletedItems(p => [...p, { id: uid(), type: 'task', data: t, deletedAt: Date.now(), deletedBy: user?.id }])
    setTasks(p => p.filter(x => x.id !== id))
  }

  const statusChange = (id, status) => {
    const ts = Date.now()
    const today = new Date().toISOString().slice(0, 10)
    setTasks(p => p.map(t => {
      if (t.id !== id) return t
      const finalStatus = status === 'review' && !taskRequiresReview(t) ? 'done' : status
      if (t.status === finalStatus) return t
      // Review gate: only applies to top-level tasks (not sub-tasks)
      if (!t.parentId && taskRequiresReview(t) && t.status === 'review' && finalStatus === 'done') {
        if ((t.approvals || []).length < 2) return t // blocked — use approveTask instead
      }
      const histEntry = { from: t.status, to: finalStatus, by: user?.id, byName: user?.name, at: now() }
      notify(
        [...new Set([t.creator, t.assignee, t.createdBy].filter(Boolean))],
        'task_updated', `🔄 Task moved to ${STATUS_LABEL[finalStatus] || finalStatus}`, t.title, id, t.type, t.groupId
      )
      // Stop the timer when entering review/done so no more task time accrues.
      let timerPatch = {}
      if ((finalStatus === 'review' || finalStatus === 'done') && (t.timerState === 'running' || t.pausedByBreak)) {
        const elapsed = t.timerState === 'running'
          ? Math.floor((ts - (t.lastStartedAt || ts)) / 1000)
          : 0
        timerPatch = {
          timerState: 'paused',
          accumulatedTime: (t.accumulatedTime || 0) + elapsed,
          pausedAt: ts,
          pausedByBreak: false,
        }
      }
      // Auto-start timer when moving to inprogress (unless current user is not assignee)
      if (finalStatus === 'inprogress' && t.timerState !== 'running' && t.assignee === user?.id) {
        timerPatch = {
          ...timerPatch,
          timerState: 'running',
          lastStartedAt: ts,
          pausedAt: null,
          pausedByBreak: false,
          startedDate: t.startedDate || today,
        }
      }
      return { ...t, ...timerPatch, status: finalStatus, updatedAt: now(), history: [...(t.history || []), histEntry] }
    }))
  }

  const approveTask = (id) => {
    setTasks(p => p.map(t => {
      if (t.id !== id || t.status !== 'review') return t
      if (!taskRequiresReview(t) || !(t.reviewers || []).includes(user.id)) return t
      const alreadyApproved = (t.approvals || []).includes(user.id)
      if (alreadyApproved) return t
      const newApprovals = [...(t.approvals || []), user.id]
      const histEntry = {
        from: 'review', to: newApprovals.length >= 2 ? 'done' : 'review',
        by: user.id, byName: user.name, at: now(), note: `Approved by ${user.name}`
      }
      if (newApprovals.length >= 2) {
        notify([...new Set([t.creator, t.assignee, t.createdBy].filter(Boolean))],
          'task_updated', '✅ Task approved and marked Done!', t.title, id, t.type, t.groupId)
        return {
          ...t, status: 'done', approvals: newApprovals, updatedAt: now(),
          history: [...(t.history || []), histEntry]
        }
      }
      return {
        ...t, approvals: newApprovals, updatedAt: now(),
        history: [...(t.history || []), { ...histEntry, to: 'review', note: `Approved by ${user.name} (1/2)` }]
      }
    }))
  }

  const archiveTask = (id) => {
    setTasks(p => p.map(t => {
      if (t.id !== id) return t
      const histEntry = { from: t.status, to: 'archived', by: user?.id, byName: user?.name, at: now() }
      return {
        ...t, archived: true, archivedAt: now(), updatedAt: now(),
        history: [...(t.history || []), histEntry]
      }
    }))
  }

  const unarchiveTask = (id) => {
    setTasks(p => p.map(t => {
      if (t.id !== id) return t
      const histEntry = { from: 'archived', to: t.status, by: user?.id, byName: user?.name, at: now() }
      return {
        ...t, archived: false, archivedAt: null, updatedAt: now(),
        history: [...(t.history || []), histEntry]
      }
    }))
  }

  const toggleTaskTimer = (id) => {
    const today = new Date().toISOString().slice(0, 10)
    const ts = Date.now()
    setTasks(p => {
      const task = p.find(x => x.id === id)
      if (!task) return p

      if (task.timerState === 'running') {
        // Pausing — accumulate active time, record when pause started
        const elapsed = Math.floor((ts - (task.lastStartedAt || ts)) / 1000)
        return p.map(x => x.id === id ? {
          ...x,
          timerState: 'paused',
          accumulatedTime: (x.accumulatedTime || 0) + elapsed,
          pauseCount: (x.pauseCount || 0) + 1,
          pausedAt: ts,
          pausedByBreak: false,
          updatedAt: now()
        } : x)
      } else {
        // Starting or resuming

        return p.map(x => {
          if (x.id === id) {
            // Auto-move to inprogress when starting timer (unless task is in review/done)
            const newStatus = (x.status === 'review' || x.status === 'done') ? x.status : 'inprogress'
            return {
              ...x,
              timerState: 'running',
              lastStartedAt: ts,
              pausedAt: null,
              pausedByBreak: false,
              startedDate: x.startedDate || today,
              status: newStatus,
              updatedAt: now()
            }
          }
          // Auto-pause any other running task assigned to this user
          if (x.timerState === 'running' && x.assignee === user?.id) {
            const elapsed = Math.floor((ts - (x.lastStartedAt || ts)) / 1000)
            return {
              ...x,
              timerState: 'paused',
              accumulatedTime: (x.accumulatedTime || 0) + elapsed,
              pauseCount: (x.pauseCount || 0) + 1,
              pausedAt: ts,
              pausedByBreak: false,
              updatedAt: now()
            }
          }
          return x
        })
      }
    })
  }

  // Auto-archive: done tasks inactive for 5+ days
  useEffect(() => {
    if (!dbLoaded || !tasks.length) return
    const cutoff = now() - 5 * 24 * 3600 * 1000
    const needsArchive = tasks.filter(t =>
      t.status === 'done' && !t.archived && (t.updatedAt || t.created || 0) < cutoff
    )
    if (needsArchive.length === 0) return
    setTasks(p => p.map(t => {
      if (!needsArchive.find(x => x.id === t.id)) return t
      const histEntry = { from: 'done', to: 'archived', by: 'system', byName: 'System', at: now() }
      return {
        ...t, archived: true, archivedAt: now(), updatedAt: now(),
        history: [...(t.history || []), histEntry]
      }
    }))
  }, [dbLoaded]) // runs once on load — daily page refreshes handle the rest

  // ── Category ops ───────────────────────────────────────────────────────────
  const addCategory = name => {
    const trimmed = name.trim()
    if (!trimmed || categories.includes(trimmed)) return
    setCategories(p => [...p, trimmed])
  }

  // ── Chat ops ───────────────────────────────────────────────────────────────
  const sendMsg = m => setMessages(p => [...p, m])
  const deleteMsg = id => {
    const m = messages.find(x => x.id === id)
    if (m) setDeletedItems(p => [...p, { id: uid(), type: 'chat', data: m, deletedAt: Date.now(), deletedBy: user?.id }])
    setMessages(p => p.filter(x => x.id !== id))
  }

  // ── Meeting ops ────────────────────────────────────────────────────────────
  const addMeeting = m => {
    setMeetings(p => [...p, m])
    // Notify invited members (or everyone if no specific invitees)
    const recipients = m.invitees?.length
      ? m.invitees
      : members.map(x => x.id)
    notify(recipients, 'meeting', '📅 Meeting scheduled', `${m.title} — ${new Date(m.time).toLocaleString()}`, m.id)
  }
  const editMeeting = m => setMeetings(p => p.map(x => x.id === m.id ? m : x))
  const deleteMeeting = id => setMeetings(p => p.filter(m => m.id !== id))

  // ── Project ops ────────────────────────────────────────────────────────────
  const addProject = p => setProjects(prev => {
    const idx = prev.findIndex(x => x.id === p.id)
    if (idx >= 0) { const u = [...prev]; u[idx] = p; return u }
    return [...prev, p]
  })
  const deleteProject = id => setProjects(p => p.filter(x => x.id !== id))

  // ── Member ops ─────────────────────────────────────────────────────────────
  const addMember = m => setMembers(p => [...p, m])
  const deleteMember = id => setMembers(p => p.filter(m => m.id !== id))
  const updateMember = (id, patch) => {
    setMembers(p => p.map(m => m.id === id ? { ...m, ...patch } : m))
    if (user?.id === id) setUser(u => ({ ...u, ...patch }))
  }
  // Fix #8: Save members immediately to Firestore (no debounce) for avatar/profile changes
  const saveMemberImmediate = (id, patch) => {
    setMembers(prev => {
      const updated = prev.map(m => m.id === id ? { ...m, ...patch } : m)
      // Write immediately — bypass the 800ms debounce
      setDoc(FH_DOC, { members: updated }, { merge: true }).catch(e => {
        console.error('[FlowHub] member save failed:', e?.code, e?.message)
      })
      remoteRef.current.members = updated // update ref so effect doesn't echo
      return updated
    })
    if (user?.id === id) setUser(u => ({ ...u, ...patch }))
  }

  // ── File ops ───────────────────────────────────────────────────────────────
  const uploadFile = f => setFiles(p => [...p, f])
  const deleteFile = id => setFiles(p => p.filter(f => f.id !== id))
  const shareFile = id => setFiles(p => p.map(f => f.id === id ? { ...f, shared: !f.shared } : f))

  // ── Notes ──────────────────────────────────────────────────────────────────
  const saveNote = (tab, text) => setNotes(n => ({ ...n, [tab]: text }))
  const saveGroupCanvas = (id, data) => setGroupCanvases(p => ({ ...p, [id]: data }))
  const saveGroupNotes = (id, text) => setGroupNotes(p => ({ ...p, [id]: text }))
  const savePrivateCanvas = data => user && setPrivateCanvases(p => ({ ...p, [user.id]: data }))
  const savePrivateNotes = text => user && setPrivateNotes(p => ({ ...p, [user.id]: text }))
  const savePrivateMaterials = data => user && setPrivateMaterials(p => ({ ...p, [user.id]: data }))

  // ── Awards / Reset ────────────────────────────────────────────────────────
  const resetPoints = () => {
    setTasks(p => p.map(t => t.status === 'done' ? { ...t, status: 'todo' } : t))
    setFocusResetAt(Date.now())
  }
  const updateTimeLogs = (logs) => {
    setTimeLogs(logs)
    // Keep the running timer display scoped to the active session.
    if (!user) return
    const active = logs.find(l => l.id === sessionIdRef.current && l.userId === user.id && !l.manual)
    if (active) {
      const activeGroup = logs.filter(l => !l.manual && l.userId === user.id && l.date === active.date && getSessionGroupKey(l) === getSessionGroupKey(active))
      setTimeState(getLogDisplayTimeState(getCanonicalSessionLog(activeGroup) || active))
    }
  }
  const restoreDeletedItem = (binId) => {
    const item = deletedItems.find(d => d.id === binId)
    if (!item) return
    if (item.type === 'task') setTasks(p => [...p.filter(x => x.id !== item.data.id), item.data])
    if (item.type === 'chat') setMessages(p => [...p.filter(x => x.id !== item.data.id), item.data].sort((a, b) => a.time - b.time))
    setDeletedItems(p => p.filter(d => d.id !== binId))
  }
  const purgeDeletedItem = (binId) => setDeletedItems(p => p.filter(d => d.id !== binId))
  // Auto-purge items older than 24h — runs only when count changes to avoid loop
  useEffect(() => {
    if (deletedItems.some(d => (Date.now() - d.deletedAt) >= 86400000))
      setDeletedItems(p => p.filter(d => (Date.now() - d.deletedAt) < 86400000))
  }, [deletedItems.length])

  const addJobLink = j => {
    setJobLinks(p => [...p, j])
    const ids = Array.isArray(j.matchedTo) ? j.matchedTo : [j.matchedTo]
    ids.forEach(id => notify([id], 'joblink', '💼 A job was shared for you!',
      `${j.title}${j.company ? ' at ' + j.company : ''}`, j.id))
  }
  const editJobLink = j => setJobLinks(p => p.map(x => x.id === j.id ? j : x))
  const deleteJobLink = id => setJobLinks(p => p.filter(j => j.id !== id))

  const addReward = r => {
    setRewards(p => [...p, r])
    notify([r.toId], 'reward', `${r.badge || '⭐'} You received a reward!`, `"${r.title}" from ${members.find(m => m.id === r.fromId)?.name || 'a teammate'}`, r.id)
  }
  const deleteReward = id => setRewards(p => p.filter(r => r.id !== id))

  // ── Notification ops ──────────────────────────────────────────────────────
  const markNotifRead = id => setNotifications(p => p.map(n => n.id === id ? { ...n, read: true } : n))
  const markAllNotifRead = () => setNotifications(p => p.map(n => n.userId === user?.id ? { ...n, read: true } : n))
  const deleteNotif = id => setNotifications(p => p.filter(n => n.id !== id))

  // ── Calendar ops ──────────────────────────────────────────────────────────
  const addCalEvent = e => {
    setCalendarEvents(p => [...p, e])
    notify(members.map(m => m.id), 'calendar', `📅 Calendar: ${e.title}`, new Date(e.date + 'T12:00').toLocaleDateString(), e.id)
  }
  const deleteCalEvent = id => setCalendarEvents(p => p.filter(e => e.id !== id))

  // ── Shared task props ──────────────────────────────────────────────────────
  const boardProps = {
    tasks, members, user,
    onAdd: addTask, onEdit: editTask, onDelete: deleteTask, onStatusChange: statusChange,
    onOpenCollab: setCollabTask,
    onApprove: approveTask,
    onArchive: archiveTask,
    categories,
    onAddCategory: addCategory,
    onToggleTimer: toggleTaskTimer,
  }

  // ── URL-based password reset (Firebase email link redirect) ─────────────────
  const urlParams = new URLSearchParams(window.location.search)
  const urlMode = urlParams.get('mode')
  const urlOobCode = urlParams.get('oobCode')

  // ── In-app video meeting state ────────────────────────────────────────────
  const [activeVideoMeeting, setActiveVideoMeeting] = useState(null)

  // ── Render ─────────────────────────────────────────────────────────────────
  // Handle Firebase password reset link (mode=resetPassword in URL)
  if (urlMode === 'resetPassword' && urlOobCode) return (
    <TC.Provider value={{ T, dark, setDark: toggleDark, bp }}>
      <PasswordResetConfirm
        onDone={() => { window.history.replaceState({}, '', window.location.pathname) }}
        members={members}
        onUpdate={updateMember}
      />
    </TC.Provider>
  )

  if (appLoading) return (
    <TC.Provider value={{ T, dark, setDark: toggleDark, bp }}>
      <div style={{
        minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: 16
      }}>
        <BrandLogo size={58} radius={18} />
        <span className="fh-fraunces" style={{ color: T.t1, fontSize: 22 }}>Daylighting</span>
        <div style={{
          width: 36, height: 36, border: `3px solid ${T.brd}`,
          borderTop: `3px solid ${T.acc}`, borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </TC.Provider>
  )

  if (!user) return (
    <TC.Provider value={{ T, dark, setDark: toggleDark, bp }}>
      <Login members={members} onLogin={onLogin} onRegister={onRegister} dark={dark} setDark={toggleDark}
        dbLoaded={dbLoaded} noMembers={canShowFirstRun({ dbLoaded, members, dbLoadError })}
        dbLoadError={dbLoadError} />
    </TC.Provider>
  )

  const todayUserLogs = timeLogs.filter(l => l.userId === user.id && l.date === todayStr())
  const activeLogForTotals = activeSession?.id
    ? {
      id: activeSession.id,
      userId: user.id,
      date: todayStr(),
      seconds: onlineTime,
      taskSeconds: timeState.task,
      breakSeconds: timeState.break,
      idleSeconds: timeState.idle,
      loginAt: activeSession.loginAt,
      logoutAt: null,
    }
    : null
  const todayLogsWithActive = activeLogForTotals
    ? [
      ...todayUserLogs.map(l => l.id === activeSession.id ? { ...l, ...activeLogForTotals } : l),
      ...(todayUserLogs.some(l => l.id === activeSession.id) ? [] : [activeLogForTotals]),
    ]
    : todayUserLogs
  const canonicalTodayLogs = canonicalizeSessionLogs(todayLogsWithActive)
  const currentDayUsageForTimer = sumTimeStates([
    sumTimeStates(canonicalTodayLogs.map(getLogDisplayTimeState)),
  ])
  const dayOnlineTime = getLogsTotalSeconds(canonicalTodayLogs)

  return (
    <TC.Provider value={{ T, dark, setDark: toggleDark, bp }}>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: T.bg }}>
        <Sidebar page={page} setPage={setPage} user={user} members={members}
          onHamburger={() => setDrawerOpen(true)} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <TopBar
            page={page} user={user} onlineTime={dayOnlineTime}
            timerMode={getActiveTimerMode({
              tasks,
              userId: user?.id,
              onBreak,
              breakSeconds: currentDayUsageForTimer.break,
              breakLimitSeconds: BREAK_LIMIT_SECS,
            })}
            onBreak={onBreak} setOnBreak={handleBreakToggle}
            dark={dark} setDark={toggleDark}
            onQuickAdd={addTask} onLogout={onLogout}
            notifications={notifications}
            onNotifRead={markNotifRead}
            onNotifReadAll={markAllNotifRead}
            onNotifDelete={deleteNotif}
            onNavigate={setPage}
            onHamburger={() => setDrawerOpen(true)}
          />
          {/* Page content — padding-bottom on mobile so bottom nav doesn't cover it */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            {page === 'overview' && <Overview tasks={tasks} members={members} user={user} onlineTime={dayOnlineTime} activeMembers={activeMembers} />}
            {page === 'private' && <PrivateBoard {...boardProps} privateCanvas={privateCanvases?.[user?.id]} onSaveCanvas={savePrivateCanvas} privateNotes={privateNotes?.[user?.id] || ''} onSaveNotes={savePrivateNotes} privateMaterials={privateMaterials?.[user?.id] || '[]'} onSaveMaterials={savePrivateMaterials} onOpenCollab={setCollabTask} taskNotes={taskNotes} onApprove={approveTask} onArchive={archiveTask} categories={categories} onAddCategory={addCategory} />}
            {page === 'group' && <GroupBoard   {...boardProps} projects={projects} onAddProject={addProject} groupCanvases={groupCanvases} groupNotes={groupNotes} onSaveCanvas={saveGroupCanvas} onSaveNotes={saveGroupNotes} onOpenCollab={setCollabTask} taskNotes={taskNotes} onApprove={approveTask} onArchive={archiveTask} categories={categories} onAddCategory={addCategory} />}
            {page === 'public' && <PublicBoard  {...boardProps} taskNotes={taskNotes} onApprove={approveTask} onArchive={archiveTask} categories={categories} onAddCategory={addCategory} />}
            {page === 'all' && <AllTasks     {...boardProps} taskNotes={taskNotes} onApprove={approveTask} onArchive={archiveTask} categories={categories} onAddCategory={addCategory} />}
            {page === 'archive' && <Archive tasks={tasks} members={members} user={user} onUnarchive={unarchiveTask} onDelete={deleteTask} />}
            {page === 'deleteddash' && <DeletedDash deletedItems={deletedItems} members={members} user={user} onRestore={restoreDeletedItem} onPurge={purgeDeletedItem} />}
            {page === 'chat' && <Chat messages={messages} members={members} user={user} onSend={sendMsg} onDelete={deleteMsg} />}
            {page === 'meetings' && <Meetings meetings={meetings} user={user} members={members} onAdd={addMeeting} onEdit={editMeeting} onDelete={deleteMeeting} onJoinVideo={setActiveVideoMeeting} />}
            {page === 'awards' && <Awards tasks={tasks} members={members} user={user} onResetPoints={resetPoints} rewards={rewards} timeLogs={timeLogs} focusResetAt={focusResetAt} />}
            {page === 'rewards' && <PeerRewards rewards={rewards} members={members} user={user} onAdd={addReward} onDelete={deleteReward} tasks={tasks} timeLogs={timeLogs} focusResetAt={focusResetAt} />}
            {page === 'timelog' && <TimeLog timeLogs={timeLogs} members={members} user={user} onUpdate={updateTimeLogs} tasks={tasks} currentTimeState={timeState} currentSessionId={activeSession?.id} currentSessionStart={activeSession?.loginAt} />}
            {page === 'jobboard' && <JobBoard jobLinks={jobLinks} members={members} user={user} onAdd={addJobLink} onEdit={editJobLink} onDelete={deleteJobLink} />}
            {page === 'whiteboard' && <Whiteboard notes={notes} onNoteSave={saveNote} />}
            {page === 'calendar' && <Calendar calendarEvents={calendarEvents} onAdd={addCalEvent} onDelete={deleteCalEvent} user={user} />}
            {page === 'profile' && <Profile user={user} onUpdate={updateMember} onSaveImmediate={saveMemberImmediate} />}
            {page === 'files' && <FileStorage files={files} user={user} onUpload={uploadFile} onDelete={deleteFile} onShare={shareFile} />}
            {page === 'admin' && user.role === 'admin' && (
              <AdminPanel
                members={members} tasks={tasks} messages={messages} projects={projects} meetings={meetings}
                onDeleteTask={deleteTask} onDeleteMsg={deleteMsg} onDeleteProject={deleteProject}
                onUpdateMember={updateMember} onAddProject={addProject} onAddMember={addMember} onDeleteMember={deleteMember} currentUserId={user?.id} onDeleteMeeting={deleteMeeting}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile bottom navigation bar */}
      {isMobile && (
        <MobileBottomNav
          page={page} setPage={setPage} user={user}
          onHamburger={() => setDrawerOpen(true)}
        />
      )}

      {/* Mobile slide-in drawer */}
      {isMobile && drawerOpen && (
        <MobileDrawer
          page={page} setPage={setPage} user={user}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {/* Collaborative notes panel */}
      {collabTask && (
        <TaskCollabPanel
          task={collabTask}
          members={members}
          user={user}
          taskNotes={taskNotes}
          onSave={saveTaskNote}
          onClose={() => setCollabTask(null)}
        />
      )}
      {/* In-app video meeting overlay */}
      {activeVideoMeeting && (
        <VideoMeetingRoom
          meeting={activeVideoMeeting}
          user={user}
          onLeave={() => setActiveVideoMeeting(null)}
        />
      )}
      {toast && (
        <Toast
          notification={toast}
          onDismiss={() => setToast(null)}
          onNavigate={n => {
            markNotifRead(n.id)
            if (['task_assigned', 'task_updated', 'task_comment'].includes(n.type)) {
              if (n.taskType === 'group') setPage('group')
              else if (n.taskType === 'public') setPage('public')
              else setPage('private')
            } else if (n.type === 'meeting') setPage('meetings')
            else if (n.type === 'reward') setPage('rewards')
            else if (n.type === 'joblink') setPage('jobboard')
            else if (n.type === 'productivity_alert') setPage('timelog')
            else if (n.type === 'calendar') setPage('calendar')
            setToast(null)
          }}
        />
      )}
    </TC.Provider>
  )
}

// ── Entry Point ───────────────────────────────────────────────────────────────
export default function FlowHub() {
  return <ErrorBoundary><App /></ErrorBoundary>
}
