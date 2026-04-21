// ─────────────────────────────────────────────────────────────────────────────
//  FlowHub v3 — Complete React Productivity Dashboard
//  Single-file, export default FlowHub
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useContext, createContext, useCallback } from "react"
import { initializeApp, getApps } from "firebase/app"
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth"

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
const firebaseApp  = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG)
const firebaseAuth = getAuth(firebaseApp)
const googleProvider = new GoogleAuthProvider()

// ── Theme ─────────────────────────────────────────────────────────────────────
const DARK = {
  bg:'#0d1117', bg2:'#161b22', bg3:'#1c2128', bg4:'#21262d',
  t1:'#e6edf3', t2:'#8b949e', t3:'#656d76',
  acc:'#58a6ff', acc2:'#1f6feb', red:'#f85149', grn:'#3fb950',
  yl:'#d29922', brd:'#30363d', shadow:'rgba(0,0,0,0.5)'
}
const LIGHT = {
  bg:'#f6f8fa', bg2:'#ffffff', bg3:'#f0f3f6', bg4:'#e8ecf0',
  t1:'#1f2328', t2:'#57606a', t3:'#8c959f',
  acc:'#0969da', acc2:'#54aeff', red:'#cf222e', grn:'#1a7f37',
  yl:'#9a6700', brd:'#d0d7de', shadow:'rgba(0,0,0,0.12)'
}

const TC = createContext(null)
const useT = () => useContext(TC)

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10)
const fmtS = s => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  return h
    ? `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
    : `${m}:${String(ss).padStart(2,'0')}`
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
`

// ── Seed Data ─────────────────────────────────────────────────────────────────
const SEED_MEMBERS = [
  { id:'u1', name:'Alex Morgan',  role:'admin',  avatar:'AM', email:'alex@flowhub.io',  pw:'admin123', points:0, mustChangePw:false },
  { id:'u2', name:'Blair Chen',   role:'member', avatar:'BC', email:'blair@flowhub.io', pw:'pass123',  points:0, mustChangePw:false },
  { id:'u3', name:'Casey Park',   role:'member', avatar:'CP', email:'casey@flowhub.io', pw:'pass123',  points:0, mustChangePw:false },
  { id:'u4', name:'Dana Wells',   role:'member', avatar:'DW', email:'dana@flowhub.io',  pw:'pass123',  points:0, mustChangePw:false },
]
const SEED_TASKS = [
  { id:'t1', title:'Design system audit', desc:'Review all UI components for consistency', status:'todo',       type:'group',   assignee:'u2', creator:'u1', priority:'high', created:Date.now()-86400000*3, tags:['design'] },
  { id:'t2', title:'API integration',     desc:'Connect backend REST endpoints to client', status:'inprogress', type:'group',   assignee:'u3', creator:'u1', priority:'high', created:Date.now()-86400000*2, tags:['dev'] },
  { id:'t3', title:'Write release notes', desc:'Document all v3 feature changes',          status:'done',       type:'public',  assignee:'u4', creator:'u1', priority:'med',  created:Date.now()-86400000,   tags:['docs'] },
  { id:'t4', title:'Personal goal Q2',    desc:'Set personal OKRs for Q2 2026',            status:'todo',       type:'private', assignee:'u1', creator:'u1', priority:'low',  created:Date.now(),            tags:[] },
  { id:'t5', title:'Performance review',  desc:'Prepare mid-year performance notes',        status:'done',       type:'group',   assignee:'u2', creator:'u1', priority:'med',  created:Date.now()-86400000*4, tags:['hr'] },
]
const SEED_MESSAGES = [
  { id:'m1', userId:'u1', text:'Hey team! FlowHub v3 is live 🚀', time:Date.now()-7200000, files:[] },
  { id:'m2', userId:'u2', text:'Looks incredible! Love the new kanban boards.', time:Date.now()-3600000, files:[] },
  { id:'m3', userId:'u3', text:"The dark mode is chef's kiss 🤌 Nice work everyone", time:Date.now()-1800000, files:[] },
]
const SEED_MEETINGS = [
  { id:'meet1', title:'Sprint Planning',  time:'2026-04-22T10:00', duration:60, link:'https://meet.google.com/abc-def-ghi', creator:'u1' },
  { id:'meet2', title:'Design Review',    time:'2026-04-23T14:00', duration:30, link:'https://meet.google.com/xyz-uvw-rst', creator:'u1' },
]
const SEED_PROJECTS = [
  { id:'p1', name:'FlowHub Redesign', color:'#58a6ff', members:['u1','u2','u3'], desc:'Complete UI overhaul for v3 release' },
  { id:'p2', name:'API v2',           color:'#3fb950', members:['u1','u3','u4'], desc:'Backend modernization initiative' },
]

// ── Icons ─────────────────────────────────────────────────────────────────────
const ICONS = {
  home:     'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
  task:     'M9 11l3 3L22 4 M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  chat:     'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  meet:     'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  award:    'M12 15c4.97 0 9-2.24 9-5s-4.03-5-9-5-9 2.24-9 5 4.03 5 9 5z M12 15v7 M8 19l4-4 4 4',
  globe:    'M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z M2 12h20 M12 2a15.3 15.3 0 010 20 M12 2a15.3 15.3 0 000 20',
  lock:     'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z M7 11V7a5 5 0 0110 0v4',
  admin:    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  sun:      'M12 17A5 5 0 1012 7a5 5 0 000 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42',
  moon:     'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  plus:     'M12 5v14 M5 12h14',
  x:        'M18 6L6 18 M6 6l12 12',
  trash:    'M3 6h18 M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6 M10 6V4a1 1 0 011-1h2a1 1 0 011 1v2',
  edit:     'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  paper:    'M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  upload:   'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  share:    'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8 M16 6l-4-4-4 4 M12 2v13',
  files:    'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
  pen:      'M12 20h9 M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z',
  coffee:   'M18 8h1a4 4 0 010 8h-1 M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z M6 1v3 M10 1v3 M14 1v3',
  check:    'M20 6L9 17l-5-5',
  key:      'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  zap:      'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  timer:    'M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z M12 6v6l4 2',
  logout:   'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9',
}

function I({ n, size=18, color, strokeWidth=1.8, style={} }) {
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

// ── Avatar ────────────────────────────────────────────────────────────────────
const AV_COLORS = ['#58a6ff','#3fb950','#d29922','#f85149','#a371f7','#39d353','#ff7b72','#ffa657']
function Av({ member, size=32 }) {
  const idx = member ? (member.id.charCodeAt(1) || 0) % AV_COLORS.length : 0
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', background:AV_COLORS[idx],
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:size*0.35, fontWeight:700, color:'#fff', flexShrink:0, userSelect:'none'
    }}>
      {member?.avatar || '?'}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, width=480 }) {
  const { T } = useT()
  if (!open) return null
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.65)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background:T.bg2, border:`1px solid ${T.brd}`, borderRadius:16,
        width:'100%', maxWidth:width, maxHeight:'90vh', overflowY:'auto',
        boxShadow:`0 24px 80px ${T.shadow}`
      }}>
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'20px 24px', borderBottom:`1px solid ${T.brd}`
        }}>
          <h3 className="fh-fraunces" style={{color:T.t1, fontSize:18}}>{title}</h3>
          <button onClick={onClose} style={{background:'none', border:'none', color:T.t2, cursor:'pointer', lineHeight:1}}>
            <I n="x" size={20} />
          </button>
        </div>
        <div style={{padding:24}}>{children}</div>
      </div>
    </div>
  )
}

// ── Confirm ───────────────────────────────────────────────────────────────────
function Confirm({ open, onClose, onOk, msg, okLabel='Delete', okColor='#f85149' }) {
  const { T } = useT()
  if (!open) return null
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.75)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000
    }}>
      <div style={{
        background:T.bg2, border:`1px solid ${T.brd}`, borderRadius:16,
        padding:36, maxWidth:360, width:'100%', margin:16, textAlign:'center'
      }}>
        <div style={{fontSize:44, marginBottom:16}}>⚠️</div>
        <p style={{color:T.t1, marginBottom:28, lineHeight:1.65, fontSize:14}}>{msg}</p>
        <div style={{display:'flex', gap:12, justifyContent:'center'}}>
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
      background:T.bg2, border:`1px solid ${T.brd}`, borderRadius:14,
      padding:'18px 20px', display:'flex', alignItems:'center', gap:16
    }}>
      <div style={{
        width:46, height:46, borderRadius:12, background:`${color}1a`,
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
      }}>
        <I n={icon} size={22} color={color} />
      </div>
      <div>
        <div style={{color:T.t2, fontSize:11, textTransform:'uppercase', letterSpacing:1, fontWeight:600}}>{label}</div>
        <div style={{color:T.t1, fontSize:24, fontWeight:700, marginTop:2}}>{value}</div>
      </div>
    </div>
  )
}

// ── Login ─────────────────────────────────────────────────────────────────────
function Login({ members, onLogin, dark, setDark }) {
  const { T } = useT()
  const [email, setEmail]         = useState('')
  const [pw, setPw]               = useState('')
  const [err, setErr]             = useState('')
  const [newPwFlow, setNewPwFlow] = useState(null)
  const [np1, setNp1]             = useState('')
  const [np2, setNp2]             = useState('')
  const [ssoLoading, setSsoLoading] = useState(false)

  const doLogin = () => {
    const m = members.find(x => x.email === email.trim())
    if (!m) return setErr('No account found for that email.')
    if (m.mustChangePw) { setNewPwFlow(m); setErr(''); return }
    if (m.pw !== pw) return setErr('Incorrect password.')
    onLogin(m)
  }

  const doSetNewPw = () => {
    if (np1.length < 6) return setErr('Password must be at least 6 characters.')
    if (np1 !== np2) return setErr('Passwords do not match.')
    onLogin(newPwFlow, np1)
  }

  const googleSSO = async () => {
    setErr('')
    setSsoLoading(true)
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider)
      const googleEmail = result.user.email
      const m = members.find(x => x.email.toLowerCase() === googleEmail.toLowerCase())
      if (m) {
        onLogin(m)
      } else {
        setErr(`No FlowHub account found for ${googleEmail}. Ask your admin to add you.`)
      }
    } catch (e) {
      if (e.code === 'auth/popup-closed-by-user') {
        setErr('Sign-in cancelled.')
      } else if (e.code === 'auth/unauthorized-domain') {
        setErr('This domain is not authorized. Add it in Firebase Console → Authentication → Settings → Authorized domains.')
      } else {
        setErr('Google sign-in failed: ' + e.message)
      }
    } finally {
      setSsoLoading(false)
    }
  }

  if (newPwFlow) return (
    <div style={{minHeight:'100vh', background:T.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:16}}>
      <div style={{background:T.bg2, border:`1px solid ${T.brd}`, borderRadius:20, padding:40, width:'100%', maxWidth:400, boxShadow:`0 32px 80px ${T.shadow}`}}>
        <div style={{marginBottom:28, textAlign:'center'}}>
          <div style={{fontSize:36, marginBottom:8}}>🔑</div>
          <h2 className="fh-fraunces" style={{color:T.t1, fontSize:22}}>Set New Password</h2>
          <p style={{color:T.t2, fontSize:13, marginTop:6}}>An admin requires you to create a new password before continuing.</p>
        </div>
        {err && <div style={{background:`${T.red}1a`, border:`1px solid ${T.red}44`, borderRadius:8, padding:'10px 14px', color:T.red, fontSize:13, marginBottom:16}}>{err}</div>}
        <input placeholder="New password" type="password" value={np1} onChange={e=>{setNp1(e.target.value);setErr('')}} style={{...IS(T), marginBottom:10}} />
        <input placeholder="Confirm new password" type="password" value={np2} onChange={e=>{setNp2(e.target.value);setErr('')}} style={{...IS(T), marginBottom:20}} />
        <button onClick={doSetNewPw} style={{...BT(T.acc), width:'100%', padding:'11px'}}>Set Password &amp; Continue</button>
      </div>
    </div>
  )

  return (
    <div style={{minHeight:'100vh', background:T.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:16}}>
      <div style={{background:T.bg2, border:`1px solid ${T.brd}`, borderRadius:20, padding:40, width:'100%', maxWidth:400, boxShadow:`0 32px 80px ${T.shadow}`}}>
        <div style={{marginBottom:32, textAlign:'center'}}>
          <div style={{fontSize:44, marginBottom:10}}>⚡</div>
          <h1 className="fh-fraunces" style={{color:T.t1, fontSize:30, letterSpacing:-0.5}}>FlowHub</h1>
          <p style={{color:T.t2, fontSize:13, marginTop:4}}>v3 · Team Productivity Dashboard</p>
        </div>
        {err && (
          <div style={{background:`${T.red}1a`, border:`1px solid ${T.red}44`, borderRadius:8, padding:'10px 14px', color:T.red, fontSize:13, marginBottom:16}}>{err}</div>
        )}
        <input
          placeholder="Email address" type="email" value={email}
          onChange={e=>{setEmail(e.target.value);setErr('')}}
          style={{...IS(T), marginBottom:10}}
        />
        <input
          placeholder="Password" type="password" value={pw}
          onChange={e=>{setPw(e.target.value);setErr('')}}
          onKeyDown={e=>e.key==='Enter'&&doLogin()}
          style={{...IS(T), marginBottom:20}}
        />
        <button onClick={doLogin} style={{...BT(T.acc), width:'100%', padding:'11px', marginBottom:10, fontSize:14}}>
          Sign In
        </button>
        <button onClick={googleSSO} disabled={ssoLoading} style={{...GH(T), width:'100%', padding:'11px', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontSize:14, opacity: ssoLoading ? 0.6 : 1, cursor: ssoLoading ? 'wait' : 'pointer'}}>
          <span>🔑</span> {ssoLoading ? 'Signing in...' : 'Continue with Google (SSO)'}
        </button>
        <div style={{marginTop:20, textAlign:'center'}}>
          <button onClick={()=>setDark(!dark)} style={{background:'none', border:'none', color:T.t2, cursor:'pointer', fontSize:13, display:'inline-flex', alignItems:'center', gap:6}}>
            <I n={dark?'sun':'moon'} size={14} /> {dark?'Light mode':'Dark mode'}
          </button>
        </div>
        <div style={{marginTop:20, borderTop:`1px solid ${T.brd}`, paddingTop:16, textAlign:'center'}}>
          <span style={{color:T.t3, fontSize:11}}>Demo: alex@flowhub.io / admin123</span>
        </div>
      </div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
const NAV = [
  { id:'overview',    icon:'home',   label:'Overview'     },
  { id:'private',     icon:'lock',   label:'My Tasks'     },
  { id:'group',       icon:'meet',   label:'Group Board'  },
  { id:'public',      icon:'globe',  label:'Public Board' },
  { id:'all',         icon:'task',   label:'All Tasks'    },
  { id:'chat',        icon:'chat',   label:'Team Chat'    },
  { id:'meetings',    icon:'timer',  label:'Meetings'     },
  { id:'awards',      icon:'award',  label:'Awards'       },
  { id:'whiteboard',  icon:'pen',    label:'Whiteboard'   },
  { id:'files',       icon:'files',  label:'File Storage' },
  { id:'admin',       icon:'admin',  label:'Admin Panel'  },
]

function Sidebar({ page, setPage, user }) {
  const { T } = useT()
  const isAdmin = user?.role === 'admin'
  return (
    <div style={{
      width:218, background:T.bg2, borderRight:`1px solid ${T.brd}`,
      display:'flex', flexDirection:'column', flexShrink:0, height:'100vh', overflowY:'auto'
    }}>
      <div style={{padding:'22px 18px 14px', borderBottom:`1px solid ${T.brd}`}}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <span style={{fontSize:22}}>⚡</span>
          <span className="fh-fraunces" style={{color:T.t1, fontSize:20, fontWeight:700}}>FlowHub</span>
        </div>
        <div style={{color:T.t3, fontSize:11, marginTop:2, marginLeft:32}}>v3 · Team Dashboard</div>
      </div>
      <nav style={{flex:1, padding:'10px 8px'}}>
        {NAV.filter(n => n.id !== 'admin' || isAdmin).map(n => (
          <button key={n.id} onClick={()=>setPage(n.id)} style={{
            display:'flex', alignItems:'center', gap:10, width:'100%',
            padding:'9px 12px', borderRadius:10, border:'none', cursor:'pointer',
            marginBottom:2, textAlign:'left',
            background: page===n.id ? `${T.acc}1a` : 'transparent',
            color: page===n.id ? T.acc : T.t2,
            fontWeight: page===n.id ? 600 : 400, fontSize:13,
            transition:'background 0.15s, color 0.15s'
          }}>
            <I n={n.icon} size={16} color={page===n.id ? T.acc : T.t2} />
            {n.label}
          </button>
        ))}
      </nav>
      <div style={{padding:'14px 14px 22px', borderTop:`1px solid ${T.brd}`}}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <Av member={user} size={34} />
          <div style={{overflow:'hidden', flex:1}}>
            <div style={{color:T.t1, fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{user?.name}</div>
            <div style={{color:T.t3, fontSize:11, textTransform:'capitalize'}}>{user?.role}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TopBar ────────────────────────────────────────────────────────────────────
function TopBar({ page, user, onlineTime, onBreak, setOnBreak, dark, setDark, onQuickAdd, onLogout }) {
  const { T } = useT()
  const [showQA, setShowQA] = useState(false)
  const label = NAV.find(n => n.id === page)?.label || 'FlowHub'
  return (
    <>
      <div style={{
        height:58, background:T.bg2, borderBottom:`1px solid ${T.brd}`,
        display:'flex', alignItems:'center', padding:'0 22px', gap:12, flexShrink:0
      }}>
        <h2 className="fh-fraunces" style={{color:T.t1, fontSize:19, flex:1}}>{label}</h2>
        {/* Online timer */}
        <div style={{display:'flex', alignItems:'center', gap:6, background:T.bg3, borderRadius:8, padding:'5px 11px'}}>
          <I n="timer" size={13} color={T.grn} />
          <span style={{color:T.grn, fontSize:12, fontWeight:700, fontVariantNumeric:'tabular-nums'}}>{fmtS(onlineTime)}</span>
        </div>
        {/* Break */}
        <button onClick={()=>setOnBreak(b=>!b)} style={{
          ...GH(T, onBreak ? T.yl : T.t2),
          display:'flex', alignItems:'center', gap:5, fontSize:12,
          background: onBreak ? `${T.yl}1a` : 'transparent',
          borderColor: onBreak ? T.yl : T.brd
        }}>
          <I n="coffee" size={13} color={onBreak ? T.yl : T.t2} />
          {onBreak ? 'On Break' : 'Break'}
        </button>
        {/* Quick Add */}
        <button onClick={()=>setShowQA(true)} style={{...BT(T.acc), display:'flex', alignItems:'center', gap:5}}>
          <I n="plus" size={13} /> Quick Add
        </button>
        {/* Dark/Light */}
        <button onClick={()=>setDark(d=>!d)} style={{background:'none', border:'none', color:T.t2, cursor:'pointer', lineHeight:1}}>
          <I n={dark?'sun':'moon'} size={17} />
        </button>
        {/* Logout */}
        <button onClick={onLogout} style={{...GH(T), display:'flex', alignItems:'center', gap:5, fontSize:12}}>
          <I n="logout" size={13} /> Out
        </button>
      </div>
      {showQA && <QuickAddTask onClose={()=>setShowQA(false)} user={user} onAdd={onQuickAdd} />}
    </>
  )
}

// ── QuickAddTask ──────────────────────────────────────────────────────────────
function QuickAddTask({ onClose, user, onAdd }) {
  const { T } = useT()
  const [title, setTitle]       = useState('')
  const [type, setType]         = useState('private')
  const [priority, setPriority] = useState('med')

  const submit = () => {
    if (!title.trim()) return
    onAdd({ id:uid(), title:title.trim(), desc:'', status:'todo', type, priority,
      assignee:user.id, creator:user.id, created:Date.now(), tags:[] })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Quick Add Task" width={420}>
      <div style={{display:'flex', flexDirection:'column', gap:14}}>
        <input
          placeholder="What needs doing…" value={title}
          onChange={e=>setTitle(e.target.value)} style={IS(T)} autoFocus
          onKeyDown={e=>e.key==='Enter'&&submit()}
        />
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
          <select value={type} onChange={e=>setType(e.target.value)} style={IS(T)}>
            <option value="private">🔒 Private</option>
            <option value="group">👥 Group</option>
            <option value="public">🌐 Public</option>
          </select>
          <select value={priority} onChange={e=>setPriority(e.target.value)} style={IS(T)}>
            <option value="high">🔴 High</option>
            <option value="med">🟡 Medium</option>
            <option value="low">🟢 Low</option>
          </select>
        </div>
        <button onClick={submit} style={{...BT(T.acc), width:'100%', padding:'10px'}}>
          Add Task
        </button>
      </div>
    </Modal>
  )
}

// ── TaskCard ──────────────────────────────────────────────────────────────────
const P_COLOR = { high:'#f85149', med:'#d29922', low:'#3fb950' }
const P_BG    = { high:'#f8514918', med:'#d2992218', low:'#3fb95018' }

function TaskCard({ task, members, onEdit, onDelete, onStatusChange, user }) {
  const { T } = useT()
  const assignee = members.find(m => m.id === task.assignee)
  const CYCLE    = ['todo','inprogress','done']
  const nextSt   = CYCLE[(CYCLE.indexOf(task.status)+1) % CYCLE.length]
  const canEdit  = user?.role === 'admin' || task.creator === user?.id
  const STATUS_LABEL = { todo:'To Do', inprogress:'In Progress', done:'Done' }

  return (
    <div style={{
      background:T.bg2, border:`1px solid ${T.brd}`, borderRadius:12,
      padding:14, marginBottom:9, transition:'box-shadow 0.2s'
    }}>
      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:8}}>
        <span style={{color:T.t1, fontWeight:600, fontSize:13, lineHeight:1.45}}>{task.title}</span>
        {canEdit && (
          <div style={{display:'flex', gap:3, flexShrink:0}}>
            <button onClick={()=>onEdit&&onEdit(task)} style={{background:'none', border:'none', color:T.t3, cursor:'pointer', padding:'2px 3px'}}><I n="edit" size={13}/></button>
            <button onClick={()=>onDelete&&onDelete(task.id)} style={{background:'none', border:'none', color:T.t3, cursor:'pointer', padding:'2px 3px'}}><I n="trash" size={13}/></button>
          </div>
        )}
      </div>
      {task.desc && <p style={{color:T.t2, fontSize:12, marginBottom:10, lineHeight:1.5}}>{task.desc}</p>}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:5}}>
        <div style={{display:'flex', gap:5, alignItems:'center', flexWrap:'wrap'}}>
          <span style={{
            background:P_BG[task.priority], color:P_COLOR[task.priority],
            fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5, textTransform:'uppercase'
          }}>{task.priority}</span>
          <button onClick={()=>onStatusChange(task.id, nextSt)} style={{
            background:T.bg3, border:`1px solid ${T.brd}`, borderRadius:6,
            padding:'2px 8px', color:T.t2, fontSize:11, cursor:'pointer'
          }}>{STATUS_LABEL[task.status]}</button>
        </div>
        {assignee && <Av member={assignee} size={22} />}
      </div>
    </div>
  )
}

// ── Kanban ────────────────────────────────────────────────────────────────────
function Kanban({ tasks, members, onEdit, onDelete, onStatusChange, user }) {
  const { T } = useT()
  const cols = [
    { key:'todo',       label:'To Do',       color:T.t2  },
    { key:'inprogress', label:'In Progress',  color:T.yl  },
    { key:'done',       label:'Done',         color:T.grn },
  ]
  return (
    <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14}}>
      {cols.map(col => {
        const ct = tasks.filter(t => t.status === col.key)
        return (
          <div key={col.key} style={{background:T.bg3, borderRadius:14, padding:14}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
              <span style={{color:col.color, fontWeight:700, fontSize:12, textTransform:'uppercase', letterSpacing:0.6}}>{col.label}</span>
              <span style={{
                background:`${col.color}22`, color:col.color,
                borderRadius:20, padding:'1px 8px', fontSize:11, fontWeight:700
              }}>{ct.length}</span>
            </div>
            {ct.length === 0
              ? <div style={{color:T.t3, fontSize:12, textAlign:'center', padding:'28px 0'}}>Empty</div>
              : ct.map(t => (
                <TaskCard key={t.id} task={t} members={members} onEdit={onEdit}
                  onDelete={onDelete} onStatusChange={onStatusChange} user={user} />
              ))
            }
          </div>
        )
      })}
    </div>
  )
}

// ── TaskForm ──────────────────────────────────────────────────────────────────
function TaskForm({ task, user, members, onClose, onSave, defaultType }) {
  const { T } = useT()
  const [f, setF] = useState({
    title:    task?.title    || '',
    desc:     task?.desc     || '',
    status:   task?.status   || 'todo',
    priority: task?.priority || 'med',
    assignee: task?.assignee || user?.id,
    type:     task?.type     || defaultType || 'group',
    tags:     task?.tags     || [],
  })
  const save = () => {
    if (!f.title.trim()) return
    onSave(task ? { ...task, ...f } : { id:uid(), ...f, creator:user.id, created:Date.now() })
  }
  return (
    <Modal open onClose={onClose} title={task ? 'Edit Task' : 'New Task'}>
      <div style={{display:'flex', flexDirection:'column', gap:12}}>
        <input placeholder="Task title" value={f.title} onChange={e=>setF({...f,title:e.target.value})} style={IS(T)} autoFocus />
        <textarea placeholder="Description (optional)…" value={f.desc} onChange={e=>setF({...f,desc:e.target.value})}
          style={{...IS(T), height:76, resize:'vertical'}} />
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
          <select value={f.status} onChange={e=>setF({...f,status:e.target.value})} style={IS(T)}>
            <option value="todo">To Do</option>
            <option value="inprogress">In Progress</option>
            <option value="done">Done</option>
          </select>
          <select value={f.priority} onChange={e=>setF({...f,priority:e.target.value})} style={IS(T)}>
            <option value="high">High Priority</option>
            <option value="med">Medium</option>
            <option value="low">Low</option>
          </select>
          <select value={f.assignee} onChange={e=>setF({...f,assignee:e.target.value})} style={IS(T)}>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={f.type} onChange={e=>setF({...f,type:e.target.value})} style={IS(T)}>
            <option value="private">🔒 Private</option>
            <option value="group">👥 Group</option>
            <option value="public">🌐 Public</option>
          </select>
        </div>
        <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:4}}>
          <button onClick={onClose} style={GH(T)}>Cancel</button>
          <button onClick={save} style={BT(T.acc)}>Save Task</button>
        </div>
      </div>
    </Modal>
  )
}

// ── BoardPage (shared layout for all boards) ──────────────────────────────────
function BoardPage({ title, tasks, members, user, onAdd, onEdit, onDelete, onStatusChange, filterNote, defaultType }) {
  const { T } = useT()
  const [showAdd, setShowAdd] = useState(false)
  const [editTask, setEditTask] = useState(null)

  const handleEdit = t => setEditTask(t)
  const handleDelete = id => { if (window.confirm('Delete this task?')) onDelete(id) }

  return (
    <div style={{padding:24, overflowY:'auto', flex:1}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22}}>
        <div>
          <h2 className="fh-fraunces" style={{color:T.t1, fontSize:22}}>{title}</h2>
          {filterNote && <p style={{color:T.t3, fontSize:12, marginTop:3}}>{filterNote}</p>}
        </div>
        <button onClick={()=>setShowAdd(true)} style={{...BT(T.acc), display:'flex', alignItems:'center', gap:5}}>
          <I n="plus" size={13} /> Add Task
        </button>
      </div>
      <Kanban tasks={tasks} members={members} onEdit={handleEdit} onDelete={handleDelete}
        onStatusChange={onStatusChange} user={user} />
      {(showAdd || editTask) && (
        <TaskForm
          task={editTask} user={user} members={members} defaultType={defaultType}
          onClose={()=>{ setShowAdd(false); setEditTask(null) }}
          onSave={t=>{ editTask ? onEdit(t) : onAdd(t); setShowAdd(false); setEditTask(null) }}
        />
      )}
    </div>
  )
}

function PrivateBoard({ tasks, members, user, onAdd, onEdit, onDelete, onStatusChange }) {
  const mine = tasks.filter(t => t.type==='private' && t.assignee===user?.id)
  return <BoardPage title="My Private Tasks" tasks={mine} members={members} user={user}
    onAdd={t=>onAdd({...t,type:'private'})} onEdit={onEdit} onDelete={onDelete}
    onStatusChange={onStatusChange} filterNote="Only visible to you" defaultType="private" />
}
function GroupBoard({ tasks, members, user, onAdd, onEdit, onDelete, onStatusChange }) {
  return <BoardPage title="Group Board" tasks={tasks.filter(t=>t.type==='group')} members={members}
    user={user} onAdd={t=>onAdd({...t,type:'group'})} onEdit={onEdit} onDelete={onDelete}
    onStatusChange={onStatusChange} defaultType="group" />
}
function PublicBoard({ tasks, members, user, onAdd, onEdit, onDelete, onStatusChange }) {
  return <BoardPage title="Public Board" tasks={tasks.filter(t=>t.type==='public')} members={members}
    user={user} onAdd={t=>onAdd({...t,type:'public'})} onEdit={onEdit} onDelete={onDelete}
    onStatusChange={onStatusChange} defaultType="public" />
}
function AllTasks({ tasks, members, user, onAdd, onEdit, onDelete, onStatusChange }) {
  const visible = user?.role==='admin'
    ? tasks
    : tasks.filter(t => t.type!=='private' || t.assignee===user?.id)
  return <BoardPage title="All Tasks" tasks={visible} members={members} user={user}
    onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} />
}

// ── WormChart ─────────────────────────────────────────────────────────────────
function WormChart({ tasks }) {
  const { T } = useT()
  const [anim, setAnim] = useState(0)
  useEffect(()=>{
    let v = 0
    const id = setInterval(()=>{ v = Math.min(v + 0.04, 1); setAnim(v); if (v>=1) clearInterval(id) }, 16)
    return ()=>clearInterval(id)
  }, [])

  const W=560, H=120, PAD=24
  const days = Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate()-6+i); return d
  })
  const counts = days.map(d =>
    tasks.filter(t => { const td=new Date(t.created); return td.toDateString()===d.toDateString() && t.status==='done' }).length
  )
  const mx = Math.max(...counts, 1)
  const pts = counts.map((c,i) => ({
    x: PAD + i * ((W - PAD*2) / 6),
    y: H - PAD - (c / mx) * (H - PAD*2) * anim
  }))
  const linePath = pts.map((p,i) => `${i===0?'M':'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${pts[6].x},${H-PAD} L${pts[0].x},${H-PAD} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%', height:H}}>
      <defs>
        <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.acc} stopOpacity="0.28"/>
          <stop offset="100%" stopColor={T.acc} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[0,1,2,3].map(i => (
        <line key={i} x1={PAD} x2={W-PAD}
          y1={H-PAD - i*(H-PAD*2)/3} y2={H-PAD - i*(H-PAD*2)/3}
          stroke={T.brd} strokeWidth={0.5} strokeDasharray="3,3"/>
      ))}
      <path d={areaPath} fill="url(#wg)" />
      <path d={linePath} fill="none" stroke={T.acc} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map((p,i)=>(
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3.5} fill={T.bg2} stroke={T.acc} strokeWidth={2}/>
          <text x={p.x} y={H-3} textAnchor="middle" fontSize={10} fill={T.t3} fontFamily="Plus Jakarta Sans,sans-serif">
            {days[i].toLocaleDateString('en',{weekday:'short'})}
          </text>
          {counts[i]>0 && (
            <text x={p.x} y={p.y-9} textAnchor="middle" fontSize={10} fill={T.acc} fontWeight={700} fontFamily="Plus Jakarta Sans,sans-serif">
              {counts[i]}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

// ── Overview ──────────────────────────────────────────────────────────────────
function Overview({ tasks, members, user, onlineTime }) {
  const { T } = useT()
  const myTasks  = tasks.filter(t => t.assignee===user?.id)
  const done     = myTasks.filter(t => t.status==='done').length
  const inProg   = myTasks.filter(t => t.status==='inprogress').length
  const todo     = myTasks.filter(t => t.status==='todo').length
  const hour     = new Date().getHours()
  const greeting = hour<12 ? 'morning' : hour<17 ? 'afternoon' : 'evening'

  const board = [...members].map(m => ({
    ...m,
    completed: tasks.filter(t=>t.assignee===m.id&&t.status==='done').length,
    active:    tasks.filter(t=>t.assignee===m.id&&t.status==='inprogress').length,
  })).sort((a,b)=>b.completed-a.completed)

  return (
    <div style={{padding:26, overflowY:'auto', flex:1}}>
      <div style={{marginBottom:26}}>
        <h2 className="fh-fraunces" style={{color:T.t1, fontSize:26}}>
          Good {greeting}, {user?.name?.split(' ')[0]} 👋
        </h2>
        <p style={{color:T.t2, fontSize:13, marginTop:4}}>Here's what's happening across your workspace today.</p>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))', gap:12, marginBottom:24}}>
        <Stat label="Tasks Done"   value={done}          icon="check" color={T.grn} />
        <Stat label="In Progress"  value={inProg}        icon="zap"   color={T.yl}  />
        <Stat label="To Do"        value={todo}          icon="task"  color={T.acc} />
        <Stat label="Session Time" value={fmtS(onlineTime)} icon="timer" color={T.acc} />
      </div>

      <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:14, marginBottom:24}}>
        <div style={{background:T.bg2, border:`1px solid ${T.brd}`, borderRadius:14, padding:20}}>
          <h3 className="fh-fraunces" style={{color:T.t1, fontSize:16, marginBottom:16}}>7-Day Productivity Worm</h3>
          <WormChart tasks={tasks} />
        </div>
        <div style={{background:T.bg2, border:`1px solid ${T.brd}`, borderRadius:14, padding:20}}>
          <h3 className="fh-fraunces" style={{color:T.t1, fontSize:16, marginBottom:16}}>Leaderboard 🏆</h3>
          {board.map((m,i) => (
            <div key={m.id} style={{display:'flex', alignItems:'center', gap:10, marginBottom:12}}>
              <span style={{color:i===0?T.yl:T.t3, fontWeight:700, fontSize:14, width:20, flexShrink:0}}>{i+1}</span>
              <Av member={m} size={28} />
              <div style={{flex:1, overflow:'hidden'}}>
                <div style={{color:T.t1, fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{m.name.split(' ')[0]}</div>
                <div style={{color:T.t3, fontSize:11}}>{m.completed} done · {m.active} active</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function Chat({ messages, members, user, onSend, onDelete }) {
  const { T }  = useT()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState([])
  const [confirm, setConfirm] = useState(null)
  const endRef  = useRef(null)
  const fileRef = useRef(null)

  useEffect(()=>endRef.current?.scrollIntoView({behavior:'smooth'}),[messages])

  const send = () => {
    if (!text.trim() && attachments.length===0) return
    onSend({ id:uid(), userId:user.id, text:text.trim(), time:Date.now(), files:[...attachments] })
    setText(''); setAttachments([])
  }

  const pickFile = () => fileRef.current?.click()
  const onFileChange = e => {
    ;[...e.target.files].forEach(f => {
      const r = new FileReader()
      r.onload = ev => setAttachments(p=>[...p,{name:f.name,size:f.size,type:f.type,data:ev.target.result}])
      r.readAsDataURL(f)
    })
  }

  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, overflow:'hidden'}}>
      {/* Messages */}
      <div style={{flex:1, overflowY:'auto', padding:'18px 22px'}}>
        {messages.map(msg => {
          const sender = members.find(m=>m.id===msg.userId)
          const isMe   = msg.userId === user?.id
          return (
            <div key={msg.id} style={{display:'flex', gap:10, marginBottom:18, flexDirection:isMe?'row-reverse':'row'}}>
              <Av member={sender} size={34} />
              <div style={{maxWidth:'68%'}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4, flexDirection:isMe?'row-reverse':'row'}}>
                  <span style={{color:T.t1, fontSize:12, fontWeight:600}}>{sender?.name}</span>
                  <span style={{color:T.t3, fontSize:11}}>{new Date(msg.time).toLocaleTimeString()}</span>
                  {(isMe || user?.role==='admin') && (
                    <button onClick={()=>setConfirm(msg.id)} style={{background:'none',border:'none',color:T.t3,cursor:'pointer',padding:'2px',lineHeight:1}}>
                      <I n="trash" size={12}/>
                    </button>
                  )}
                </div>
                {msg.text && (
                  <div style={{
                    background: isMe ? T.acc : T.bg2,
                    color: isMe ? '#fff' : T.t1,
                    borderRadius: isMe ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                    padding:'10px 14px', fontSize:14, lineHeight:1.55,
                    border: isMe ? 'none' : `1px solid ${T.brd}`
                  }}>{msg.text}</div>
                )}
                {msg.files?.map((f,i)=>(
                  <div key={i} style={{
                    background:T.bg3, border:`1px solid ${T.brd}`, borderRadius:8,
                    padding:'7px 12px', marginTop:5, display:'flex', alignItems:'center', gap:8
                  }}>
                    <I n="paper" size={13} color={T.acc}/>
                    <span style={{color:T.t1, fontSize:12, flex:1}}>{f.name}</span>
                    <a href={f.data} download={f.name}>
                      <I n="download" size={13} color={T.acc}/>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        <div ref={endRef}/>
      </div>

      {/* Attachment tray */}
      {attachments.length > 0 && (
        <div style={{padding:'8px 22px', borderTop:`1px solid ${T.brd}`, display:'flex', gap:7, flexWrap:'wrap'}}>
          {attachments.map((f,i)=>(
            <div key={i} style={{background:T.bg3, borderRadius:8, padding:'4px 10px', display:'flex', alignItems:'center', gap:6}}>
              <span style={{fontSize:12, color:T.t1}}>{f.name}</span>
              <button onClick={()=>setAttachments(p=>p.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:T.t3,cursor:'pointer',lineHeight:1}}>
                <I n="x" size={11}/>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{padding:'14px 22px', borderTop:`1px solid ${T.brd}`, display:'flex', gap:9, alignItems:'flex-end'}}>
        <input type="file" ref={fileRef} onChange={onFileChange} multiple style={{display:'none'}}/>
        <button onClick={pickFile} style={{...GH(T), padding:'8px 11px', lineHeight:1}}>
          <I n="paper" size={15}/>
        </button>
        <input
          value={text} onChange={e=>setText(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&(e.preventDefault(),send())}
          placeholder="Message the team…" style={{...IS(T), flex:1}}
        />
        <button onClick={send} style={{...BT(T.acc), padding:'9px 18px'}}>Send</button>
      </div>

      <Confirm open={!!confirm} onClose={()=>setConfirm(null)} msg="Delete this message permanently?"
        onOk={()=>{ onDelete(confirm); setConfirm(null) }}/>
    </div>
  )
}

// ── Meetings ──────────────────────────────────────────────────────────────────
function Meetings({ meetings, user, onAdd, onDelete }) {
  const { T }  = useT()
  const [showForm, setShowForm] = useState(false)
  const [confirm, setConfirm]   = useState(null)
  const isAdmin = user?.role==='admin'
  const [f, setF] = useState({title:'', time:'', duration:60, link:''})

  const save = () => {
    if (!f.title||!f.time) return
    onAdd({id:uid(), ...f, creator:user.id})
    setF({title:'', time:'', duration:60, link:''}); setShowForm(false)
  }

  return (
    <div style={{padding:26, overflowY:'auto', flex:1}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22}}>
        <h2 className="fh-fraunces" style={{color:T.t1, fontSize:22}}>Meetings</h2>
        {isAdmin && (
          <button onClick={()=>setShowForm(true)} style={{...BT(T.acc), display:'flex', alignItems:'center', gap:5}}>
            <I n="plus" size={13}/> Schedule
          </button>
        )}
      </div>

      {meetings.length===0 && (
        <div style={{color:T.t3, textAlign:'center', padding:'70px 0', fontSize:14}}>No meetings scheduled</div>
      )}

      <div style={{display:'flex', flexDirection:'column', gap:13}}>
        {meetings.map(m => (
          <div key={m.id} style={{
            background:T.bg2, border:`1px solid ${T.brd}`, borderRadius:14,
            padding:20, display:'flex', alignItems:'center', gap:16
          }}>
            <div style={{
              width:48, height:48, background:`${T.acc}1a`, borderRadius:12,
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
            }}>
              <I n="timer" size={22} color={T.acc}/>
            </div>
            <div style={{flex:1}}>
              <div style={{color:T.t1, fontWeight:600, fontSize:15}}>{m.title}</div>
              <div style={{color:T.t2, fontSize:13, marginTop:3}}>
                {new Date(m.time).toLocaleString()} · {m.duration} min
              </div>
              {m.link && (
                <a href={m.link} target="_blank" rel="noopener noreferrer" style={{color:T.acc, fontSize:12, marginTop:4, display:'block'}}>
                  {m.link}
                </a>
              )}
            </div>
            <div style={{display:'flex', gap:8}}>
              <a href={m.link||'#'} target="_blank" rel="noopener noreferrer">
                <button style={{...BT(T.grn), fontSize:12}}>Join</button>
              </a>
              {isAdmin && (
                <button onClick={()=>setConfirm(m.id)} style={{...GH(T), padding:'7px 10px', lineHeight:1}}>
                  <I n="trash" size={14} color={T.red}/>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal open title="Schedule Meeting" onClose={()=>setShowForm(false)}>
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            <input placeholder="Meeting title" value={f.title} onChange={e=>setF({...f,title:e.target.value})} style={IS(T)} autoFocus/>
            <input type="datetime-local" value={f.time} onChange={e=>setF({...f,time:e.target.value})} style={IS(T)}/>
            <input type="number" placeholder="Duration (minutes)" value={f.duration} onChange={e=>setF({...f,duration:+e.target.value})} style={IS(T)}/>
            <input placeholder="Meeting link (optional)" value={f.link} onChange={e=>setF({...f,link:e.target.value})} style={IS(T)}/>
            <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:4}}>
              <button onClick={()=>setShowForm(false)} style={GH(T)}>Cancel</button>
              <button onClick={save} style={BT(T.acc)}>Schedule</button>
            </div>
          </div>
        </Modal>
      )}

      <Confirm open={!!confirm} onClose={()=>setConfirm(null)} msg="Remove this meeting from the schedule?"
        onOk={()=>{ onDelete(confirm); setConfirm(null) }} okLabel="Remove" okColor={T.red}/>
    </div>
  )
}

// ── Awards ────────────────────────────────────────────────────────────────────
function Awards({ tasks, members, user, onResetPoints }) {
  const { T } = useT()
  const [confirm, setConfirm] = useState(false)
  const isAdmin = user?.role==='admin'

  const stats = [...members].map(m => ({
    ...m,
    completed: tasks.filter(t=>t.assignee===m.id&&t.status==='done').length,
    active:    tasks.filter(t=>t.assignee===m.id&&t.status==='inprogress').length,
    total:     tasks.filter(t=>t.assignee===m.id).length,
  })).sort((a,b)=>b.completed-a.completed)

  const MEDALS = ['🥇','🥈','🥉']

  return (
    <div style={{padding:26, overflowY:'auto', flex:1}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22}}>
        <div>
          <h2 className="fh-fraunces" style={{color:T.t1, fontSize:22}}>Awards &amp; Leaderboard</h2>
          <p style={{color:T.t2, fontSize:13, marginTop:3}}>Ranked by completed tasks</p>
        </div>
        {isAdmin && (
          <button onClick={()=>setConfirm(true)} style={{...BT(T.red), display:'flex', alignItems:'center', gap:5}}>
            <I n="trash" size={13}/> Reset All Points
          </button>
        )}
      </div>

      <div style={{display:'flex', flexDirection:'column', gap:12}}>
        {stats.map((m,i) => (
          <div key={m.id} style={{
            background:T.bg2,
            border:`1px solid ${i===0?T.yl:T.brd}`,
            borderRadius:14, padding:20,
            display:'flex', alignItems:'center', gap:16,
            boxShadow: i===0 ? `0 0 0 1px ${T.yl}22,0 4px 24px ${T.yl}0a` : undefined
          }}>
            <div style={{fontSize:30, width:42, textAlign:'center'}}>{MEDALS[i]||`#${i+1}`}</div>
            <Av member={m} size={46}/>
            <div style={{flex:1}}>
              <div style={{color:T.t1, fontWeight:700, fontSize:16}}>{m.name}</div>
              <div style={{color:T.t2, fontSize:12, textTransform:'capitalize', marginTop:2}}>{m.role}</div>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20, textAlign:'center'}}>
              <div>
                <div style={{color:T.grn, fontSize:22, fontWeight:700}}>{m.completed}</div>
                <div style={{color:T.t3, fontSize:11}}>Done</div>
              </div>
              <div>
                <div style={{color:T.yl, fontSize:22, fontWeight:700}}>{m.active}</div>
                <div style={{color:T.t3, fontSize:11}}>Active</div>
              </div>
              <div>
                <div style={{color:T.t2, fontSize:22, fontWeight:700}}>{m.total}</div>
                <div style={{color:T.t3, fontSize:11}}>Total</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Confirm open={confirm} onClose={()=>setConfirm(false)}
        msg="This will reset all completed tasks back to 'To Do'. This affects every member. Are you sure?"
        onOk={()=>{ onResetPoints(); setConfirm(false) }} okLabel="Reset All Points" okColor={T.red}/>
    </div>
  )
}

// ── Whiteboard ────────────────────────────────────────────────────────────────
function Whiteboard({ notes, onNoteSave }) {
  const { T }  = useT()
  const [tab, setTab] = useState('canvas')
  const canvasRef = useRef(null)
  const [tool, setTool]   = useState('pen')
  const [color, setColor] = useState('#58a6ff')
  const [size, setSize]   = useState(3)
  const [drawing, setDrawing] = useState(false)
  const [noteTab, setNoteTab] = useState('meeting')
  const [noteText, setNoteText] = useState(notes?.meeting || '')

  useEffect(()=>setNoteText(notes?.[noteTab]||''), [noteTab, notes])

  const getCtx = () => canvasRef.current?.getContext('2d')
  const getPos = e => {
    const r = canvasRef.current.getBoundingClientRect()
    const s = e.touches?.[0] || e
    return [s.clientX - r.left, s.clientY - r.top]
  }

  const startDraw = e => {
    setDrawing(true)
    const ctx = getCtx(); if(!ctx) return
    ctx.beginPath(); ctx.moveTo(...getPos(e))
  }
  const doDraw = e => {
    if (!drawing) return
    const [x,y] = getPos(e)
    const ctx = getCtx(); if(!ctx) return
    ctx.globalCompositeOperation = tool==='eraser' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = color
    ctx.lineWidth   = tool==='eraser' ? size*5 : size
    ctx.lineCap='round'; ctx.lineJoin='round'
    ctx.lineTo(x,y); ctx.stroke()
  }
  const endDraw = () => { setDrawing(false); getCtx()?.beginPath() }

  const clear = () => {
    const cv = canvasRef.current; if(!cv) return
    getCtx().clearRect(0,0,cv.width,cv.height)
  }
  const exportPng = () => {
    const cv = canvasRef.current; if(!cv) return
    const a = document.createElement('a'); a.href=cv.toDataURL(); a.download='whiteboard.png'; a.click()
  }

  const PALETTE = ['#58a6ff','#3fb950','#f85149','#d29922','#a371f7','#ffa657','#ffffff','#1c1c1c']

  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, overflow:'hidden'}}>
      {/* Tab switcher */}
      <div style={{padding:'12px 22px', borderBottom:`1px solid ${T.brd}`, display:'flex', gap:8}}>
        {[['canvas','🎨 Canvas'],['notes','📝 Notes']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{
            ...GH(T), background:tab===k?`${T.acc}1a`:undefined,
            color:tab===k?T.acc:T.t2, borderColor:tab===k?T.acc:T.brd
          }}>{l}</button>
        ))}
      </div>

      {tab==='canvas' ? (
        <>
          {/* Toolbar */}
          <div style={{padding:'10px 22px', borderBottom:`1px solid ${T.brd}`, display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', background:T.bg2}}>
            <div style={{display:'flex', gap:5}}>
              {[['pen','✏️ Pen'],['eraser','⬜ Eraser']].map(([k,l])=>(
                <button key={k} onClick={()=>setTool(k)} style={{
                  ...GH(T), background:tool===k?`${T.acc}1a`:undefined,
                  color:tool===k?T.acc:T.t2, fontSize:12, padding:'5px 12px'
                }}>{l}</button>
              ))}
            </div>
            <div style={{display:'flex', gap:5, alignItems:'center'}}>
              {PALETTE.map(c=>(
                <button key={c} onClick={()=>setColor(c)} style={{
                  width:20, height:20, borderRadius:'50%', background:c,
                  border:color===c?`3px solid ${T.acc}`:`1px solid ${T.brd}`, cursor:'pointer',
                  flexShrink:0
                }}/>
              ))}
              <input type="color" value={color} onChange={e=>setColor(e.target.value)}
                style={{width:26, height:26, borderRadius:6, border:'none', cursor:'pointer', background:'none'}}/>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:7}}>
              <input type="range" min={1} max={24} value={size} onChange={e=>setSize(+e.target.value)} style={{width:72}}/>
              <span style={{color:T.t2, fontSize:12, width:24}}>{size}px</span>
            </div>
            <div style={{marginLeft:'auto', display:'flex', gap:8}}>
              <button onClick={clear} style={GH(T)}>Clear</button>
              <button onClick={exportPng} style={{...BT(T.acc), display:'flex', alignItems:'center', gap:5}}>
                <I n="download" size={13}/> Export PNG
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div style={{flex:1, overflow:'hidden', display:'flex', justifyContent:'center', alignItems:'center', padding:14, background:T.bg3}}>
            <canvas ref={canvasRef} width={920} height={520}
              style={{background:'#ffffff', borderRadius:12, maxWidth:'100%', maxHeight:'100%',
                cursor:tool==='eraser'?'cell':'crosshair', boxShadow:`0 4px 28px ${T.shadow}`, display:'block'}}
              onMouseDown={startDraw} onMouseMove={doDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={doDraw} onTouchEnd={endDraw}
            />
          </div>
        </>
      ) : (
        <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', padding:22}}>
          <div style={{display:'flex', gap:7, marginBottom:14, alignItems:'center', flexWrap:'wrap'}}>
            {['meeting','lecture','personal'].map(t=>(
              <button key={t} onClick={()=>setNoteTab(t)} style={{
                ...GH(T), background:noteTab===t?`${T.acc}1a`:undefined,
                color:noteTab===t?T.acc:T.t2, fontSize:12, padding:'5px 12px', textTransform:'capitalize'
              }}>{t}</button>
            ))}
            <div style={{marginLeft:'auto', display:'flex', gap:8}}>
              <button onClick={()=>onNoteSave(noteTab, noteText)} style={{...BT(T.grn), fontSize:12}}>
                Save
              </button>
              <button onClick={()=>{
                const a=document.createElement('a')
                a.href='data:text/markdown;charset=utf-8,'+encodeURIComponent(noteText)
                a.download=`${noteTab}-notes.md`; a.click()
              }} style={{...BT(T.acc), display:'flex', alignItems:'center', gap:5, fontSize:12}}>
                <I n="download" size={12}/> Export .md
              </button>
            </div>
          </div>
          <textarea
            value={noteText} onChange={e=>setNoteText(e.target.value)}
            placeholder={`Start typing ${noteTab} notes… (Markdown supported)`}
            style={{...IS(T), flex:1, resize:'none', fontFamily:'ui-monospace,monospace', fontSize:14, lineHeight:1.75, padding:16}}
          />
        </div>
      )}
    </div>
  )
}

// ── File Storage ──────────────────────────────────────────────────────────────
function FileStorage({ files, user, onUpload, onDelete, onShare }) {
  const { T }  = useT()
  const [tab, setTab]     = useState('personal')
  const [confirm, setConfirm] = useState(null)
  const fileRef = useRef(null)

  const onFileChange = e => {
    ;[...e.target.files].forEach(f => {
      const r = new FileReader()
      r.onload = ev => onUpload({id:uid(),name:f.name,size:f.size,type:f.type,data:ev.target.result,owner:user.id,shared:false,created:Date.now()})
      r.readAsDataURL(f)
    })
    e.target.value = ''
  }

  const visible = tab==='personal'
    ? files.filter(f=>f.owner===user.id)
    : files.filter(f=>f.shared||f.owner===user.id)

  const fmtBytes = b => b>1e6?`${(b/1e6).toFixed(1)} MB`:b>1e3?`${(b/1e3).toFixed(0)} KB`:`${b} B`
  const fileIcon = f => f.type?.startsWith('image/')?'🖼️':f.type?.includes('pdf')?'📄':f.type?.startsWith('video/')?'🎥':f.type?.startsWith('audio/')?'🎵':'📁'

  return (
    <div style={{padding:26, overflowY:'auto', flex:1}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22, flexWrap:'wrap', gap:10}}>
        <h2 className="fh-fraunces" style={{color:T.t1, fontSize:22}}>File Storage</h2>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          {['personal','shared'].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              ...GH(T), background:tab===t?`${T.acc}1a`:undefined,
              color:tab===t?T.acc:T.t2, textTransform:'capitalize', fontSize:12
            }}>{t}</button>
          ))}
          <input type="file" ref={fileRef} onChange={onFileChange} multiple style={{display:'none'}}/>
          <button onClick={()=>fileRef.current?.click()} style={{...BT(T.acc), display:'flex', alignItems:'center', gap:5}}>
            <I n="upload" size={13}/> Upload
          </button>
        </div>
      </div>

      {visible.length===0 && (
        <div style={{color:T.t3, textAlign:'center', padding:'70px 0', fontSize:14}}>
          No files {tab==='personal'?'uploaded yet':'shared with you'}
        </div>
      )}

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))', gap:12}}>
        {visible.map(f=>(
          <div key={f.id} style={{background:T.bg2, border:`1px solid ${f.shared?T.grn:T.brd}`, borderRadius:12, padding:16}}>
            <div style={{display:'flex', alignItems:'flex-start', gap:12, marginBottom:12}}>
              <div style={{
                width:42, height:42, background:`${T.acc}1a`, borderRadius:10,
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0
              }}>{fileIcon(f)}</div>
              <div style={{flex:1, overflow:'hidden'}}>
                <div style={{color:T.t1, fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{f.name}</div>
                <div style={{color:T.t3, fontSize:11, marginTop:2}}>{fmtBytes(f.size)} · {f.shared?<span style={{color:T.grn}}>shared</span>:'private'}</div>
              </div>
            </div>
            <div style={{display:'flex', gap:6}}>
              <a href={f.data} download={f.name} style={{flex:1}}>
                <button style={{...GH(T), width:'100%', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', gap:4}}>
                  <I n="download" size={12}/> Download
                </button>
              </a>
              {f.owner===user.id && (
                <>
                  <button onClick={()=>onShare(f.id)} style={{
                    ...GH(T), padding:'6px 10px',
                    background:f.shared?`${T.grn}1a`:undefined,
                    borderColor:f.shared?T.grn:T.brd, color:f.shared?T.grn:T.t2
                  }}><I n="share" size={13}/></button>
                  <button onClick={()=>setConfirm(f.id)} style={{...GH(T), padding:'6px 10px'}}>
                    <I n="trash" size={13} color={T.red}/>
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <Confirm open={!!confirm} onClose={()=>setConfirm(null)} msg="Permanently delete this file?"
        onOk={()=>{ onDelete(confirm); setConfirm(null) }}/>
    </div>
  )
}

// ── AdminPanel ────────────────────────────────────────────────────────────────
function AdminPanel({ members, tasks, messages, projects, onDeleteTask, onDeleteMsg, onDeleteProject, onUpdateMember, onAddProject }) {
  const { T } = useT()
  const [tab, setTab] = useState('members')
  const TABS = [
    { id:'members',   label:'Members'   },
    { id:'passwords', label:'Passwords' },
    { id:'tasks',     label:'Tasks'     },
    { id:'chat',      label:'Chat'      },
    { id:'projects',  label:'Projects'  },
  ]

  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, overflow:'hidden'}}>
      <div style={{padding:'13px 22px', borderBottom:`1px solid ${T.brd}`, display:'flex', gap:6, flexWrap:'wrap', background:T.bg2}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            ...GH(T), background:tab===t.id?`${T.acc}1a`:undefined,
            color:tab===t.id?T.acc:T.t2, borderColor:tab===t.id?T.acc:T.brd, fontSize:13
          }}>{t.label}</button>
        ))}
      </div>
      <div style={{flex:1, overflowY:'auto', padding:24}}>
        {tab==='members'   && <AdminMembers   members={members} tasks={tasks} onUpdate={onUpdateMember}/>}
        {tab==='passwords' && <AdminPasswords members={members} onUpdate={onUpdateMember}/>}
        {tab==='tasks'     && <AdminTasks     tasks={tasks}     members={members}  onDelete={onDeleteTask}/>}
        {tab==='chat'      && <AdminChat      messages={messages} members={members} onDelete={onDeleteMsg}/>}
        {tab==='projects'  && <AdminProjects  projects={projects} members={members} onDelete={onDeleteProject} onAdd={onAddProject}/>}
      </div>
    </div>
  )
}

// ── Admin: Members ─────────────────────────────────────────────────────────────
function AdminMembers({ members, tasks, onUpdate }) {
  const { T } = useT()
  const [edit, setEdit] = useState(null)
  const [f, setF] = useState({name:'', role:'member', email:''})

  const openEdit = m => { setEdit(m.id); setF({name:m.name, role:m.role, email:m.email}) }
  const save = () => { onUpdate(edit, f); setEdit(null) }

  return (
    <div>
      <h3 className="fh-fraunces" style={{color:T.t1, fontSize:18, marginBottom:5}}>Team Members</h3>
      <p style={{color:T.t2, fontSize:13, marginBottom:22}}>Edit member names, emails, and roles.</p>

      <div style={{display:'flex', flexDirection:'column', gap:11}}>
        {members.map(m => (
          <div key={m.id} style={{
            background:T.bg2, border:`1px solid ${T.brd}`, borderRadius:13,
            padding:'14px 18px', display:'flex', alignItems:'center', gap:14
          }}>
            <Av member={m} size={42}/>
            <div style={{flex:1}}>
              <div style={{color:T.t1, fontWeight:600, fontSize:14}}>{m.name}</div>
              <div style={{color:T.t3, fontSize:12, marginTop:2}}>
                {m.email} ·{' '}
                <span style={{textTransform:'capitalize', color:m.role==='admin'?T.yl:T.t3, fontWeight:600}}>{m.role}</span>
              </div>
            </div>
            <div style={{textAlign:'center', marginRight:16}}>
              <div style={{color:T.t1, fontWeight:700, fontSize:18}}>{tasks.filter(t=>t.assignee===m.id&&t.status==='done').length}</div>
              <div style={{color:T.t3, fontSize:11}}>done</div>
            </div>
            <button onClick={()=>openEdit(m)} style={{...GH(T), padding:'7px 11px'}}><I n="edit" size={14}/></button>
          </div>
        ))}
      </div>

      {edit && (
        <Modal open onClose={()=>setEdit(null)} title="Edit Member">
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            <input value={f.name}  onChange={e=>setF({...f,name:e.target.value})}  placeholder="Full name"  style={IS(T)} autoFocus/>
            <input value={f.email} onChange={e=>setF({...f,email:e.target.value})} placeholder="Email"      style={IS(T)}/>
            <select value={f.role} onChange={e=>setF({...f,role:e.target.value})} style={IS(T)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:4}}>
              <button onClick={()=>setEdit(null)} style={GH(T)}>Cancel</button>
              <button onClick={save} style={BT(T.acc)}>Save Changes</button>
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
  const [sel, setSel]         = useState('')
  const [np, setNp]           = useState('')
  const [mustChange, setMustChange] = useState(false)
  const [flash, setFlash]     = useState('')

  const setNewPw = () => {
    if (!sel) return setFlash('⚠️ Select a member first.')
    if (np.length < 6) return setFlash('⚠️ Password must be 6+ characters.')
    onUpdate(sel, { pw: np, mustChangePw: mustChange })
    setFlash('✓ Password updated successfully.')
    setNp(''); setMustChange(false)
    setTimeout(()=>setFlash(''), 3500)
  }

  const removeReq = id => {
    onUpdate(id, { mustChangePw: false })
    setFlash('✓ Change requirement removed.')
    setTimeout(()=>setFlash(''), 3000)
  }

  return (
    <div>
      <h3 className="fh-fraunces" style={{color:T.t1, fontSize:18, marginBottom:5}}>Password Management</h3>
      <p style={{color:T.t2, fontSize:13, marginBottom:22}}>Set passwords or force a member to change theirs on next login.</p>

      <div style={{background:T.bg2, border:`1px solid ${T.brd}`, borderRadius:14, padding:22, marginBottom:18}}>
        <h4 style={{color:T.t1, fontSize:15, marginBottom:16, fontWeight:600}}>Set Member Password</h4>
        {flash && (
          <div style={{
            background: flash.startsWith('✓') ? `${T.grn}18` : `${T.yl}18`,
            border:`1px solid ${flash.startsWith('✓')?T.grn:T.yl}44`,
            borderRadius:8, padding:'9px 13px', fontSize:13,
            color:flash.startsWith('✓')?T.grn:T.yl, marginBottom:14
          }}>{flash}</div>
        )}
        <div style={{display:'flex', flexDirection:'column', gap:11}}>
          <select value={sel} onChange={e=>setSel(e.target.value)} style={IS(T)}>
            <option value="">— Choose a member —</option>
            {members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input type="password" placeholder="New password (min 6 chars)" value={np}
            onChange={e=>setNp(e.target.value)} style={IS(T)}/>
          <label style={{display:'flex', alignItems:'center', gap:9, cursor:'pointer', userSelect:'none'}}>
            <input type="checkbox" checked={mustChange} onChange={e=>setMustChange(e.target.checked)}/>
            <span style={{color:T.t2, fontSize:13}}>Require this member to change their password on next login</span>
          </label>
          <button onClick={setNewPw} style={{...BT(T.acc), display:'flex', alignItems:'center', gap:6, alignSelf:'flex-start'}}>
            <I n="key" size={13}/> Set Password
          </button>
        </div>
      </div>

      <div style={{background:T.bg2, border:`1px solid ${T.brd}`, borderRadius:14, padding:22}}>
        <h4 style={{color:T.t1, fontSize:15, marginBottom:16, fontWeight:600}}>Change Requirements</h4>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {members.map(m=>(
            <div key={m.id} style={{display:'flex', alignItems:'center', gap:12}}>
              <Av member={m} size={30}/>
              <span style={{color:T.t1, fontSize:13, fontWeight:500, flex:1}}>{m.name}</span>
              <span style={{
                fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:6, textTransform:'uppercase',
                background:m.mustChangePw?`${T.yl}18`:`${T.grn}18`,
                color:m.mustChangePw?T.yl:T.grn
              }}>{m.mustChangePw?'Must change':'OK'}</span>
              {m.mustChangePw && (
                <button onClick={()=>removeReq(m.id)} style={{...GH(T), fontSize:11, padding:'3px 10px'}}>
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
  const [filter, setFilter]   = useState('all')
  const [search, setSearch]   = useState('')

  const filtered = tasks.filter(t => {
    const matchType   = filter==='all' || t.type===filter
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  const STATUS_COLOR = { todo:T.t2, inprogress:T.yl, done:T.grn }
  const TYPE_COLOR   = { private:T.acc, group:T.grn, public:T.yl }
  const STATUS_LABEL = { todo:'To Do', inprogress:'In Progress', done:'Done' }

  return (
    <div>
      <h3 className="fh-fraunces" style={{color:T.t1, fontSize:18, marginBottom:5}}>Task Management</h3>
      <p style={{color:T.t2, fontSize:13, marginBottom:20}}>
        View and delete any task across all boards. {tasks.length} tasks total.
      </p>

      {/* Filters */}
      <div style={{display:'flex', gap:10, marginBottom:18, flexWrap:'wrap', alignItems:'center'}}>
        <input placeholder="Search tasks…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{...IS(T), flex:'1 1 180px'}}/>
        <div style={{display:'flex', gap:5, flexWrap:'wrap'}}>
          {['all','private','group','public'].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{
              ...GH(T), background:filter===f?`${T.acc}1a`:undefined,
              color:filter===f?T.acc:T.t2, fontSize:12, padding:'5px 12px', textTransform:'capitalize'
            }}>{f}</button>
          ))}
        </div>
      </div>

      {/* Task list */}
      {filtered.length===0 ? (
        <div style={{color:T.t3, textAlign:'center', padding:'48px 0'}}>No tasks match the filter</div>
      ) : (
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {filtered.map(t => {
            const assignee = members.find(m=>m.id===t.assignee)
            const creator  = members.find(m=>m.id===t.creator)
            return (
              <div key={t.id} style={{
                background:T.bg2, border:`1px solid ${T.brd}`, borderRadius:12,
                padding:'13px 16px', display:'flex', alignItems:'center', gap:14
              }}>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', gap:7, flexWrap:'wrap', marginBottom:5}}>
                    <span style={{color:T.t1, fontWeight:600, fontSize:13}}>{t.title}</span>
                    <span style={{
                      fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:5, textTransform:'uppercase',
                      background:`${TYPE_COLOR[t.type]}18`, color:TYPE_COLOR[t.type]
                    }}>{t.type}</span>
                    <span style={{
                      fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:5, textTransform:'uppercase',
                      background:P_BG[t.priority], color:P_COLOR[t.priority]
                    }}>{t.priority}</span>
                  </div>
                  <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
                    <span style={{color:STATUS_COLOR[t.status], fontSize:12, fontWeight:600}}>
                      {STATUS_LABEL[t.status]}
                    </span>
                    {assignee && (
                      <span style={{color:T.t3, fontSize:12, display:'inline-flex', alignItems:'center', gap:5}}>
                        <Av member={assignee} size={16}/> {assignee.name}
                      </span>
                    )}
                    {creator && creator.id!==assignee?.id && (
                      <span style={{color:T.t3, fontSize:12}}>by {creator.name}</span>
                    )}
                    <span style={{color:T.t3, fontSize:11}}>{new Date(t.created).toLocaleDateString()}</span>
                  </div>
                </div>
                <button onClick={()=>setConfirm(t.id)} style={{...GH(T), padding:'7px 10px', flexShrink:0}}>
                  <I n="trash" size={14} color={T.red}/>
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Confirm open={!!confirm} onClose={()=>setConfirm(null)} msg="Permanently delete this task? This cannot be undone."
        onOk={()=>{ onDelete(confirm); setConfirm(null) }}/>
    </div>
  )
}

// ── Admin: Chat ───────────────────────────────────────────────────────────────
function AdminChat({ messages, members, onDelete }) {
  const { T } = useT()
  const [confirm, setConfirm] = useState(null)
  const [search, setSearch]   = useState('')

  const filtered = [...messages]
    .filter(m => !search || m.text?.toLowerCase().includes(search.toLowerCase()))
    .reverse()

  return (
    <div>
      <h3 className="fh-fraunces" style={{color:T.t1, fontSize:18, marginBottom:5}}>Chat Moderation</h3>
      <p style={{color:T.t2, fontSize:13, marginBottom:20}}>
        Review and delete messages. {messages.length} messages total.
      </p>

      <input placeholder="Search messages…" value={search} onChange={e=>setSearch(e.target.value)}
        style={{...IS(T), marginBottom:18}}/>

      {filtered.length===0 ? (
        <div style={{color:T.t3, textAlign:'center', padding:'48px 0'}}>No messages found</div>
      ) : (
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {filtered.map(msg => {
            const sender = members.find(m=>m.id===msg.userId)
            return (
              <div key={msg.id} style={{
                background:T.bg2, border:`1px solid ${T.brd}`, borderRadius:12,
                padding:'12px 16px', display:'flex', alignItems:'flex-start', gap:12
              }}>
                <Av member={sender} size={34}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', gap:9, marginBottom:5, flexWrap:'wrap'}}>
                    <span style={{color:T.t1, fontWeight:600, fontSize:13}}>{sender?.name || 'Unknown'}</span>
                    <span style={{color:T.t3, fontSize:11}}>{new Date(msg.time).toLocaleString()}</span>
                  </div>
                  {msg.text && (
                    <p style={{color:T.t2, fontSize:13, lineHeight:1.55, wordBreak:'break-word'}}>{msg.text}</p>
                  )}
                  {msg.files?.length > 0 && (
                    <div style={{color:T.t3, fontSize:12, marginTop:5}}>
                      📎 {msg.files.length} attachment{msg.files.length!==1?'s':''}
                    </div>
                  )}
                </div>
                <button onClick={()=>setConfirm(msg.id)} style={{...GH(T), padding:'7px 10px', flexShrink:0}}>
                  <I n="trash" size={14} color={T.red}/>
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Confirm open={!!confirm} onClose={()=>setConfirm(null)} msg="Delete this message from the team chat?"
        onOk={()=>{ onDelete(confirm); setConfirm(null) }}/>
    </div>
  )
}

// ── Admin: Projects ───────────────────────────────────────────────────────────
function AdminProjects({ projects, members, onDelete, onAdd }) {
  const { T } = useT()
  const [confirm, setConfirm] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [f, setF] = useState({ name:'', desc:'', color:'#58a6ff', members:[] })

  const resetForm = () => setF({ name:'', desc:'', color:'#58a6ff', members:[] })

  const save = () => {
    if (!f.name.trim()) return
    onAdd({ id:uid(), ...f })
    resetForm(); setShowForm(false)
  }

  const toggleMember = id => setF(prev => ({
    ...prev,
    members: prev.members.includes(id)
      ? prev.members.filter(m=>m!==id)
      : [...prev.members, id]
  }))

  return (
    <div>
      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:22, gap:10}}>
        <div>
          <h3 className="fh-fraunces" style={{color:T.t1, fontSize:18, marginBottom:5}}>Projects</h3>
          <p style={{color:T.t2, fontSize:13}}>Manage project groups and team assignments. {projects.length} projects.</p>
        </div>
        <button onClick={()=>setShowForm(true)} style={{...BT(T.acc), display:'flex', alignItems:'center', gap:5, flexShrink:0}}>
          <I n="plus" size={13}/> New Project
        </button>
      </div>

      {projects.length===0 ? (
        <div style={{color:T.t3, textAlign:'center', padding:'48px 0'}}>No projects yet</div>
      ) : (
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          {projects.map(p=>(
            <div key={p.id} style={{
              background:T.bg2, border:`1px solid ${T.brd}`, borderRadius:14,
              padding:20, display:'flex', alignItems:'flex-start', gap:16
            }}>
              <div style={{
                width:46, height:46, borderRadius:12,
                background:`${p.color}18`, border:`2px solid ${p.color}44`,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
              }}>
                <I n="files" size={20} color={p.color}/>
              </div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{color:T.t1, fontWeight:700, fontSize:15, marginBottom:4}}>{p.name}</div>
                {p.desc && <p style={{color:T.t2, fontSize:13, marginBottom:10, lineHeight:1.5}}>{p.desc}</p>}
                <div style={{display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
                  {p.members.map(mid => {
                    const m = members.find(x=>x.id===mid)
                    return m ? <Av key={mid} member={m} size={26}/> : null
                  })}
                  <span style={{color:T.t3, fontSize:12}}>
                    {p.members.length} member{p.members.length!==1?'s':''}
                  </span>
                </div>
              </div>
              <button onClick={()=>setConfirm(p.id)} style={{...GH(T), padding:'7px 10px', flexShrink:0}}>
                <I n="trash" size={14} color={T.red}/>
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal open onClose={()=>{ setShowForm(false); resetForm() }} title="Create New Project" width={500}>
          <div style={{display:'flex', flexDirection:'column', gap:13}}>
            <input placeholder="Project name" value={f.name} onChange={e=>setF({...f,name:e.target.value})} style={IS(T)} autoFocus/>
            <textarea placeholder="Description (optional)…" value={f.desc} onChange={e=>setF({...f,desc:e.target.value})}
              style={{...IS(T), height:72, resize:'none'}}/>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <span style={{color:T.t2, fontSize:13}}>Accent color:</span>
              <input type="color" value={f.color} onChange={e=>setF({...f,color:e.target.value})}
                style={{width:38, height:38, borderRadius:8, border:`1px solid ${T.brd}`, cursor:'pointer', background:'none'}}/>
              <div style={{width:38, height:38, borderRadius:8, background:`${f.color}18`, border:`2px solid ${f.color}55`}}/>
            </div>
            <div>
              <div style={{color:T.t2, fontSize:13, marginBottom:10, fontWeight:600}}>Team members:</div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
                {members.map(m=>(
                  <label key={m.id} style={{
                    display:'flex', alignItems:'center', gap:9, cursor:'pointer',
                    background: f.members.includes(m.id) ? `${f.color}10` : T.bg3,
                    border:`1px solid ${f.members.includes(m.id)?f.color:T.brd}`,
                    borderRadius:9, padding:'8px 12px', transition:'all 0.15s'
                  }}>
                    <input type="checkbox" checked={f.members.includes(m.id)} onChange={()=>toggleMember(m.id)}/>
                    <Av member={m} size={24}/>
                    <span style={{color:T.t1, fontSize:13}}>{m.name.split(' ')[0]}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:4}}>
              <button onClick={()=>{ setShowForm(false); resetForm() }} style={GH(T)}>Cancel</button>
              <button onClick={save} style={BT(T.acc)}>Create Project</button>
            </div>
          </div>
        </Modal>
      )}

      <Confirm open={!!confirm} onClose={()=>setConfirm(null)} msg="Delete this project? This cannot be undone."
        onOk={()=>{ onDelete(confirm); setConfirm(null) }}/>
    </div>
  )
}

// ── Root App ──────────────────────────────────────────────────────────────────
function App() {
  const [dark, setDark] = useState(true)
  const T = dark ? DARK : LIGHT

  const [user,     setUser]     = useState(null)
  const [members,  setMembers]  = useState(SEED_MEMBERS)
  const [tasks,    setTasks]    = useState(SEED_TASKS)
  const [messages, setMessages] = useState(SEED_MESSAGES)
  const [meetings, setMeetings] = useState(SEED_MEETINGS)
  const [projects, setProjects] = useState(SEED_PROJECTS)
  const [notes,    setNotes]    = useState({meeting:'', lecture:'', personal:''})
  const [files,    setFiles]    = useState([])
  const [page,     setPage]     = useState('overview')
  const [onlineTime, setOnlineTime] = useState(0)
  const [onBreak, setOnBreak]   = useState(false)
  const timerRef = useRef(null)

  // ── Persist via window.storage ─────────────────────────────────────────────
  const tryGet = useCallback(async key => {
    try {
      const r = await window.storage?.get(key, true)
      return r?.value ? JSON.parse(r.value) : null
    } catch { return null }
  }, [])
  const trySet = useCallback(async (key, val) => {
    try { await window.storage?.set(key, JSON.stringify(val), true) } catch {}
  }, [])

  useEffect(()=>{
    (async()=>{
      const [m,t,msg,meet,proj,n,f,d] = await Promise.all([
        tryGet('fh3_members'), tryGet('fh3_tasks'),    tryGet('fh3_messages'),
        tryGet('fh3_meetings'), tryGet('fh3_projects'), tryGet('fh3_notes'),
        tryGet('fh3_files'),   tryGet('fh3_dark')
      ])
      if (m)            setMembers(m)
      if (t)            setTasks(t)
      if (msg)          setMessages(msg)
      if (meet)         setMeetings(meet)
      if (proj)         setProjects(proj)
      if (n)            setNotes(n)
      if (f)            setFiles(f)
      if (d !== null && d !== undefined) setDark(d)
    })()
  }, [])

  useEffect(()=>{ trySet('fh3_members',  members)  }, [members])
  useEffect(()=>{ trySet('fh3_tasks',    tasks)    }, [tasks])
  useEffect(()=>{ trySet('fh3_messages', messages) }, [messages])
  useEffect(()=>{ trySet('fh3_meetings', meetings) }, [meetings])
  useEffect(()=>{ trySet('fh3_projects', projects) }, [projects])
  useEffect(()=>{ trySet('fh3_notes',   notes)    }, [notes])
  useEffect(()=>{ trySet('fh3_files',   files)    }, [files])
  useEffect(()=>{ trySet('fh3_dark',    dark)     }, [dark])

  // ── CSS injection ──────────────────────────────────────────────────────────
  useEffect(()=>{
    let el = document.getElementById('fh3css')
    if (!el) { el = document.createElement('style'); el.id='fh3css'; document.head.appendChild(el) }
    el.textContent = mkCSS(dark)
  }, [dark])

  // ── Online timer ───────────────────────────────────────────────────────────
  useEffect(()=>{
    if (!user) return
    clearInterval(timerRef.current)
    timerRef.current = setInterval(()=>{
      setOnBreak(ob => { if (!ob) setOnlineTime(t=>t+1); return ob })
    }, 1000)
    return ()=>clearInterval(timerRef.current)
  }, [user])

  // ── onLogin ────────────────────────────────────────────────────────────────
  const onLogin = (member, newPw) => {
    if (newPw) {
      const updated = members.map(m =>
        m.id === member.id ? { ...m, pw: newPw, mustChangePw: false } : m
      )
      setMembers(updated)
      setUser(updated.find(m => m.id === member.id))
    } else {
      setUser(members.find(m => m.id === member.id) || member)
    }
  }
  const onLogout = () => { setUser(null); setOnlineTime(0); setPage('overview') }

  // ── Task ops ───────────────────────────────────────────────────────────────
  const addTask          = t  => setTasks(p=>[...p, t])
  const editTask         = t  => setTasks(p=>p.map(x=>x.id===t.id?t:x))
  const deleteTask       = id => setTasks(p=>p.filter(t=>t.id!==id))
  const statusChange     = (id, status) => setTasks(p=>p.map(t=>t.id===id?{...t,status}:t))

  // ── Chat ops ───────────────────────────────────────────────────────────────
  const sendMsg          = m  => setMessages(p=>[...p, m])
  const deleteMsg        = id => setMessages(p=>p.filter(m=>m.id!==id))

  // ── Meeting ops ────────────────────────────────────────────────────────────
  const addMeeting       = m  => setMeetings(p=>[...p, m])
  const deleteMeeting    = id => setMeetings(p=>p.filter(m=>m.id!==id))

  // ── Project ops ────────────────────────────────────────────────────────────
  const addProject       = p  => setProjects(prev=>[...prev, p])
  const deleteProject    = id => setProjects(p=>p.filter(x=>x.id!==id))

  // ── Member ops ─────────────────────────────────────────────────────────────
  const updateMember = (id, patch) => {
    setMembers(p=>p.map(m=>m.id===id?{...m,...patch}:m))
    if (user?.id === id) setUser(u=>({...u,...patch}))
  }

  // ── File ops ───────────────────────────────────────────────────────────────
  const uploadFile       = f  => setFiles(p=>[...p, f])
  const deleteFile       = id => setFiles(p=>p.filter(f=>f.id!==id))
  const shareFile        = id => setFiles(p=>p.map(f=>f.id===id?{...f,shared:!f.shared}:f))

  // ── Notes ──────────────────────────────────────────────────────────────────
  const saveNote = (tab, text) => setNotes(n=>({...n,[tab]:text}))

  // ── Awards / Reset ─────────────────────────────────────────────────────────
  const resetPoints = () => setTasks(p=>p.map(t=>t.status==='done'?{...t,status:'todo'}:t))

  // ── Shared task props ──────────────────────────────────────────────────────
  const boardProps = {
    tasks, members, user,
    onAdd:addTask, onEdit:editTask, onDelete:deleteTask, onStatusChange:statusChange
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!user) return (
    <TC.Provider value={{T, dark, setDark}}>
      <Login members={members} onLogin={onLogin} dark={dark} setDark={setDark}/>
    </TC.Provider>
  )

  return (
    <TC.Provider value={{T, dark, setDark}}>
      <div style={{display:'flex', height:'100vh', overflow:'hidden', background:T.bg}}>
        <Sidebar page={page} setPage={setPage} user={user} members={members}/>
        <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0}}>
          <TopBar
            page={page} user={user} onlineTime={onlineTime}
            onBreak={onBreak} setOnBreak={setOnBreak}
            dark={dark} setDark={setDark}
            onQuickAdd={addTask} onLogout={onLogout}
          />
          <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0}}>
            {page==='overview'   && <Overview    tasks={tasks} members={members} user={user} onlineTime={onlineTime}/>}
            {page==='private'    && <PrivateBoard {...boardProps}/>}
            {page==='group'      && <GroupBoard   {...boardProps}/>}
            {page==='public'     && <PublicBoard  {...boardProps}/>}
            {page==='all'        && <AllTasks     {...boardProps}/>}
            {page==='chat'       && <Chat messages={messages} members={members} user={user} onSend={sendMsg} onDelete={deleteMsg}/>}
            {page==='meetings'   && <Meetings meetings={meetings} user={user} onAdd={addMeeting} onDelete={deleteMeeting}/>}
            {page==='awards'     && <Awards tasks={tasks} members={members} user={user} onResetPoints={resetPoints}/>}
            {page==='whiteboard' && <Whiteboard notes={notes} onNoteSave={saveNote}/>}
            {page==='files'      && <FileStorage files={files} user={user} onUpload={uploadFile} onDelete={deleteFile} onShare={shareFile}/>}
            {page==='admin' && user.role==='admin' && (
              <AdminPanel
                members={members} tasks={tasks} messages={messages} projects={projects}
                onDeleteTask={deleteTask} onDeleteMsg={deleteMsg} onDeleteProject={deleteProject}
                onUpdateMember={updateMember} onAddProject={addProject}
              />
            )}
          </div>
        </div>
      </div>
    </TC.Provider>
  )
}

// ── Entry Point ───────────────────────────────────────────────────────────────
export default function FlowHub() {
  return <App />
}