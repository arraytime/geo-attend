import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, query, where, 
  onSnapshot, updateDoc, doc, serverTimestamp, 
  getDoc, setDoc 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken 
} from 'firebase/auth';
import { 
  MapPin, Smartphone, ShieldAlert, CheckCircle, 
  Navigation, User, FileSpreadsheet, 
  RefreshCw, LogOut, Lock, Unlock, X 
} from 'lucide-react';

// --- CSS STYLES (Standard CSS - No Tailwind needed) ---

import './index.css'

// --- Configuration ---
const OFFICE_LOCATION = {
  lat: 28.590121,
  lng: 77.442966,
  name: "Headquarters"
};
const GEOFENCE_RADIUS_METERS = 50;
const MAX_ACCURACY_THRESHOLD = 200;

// --- Firebase Setup ---
let firebaseConfig;

// 1. Try to detect if we are in the AI Editor (Local Preview)
if (typeof __firebase_config !== 'undefined') {
  firebaseConfig = JSON.parse(__firebase_config);
} else {
  // 2. Fallback for GitHub Pages / Production
  // -------------------------------------------------------------
  // 🚨 CRITICAL: PASTE YOUR FIREBASE KEYS BELOW BEFORE DEPLOYING
  // -------------------------------------------------------------
  firebaseConfig = {
    apiKey: "AIzaSyD4xIEYfN4sOzZ6trSUlOn893SFk-_Ewf4",
    authDomain: "attendance-app-19587.firebaseapp.com",
    projectId: "attendance-app-19587",
    storageBucket: "attendance-app-19587.firebasestorage.app",
    messagingSenderId: "336026010200",
    appId: "1:336026010200:web:eb865d4733df27c67d002d"
  };
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'geo-attend-v1';

// --- Utilities ---
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const getDeviceToken = () => {
  let token = localStorage.getItem('device_udt');
  if (!token) {
    token = generateUUID();
    localStorage.setItem('device_udt', token);
  }
  return token;
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
};

const exportToCSV = (data, filename) => {
  const csvContent = "data:text/csv;charset=utf-8," 
    + ["Timestamp,Name,Status,Distance,DeviceID,IsAuthorized"]
    .concat(data.map(row => 
      `${new Date(row.timestamp?.seconds * 1000).toLocaleString()},${row.userName},${row.status},${Math.round(row.distance)}m,${row.deviceId},${row.authorized}`
    )).join("\n");
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- Seed Data ---
const MOCK_EMPLOYEES = [
  { id: 'emp001', name: 'Alice Johnson', role: 'employee' },
  { id: 'emp002', name: 'Bob Smith', role: 'employee' },
  { id: 'emp003', name: 'Charlie Davis', role: 'employee' },
  { id: 'emp004', name: 'Dana Lee', role: 'employee' },
  { id: 'admin01', name: 'System Admin', role: 'admin' },
];

// --- Components ---

const LoadingScreen = () => (
  <div className="loading-screen">
    <RefreshCw className="spin" size={48} color="#2563eb" />
    <h2 style={{color: '#334155', marginTop: '20px'}}>Initializing System...</h2>
    <p style={{color: '#64748b'}}>Verifying Device Token & GPS</p>
  </div>
);

const LoginScreen = ({ onLogin }) => {
  return (
    <div className="login-container">
      <div className="login-card">
        <div className="icon-circle">
          <MapPin size={32} />
        </div>
        <h1 style={{fontSize: '24px', fontWeight: 'bold', margin: '0 0 8px 0'}}>GeoAttend</h1>
        <p style={{color: '#64748b', margin: 0}}>Secure Location-Based Attendance</p>

        <div className="user-select-list">
          <p style={{fontSize: '14px', fontWeight: '600', color: '#334155', textAlign: 'left'}}>Select User (Simulation):</p>
          {MOCK_EMPLOYEES.map(emp => (
            <button
              key={emp.id}
              onClick={() => onLogin(emp)}
              className="user-btn"
            >
              <div className="user-info">
                <div className={`user-avatar ${emp.role === 'admin' ? 'admin' : ''}`}>
                  {emp.role === 'admin' ? <Lock size={18} /> : <User size={18} />}
                </div>
                <div>
                  <div style={{fontWeight: '600', color: '#1e293b'}}>{emp.name}</div>
                  <div style={{fontSize: '11px', color: '#64748b', textTransform: 'uppercase'}}>{emp.role}</div>
                </div>
              </div>
              <Navigation size={16} color="#cbd5e1" />
            </button>
          ))}
        </div>
        
        <div style={{marginTop: '30px', fontSize: '11px', color: '#94a3b8'}}>
          Device ID: {getDeviceToken().substring(0, 8)}...
        </div>
      </div>
    </div>
  );
};

const EmployeeDashboard = ({ user, userData, deviceToken, onLogout }) => {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [distance, setDistance] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [todayLog, setTodayLog] = useState(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'attendance')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(d => d.data());
      const userLogs = logs.filter(log => log.userId === user.id);
      const startOfDay = new Date();
      startOfDay.setHours(0,0,0,0);
      const foundLog = userLogs.find(log => {
        if (!log.timestamp) return false;
        const logDate = new Date(log.timestamp.seconds * 1000);
        return logDate >= startOfDay;
      });
      setTodayLog(foundLog || null);
    }, (err) => console.error("Firestore Error:", err));
    return () => unsub();
  }, [user]);

  const refreshLocation = () => {
    setLoadingLoc(true);
    setError(null);
    if (!navigator.geolocation) {
      setError("Geolocation is not supported");
      setLoadingLoc(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy: acc } = position.coords;
        setLocation({ lat: latitude, lng: longitude });
        setAccuracy(acc);
        const dist = calculateDistance(latitude, longitude, OFFICE_LOCATION.lat, OFFICE_LOCATION.lng);
        setDistance(dist);
        setLoadingLoc(false);
      },
      (err) => {
        setError("Unable to retrieve location. Please enable GPS.");
        setLoadingLoc(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleCheckIn = async () => {
    if (!distance) return;
    setCheckingIn(true);
    let isAuthorized = true;
    if (userData?.registeredDevice && userData.registeredDevice !== deviceToken) {
      isAuthorized = false;
    }
    if (!userData?.registeredDevice) {
       await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.id), {
         registeredDevice: deviceToken,
         deviceModel: navigator.userAgent
       });
    }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'attendance'), {
        userId: user.id,
        userName: user.name,
        timestamp: serverTimestamp(),
        location: { lat: location.lat, lng: location.lng },
        distance: distance,
        accuracy: accuracy,
        deviceId: deviceToken,
        authorized: isAuthorized,
        status: isAuthorized ? (distance <= GEOFENCE_RADIUS_METERS ? 'Present' : 'Out of Bounds') : 'Blocked'
      });
    } catch (e) {
      console.error("Error logging attendance", e);
      setError("Failed to save attendance.");
    }
    setCheckingIn(false);
  };

  const isWithinFence = distance !== null && distance <= GEOFENCE_RADIUS_METERS;
  const isAccurate = accuracy !== null && accuracy <= MAX_ACCURACY_THRESHOLD;
  const deviceMismatch = userData?.registeredDevice && userData.registeredDevice !== deviceToken;

  return (
    <div className="app-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-top">
          <div>
            <h2 style={{fontSize: '24px', fontWeight: 'bold', margin: 0}}>Hello, {user.name.split(' ')[0]}</h2>
            <p style={{opacity: 0.8, fontSize: '14px', margin: 0}}>{new Date().toDateString()}</p>
          </div>
          <div style={{display: 'flex', gap: '8px'}}>
            <button className="icon-btn" title="Device Status"><Smartphone size={20} /></button>
            <button onClick={onLogout} className="icon-btn" title="Logout"><LogOut size={20} /></button>
          </div>
        </div>

        <div className="status-card">
          <div className="status-indicator">
            <div className={`dot ${todayLog ? 'green' : 'amber'}`} />
            <span>{todayLog ? `Checked In: ${todayLog.status}` : 'Not Checked In'}</span>
          </div>
          {todayLog && (
            <div style={{marginTop: '8px', fontSize: '12px', opacity: 0.75}}>
              Time: {new Date(todayLog.timestamp?.seconds * 1000).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      <div className="content-wrapper">
        {deviceMismatch && (
          <div className="alert-card">
            <ShieldAlert size={24} />
            <div>
              <h3 style={{fontSize: '14px', fontWeight: 'bold', margin: 0}}>Unauthorized Device</h3>
              <p style={{fontSize: '12px', margin: '4px 0 0'}}>Device ID mismatch. Attendance will be flagged.</p>
            </div>
          </div>
        )}

        <div className="card">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
            <h3 style={{fontWeight: '600', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px', margin: 0}}>
              <MapPin size={18} /> Location Status
            </h3>
            <button onClick={refreshLocation} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb'}}>
              <RefreshCw size={18} className={loadingLoc ? 'spin' : ''} />
            </button>
          </div>

          {error ? (
             <div className="badge error" style={{textAlign: 'center', padding: '12px'}}>{error}</div>
          ) : !location ? (
            <div style={{textAlign: 'center', color: '#94a3b8', fontStyle: 'italic'}}>Acquiring GPS...</div>
          ) : (
            <div>
              <div className="info-row">
                <span style={{fontSize: '14px', color: '#64748b'}}>Distance to Office</span>
                <span style={{fontSize: '20px', fontWeight: 'bold', color: isWithinFence ? '#16a34a' : '#f97316'}}>
                  {Math.round(distance)}m
                </span>
              </div>
              <div className="info-row">
                 <span style={{fontSize: '14px', color: '#64748b'}}>GPS Accuracy</span>
                 <span className={`badge ${isAccurate ? 'success' : 'error'}`}>
                   ±{Math.round(accuracy)}m {isAccurate ? '(Good)' : '(Poor)'}
                 </span>
              </div>
              {!isAccurate && (
                <p style={{fontSize: '12px', color: '#d97706', background: '#fffbeb', padding: '8px', borderRadius: '8px', marginTop: '12px'}}>
                  Weak signal. Move near a window.
                </p>
              )}
            </div>
          )}
        </div>

        {!todayLog && (
          <button
            onClick={handleCheckIn}
            disabled={!location || loadingLoc || checkingIn || !isAccurate}
            className={`main-btn ${(!location || !isAccurate) ? '' : isWithinFence ? 'btn-success' : 'btn-warning'}`}
          >
            {checkingIn ? (
              <RefreshCw className="spin" />
            ) : isWithinFence ? (
              <><CheckCircle /> CHECK IN NOW</>
            ) : (
              <><MapPin /> YOU ARE TOO FAR</>
            )}
          </button>
        )}
        
        {todayLog && (
          <div className="success-banner">
             <CheckCircle size={48} style={{marginBottom: '8px'}} />
             <h3 style={{margin: 0}}>Attendance Marked</h3>
             <p style={{margin: '4px 0 0', fontSize: '14px'}}>Have a productive day!</p>
          </div>
        )}

        <div style={{textAlign: 'center', fontSize: '11px', color: '#cbd5e1', marginTop: 'auto'}}>
           UDT: {deviceToken.substring(0,8)}... | v1.0.5
        </div>
      </div>
    </div>
  );
};

const AdminDashboard = ({ user, onLogout }) => {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [confirmResetId, setConfirmResetId] = useState(null);

  useEffect(() => {
    const qLogs = query(collection(db, 'artifacts', appId, 'public', 'data', 'attendance'));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      const fetchedLogs = snap.docs.map(d => ({id: d.id, ...d.data()}));
      fetchedLogs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setLogs(fetchedLogs);
    });

    const qUsers = query(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      setUsers(snap.docs.map(d => ({id: d.id, ...d.data()})));
    });

    return () => { unsubLogs(); unsubUsers(); };
  }, []);

  const handleResetDevice = async (userId) => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', userId), { registeredDevice: null });
      setConfirmResetId(null);
    } catch (err) { console.error("Reset failed:", err); }
  };

  return (
    <div style={{background: '#f1f5f9', minHeight: '100vh'}}>
      <nav className="admin-nav">
        <div style={{maxWidth: '1000px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <ShieldAlert color="#60a5fa" />
            <span style={{fontWeight: 'bold', fontSize: '18px'}}>Admin Console</span>
          </div>
          <div style={{display: 'flex', gap: '12px'}}>
            <button onClick={() => exportToCSV(logs, 'attendance.csv')} className="btn-small success">
              <FileSpreadsheet size={16} /> Export CSV
            </button>
            <button onClick={onLogout} style={{background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer'}}>
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </nav>

      <div className="admin-container">
        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card" style={{borderLeftColor: '#2563eb'}}>
            <div style={{fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase'}}>Today's Check-ins</div>
            <div style={{fontSize: '32px', fontWeight: 'bold', color: '#1e293b'}}>
              {logs.filter(l => new Date(l.timestamp?.seconds*1000).toDateString() === new Date().toDateString()).length}
            </div>
          </div>
          <div className="stat-card" style={{borderLeftColor: '#16a34a'}}>
             <div style={{fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase'}}>On Time & Authorized</div>
            <div style={{fontSize: '32px', fontWeight: 'bold', color: '#1e293b'}}>
              {logs.filter(l => l.authorized && l.status === 'Present').length}
            </div>
          </div>
           <div className="stat-card" style={{borderLeftColor: '#dc2626'}}>
             <div style={{fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase'}}>Flags / Blocked</div>
            <div style={{fontSize: '32px', fontWeight: 'bold', color: '#1e293b'}}>
              {logs.filter(l => !l.authorized || l.status === 'Blocked').length}
            </div>
          </div>
        </div>

        <div className="admin-layout">
          {/* Feed */}
          <div className="card" style={{padding: 0, overflow: 'hidden'}}>
            <div style={{padding: '16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0'}}>
              <h3 style={{margin: 0, fontSize: '16px'}}>Live Attendance Feed</h3>
            </div>
            <div className="logs-list">
              {logs.map((log) => (
                <div key={log.id} className="log-item">
                  <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                    <div className="user-avatar" style={{fontSize: '14px', fontWeight: 'bold'}}>
                      {log.userName.charAt(0)}
                    </div>
                    <div>
                      <div style={{fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px'}}>
                        {log.userName}
                        {!log.authorized && <span className="badge error">AUTH FAIL</span>}
                      </div>
                      <div style={{fontSize: '12px', color: '#64748b'}}>
                        {new Date(log.timestamp?.seconds * 1000).toLocaleString()} • {Math.round(log.distance)}m away
                      </div>
                    </div>
                  </div>
                  <span className={`badge ${log.status === 'Present' ? 'success' : 'warning'}`}>
                    {log.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Devices */}
          <div className="card" style={{height: 'fit-content'}}>
            <h3 style={{margin: '0 0 16px 0', fontSize: '16px'}}>Device Registry</h3>
            {users.filter(u => u.role !== 'admin').map(u => (
              <div key={u.id} className="device-item">
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                  <span style={{fontWeight: '600', fontSize: '14px'}}>{u.name}</span>
                  <span className={`badge ${u.registeredDevice ? 'success' : ''}`} style={{background: u.registeredDevice ? '#dbeafe' : '#f1f5f9', color: u.registeredDevice ? '#1d4ed8' : '#64748b'}}>
                    {u.registeredDevice ? 'Linked' : 'Pending'}
                  </span>
                </div>
                <div style={{fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace', wordBreak: 'break-all'}}>
                  {u.registeredDevice || "No device registered yet"}
                </div>
                {u.registeredDevice && (
                  <div className="reset-group">
                    {confirmResetId === u.id ? (
                      <>
                        <button onClick={() => handleResetDevice(u.id)} className="btn-small danger" style={{flex: 1}}>
                          <Unlock size={12} /> Confirm
                        </button>
                        <button onClick={() => setConfirmResetId(null)} className="btn-small">
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmResetId(u.id)} className="btn-small" style={{width: '100%'}}>
                        <Unlock size={12} /> Reset Lock
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      // Use environment token if available (for preview), else anonymous
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleLogin = async (mockUser) => {
    if (!user) return;
    setLoading(true);
    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', mockUser.id);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, { id: mockUser.id, name: mockUser.name, role: mockUser.role, registeredDevice: null });
      setUserData({ ...mockUser, registeredDevice: null });
    } else {
      setUserData(snap.data());
    }
    onSnapshot(userRef, (doc) => { if (doc.exists()) setUserData(doc.data()); });
    setCurrentUser(mockUser);
    setLoading(false);
  };

  const handleLogout = () => { setCurrentUser(null); setUserData(null); };

  return (
    <>
      <style>{styles}</style>
      {loading ? <LoadingScreen /> : !currentUser ? (
        <LoginScreen onLogin={handleLogin} />
      ) : currentUser.role === 'admin' ? (
        <AdminDashboard user={currentUser} onLogout={handleLogout} />
      ) : (
        <EmployeeDashboard user={currentUser} userData={userData} deviceToken={getDeviceToken()} onLogout={handleLogout} />
      )}
    </>
  );
}