import React, { useState, useEffect, useRef } from 'react';
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
  Navigation, User, Users, FileSpreadsheet, 
  RefreshCw, LogOut, Lock, Unlock, X 
} from 'lucide-react';

// --- Configuration ---
const OFFICE_LOCATION = {
  lat: 28.590121,
  lng: 77.442966,
  name: "Headquarters"
};
const GEOFENCE_RADIUS_METERS = 50;
const MAX_ACCURACY_THRESHOLD = 200; // Meters (reject if GPS is too fuzzy)

// --- Firebase Setup ---
// Uses the environment's built-in config for the preview to work.
// If you export to GitHub later, you will replace this block with your own keys.
// Paste YOUR config from Firebase Console here
const firebaseConfig = {
  apiKey: "AIzaSyD4xIEYfN4sOzZ6trSUlOn893SFk-_Ewf4",
  authDomain: "attendance-app-19587.firebaseapp.com",
  projectId: "attendance-app-19587",
  storageBucket: "attendance-app-19587.firebasestorage.app",
  messagingSenderId: "336026010200",
  appId: "1:336026010200:web:eb865d4733df27c67d002d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "geo-attend-v1"; // You can just name this string whatever you want

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

// Haversine Formula for distance
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

  return R * c; // in metres
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
  <div className="flex items-center justify-center h-screen bg-slate-50">
    <div className="text-center">
      <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-slate-700">Initializing System...</h2>
      <p className="text-slate-500 text-sm">Verifying Device Token & GPS</p>
    </div>
  </div>
);

const LoginScreen = ({ onLogin }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <MapPin className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">GeoAttend</h1>
          <p className="text-slate-500">Secure Location-Based Attendance</p>
        </div>

        <div className="space-y-4">
          <p className="text-sm font-medium text-slate-700">Select User (Simulation):</p>
          {MOCK_EMPLOYEES.map(emp => (
            <button
              key={emp.id}
              onClick={() => onLogin(emp)}
              className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all hover:shadow-md ${
                emp.role === 'admin' 
                  ? 'bg-slate-50 border-slate-200 hover:border-slate-400' 
                  : 'bg-white border-slate-200 hover:border-blue-400'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  emp.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  {emp.role === 'admin' ? <Lock size={18} /> : <User size={18} />}
                </div>
                <div className="text-left">
                  <div className="font-semibold text-slate-800">{emp.name}</div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">{emp.role}</div>
                </div>
              </div>
              <Navigation className="text-slate-300" size={16} />
            </button>
          ))}
        </div>
        
        <div className="mt-8 text-center text-xs text-slate-400">
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

  // Firestore listeners
  useEffect(() => {
    if (!user) return;
    
    // STRICT MODE: Fetch all to avoid Index/Permission errors with 'where' clauses
    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'attendance')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(d => d.data());
      
      // Client-side filtering
      const userLogs = logs.filter(log => log.userId === user.id);
      
      const startOfDay = new Date();
      startOfDay.setHours(0,0,0,0);
      
      const foundLog = userLogs.find(log => {
        if (!log.timestamp) return false;
        const logDate = new Date(log.timestamp.seconds * 1000);
        return logDate >= startOfDay;
      });

      setTodayLog(foundLog || null);
    }, (error) => {
      console.error("Firestore Listen Error:", error);
    });

    return () => unsub();
  }, [user]);

  const refreshLocation = () => {
    setLoadingLoc(true);
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      setLoadingLoc(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy: acc } = position.coords;
        setLocation({ lat: latitude, lng: longitude });
        setAccuracy(acc);
        
        const dist = calculateDistance(
          latitude, 
          longitude, 
          OFFICE_LOCATION.lat, 
          OFFICE_LOCATION.lng
        );
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

    // Device Authorization Check
    let isAuthorized = true;
    let authMessage = "Authorized Device";

    // If user has a registered device and it doesn't match current
    if (userData?.registeredDevice && userData.registeredDevice !== deviceToken) {
      isAuthorized = false;
      authMessage = "Unauthorized Device Mismatch";
    }

    // If user has NO registered device, we register this one now (Day 1 logic)
    if (!userData?.registeredDevice) {
       await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.id), {
         registeredDevice: deviceToken,
         deviceModel: navigator.userAgent
       });
    }

    if (!isAuthorized) {
      // Intentionally not using alert here to keep flow smooth, status will update
      console.warn("Unauthorized check-in attempt");
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

  // Status Logic
  const isWithinFence = distance !== null && distance <= GEOFENCE_RADIUS_METERS;
  const isAccurate = accuracy !== null && accuracy <= MAX_ACCURACY_THRESHOLD;
  const deviceMismatch = userData?.registeredDevice && userData.registeredDevice !== deviceToken;

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen pb-20">
      {/* Header */}
      <div className="bg-blue-600 p-6 rounded-b-3xl shadow-lg text-white">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold">Hello, {user.name.split(' ')[0]}</h2>
            <p className="opacity-80 text-sm">{new Date().toDateString()}</p>
          </div>
          <div className="flex gap-2">
            <div className="bg-blue-500 p-2 rounded-lg" title="Device Status">
              <Smartphone size={20} />
            </div>
            <button 
              onClick={onLogout} 
              className="bg-blue-500 hover:bg-blue-400 p-2 rounded-lg transition-colors text-white" 
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>

        {/* Status Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${todayLog ? 'bg-green-400' : 'bg-amber-400'}`} />
            <span className="font-medium">
              {todayLog ? `Checked In: ${todayLog.status}` : 'Not Checked In'}
            </span>
          </div>
          {todayLog && (
            <div className="mt-2 text-xs opacity-75">
              Time: {new Date(todayLog.timestamp?.seconds * 1000).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        
        {/* Device Alert */}
        {deviceMismatch && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 items-start">
            <ShieldAlert className="text-red-600 shrink-0" />
            <div>
              <h3 className="font-bold text-red-700 text-sm">Unauthorized Device</h3>
              <p className="text-red-600 text-xs mt-1">
                This device ID does not match your registered device. Attendance will be flagged for Admin review.
              </p>
            </div>
          </div>
        )}

        {/* Location Card */}
        <div className="bg-white rounded-2xl shadow-sm p-5 border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-700 flex items-center gap-2">
              <MapPin size={18} /> Location Status
            </h3>
            <button 
              onClick={refreshLocation} 
              className="text-blue-600 hover:bg-blue-50 p-2 rounded-full transition-colors"
            >
              <RefreshCw size={18} className={loadingLoc ? 'animate-spin' : ''} />
            </button>
          </div>

          {error ? (
             <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</div>
          ) : !location ? (
            <div className="text-slate-400 text-sm italic">Acquiring GPS...</div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-end border-b pb-3 border-slate-100">
                <span className="text-slate-500 text-sm">Distance to Office</span>
                <span className={`text-2xl font-bold ${isWithinFence ? 'text-green-600' : 'text-orange-500'}`}>
                  {Math.round(distance)}m
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                 <span className="text-slate-500 text-xs">GPS Accuracy</span>
                 <span className={`text-xs font-medium px-2 py-1 rounded ${isAccurate ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                   ±{Math.round(accuracy)}m {isAccurate ? ' (Good)' : '(Poor)'}
                 </span>
              </div>

              {!isAccurate && (
                <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
                  GPS signal is weak. Try moving near a window or enabling WiFi.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Action Button */}
        {!todayLog && (
          <button
            onClick={handleCheckIn}
            disabled={!location || loadingLoc || checkingIn || !isAccurate}
            className={`w-full py-4 rounded-xl text-lg font-bold shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2
              ${!location || !isAccurate 
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                : isWithinFence 
                  ? 'bg-green-600 text-white hover:bg-green-700 shadow-green-200'
                  : 'bg-orange-500 text-white hover:bg-orange-600 shadow-orange-200'
              }
            `}
          >
            {checkingIn ? (
              <RefreshCw className="animate-spin" />
            ) : isWithinFence ? (
              <><CheckCircle /> CHECK IN NOW</>
            ) : (
              <><MapPin /> YOU ARE TOO FAR</>
            )}
          </button>
        )}
        
        {todayLog && (
          <div className="text-center p-6 bg-green-50 rounded-xl border border-green-200">
             <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-2" />
             <h3 className="text-green-800 font-bold">Attendance Marked</h3>
             <p className="text-green-600 text-sm">Have a productive day!</p>
          </div>
        )}

        <div className="text-center text-xs text-slate-400 mt-8">
           UDT: {deviceToken.substring(0,8)}... | v1.0.4
        </div>
      </div>
    </div>
  );
};

const AdminDashboard = ({ user, onLogout }) => {
  const [logs, setLogs] = useState([]);
  const [pendingDevices, setPendingDevices] = useState([]);
  const [users, setUsers] = useState([]);
  const [confirmResetId, setConfirmResetId] = useState(null);

  useEffect(() => {
    // 1. Fetch Logs
    const qLogs = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'attendance')
    );
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      const fetchedLogs = snap.docs.map(d => ({id: d.id, ...d.data()}));
      // Sort in JS, handle potentially missing seconds during writes
      fetchedLogs.sort((a, b) => {
        const timeA = a.timestamp?.seconds || 0;
        const timeB = b.timestamp?.seconds || 0;
        return timeB - timeA;
      });
      setLogs(fetchedLogs);
    }, (error) => {
      console.error("Admin Logs Error:", error);
    });

    // 2. Fetch Users for Device Management
    const qUsers = query(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      const userData = snap.docs.map(d => ({id: d.id, ...d.data()}));
      setUsers(userData);
    }, (error) => {
      console.error("Admin Users Error:", error);
    });

    return () => {
      unsubLogs();
      unsubUsers();
    };
  }, []);

  const handleResetDevice = async (userId) => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', userId), {
        registeredDevice: null
      });
      setConfirmResetId(null);
    } catch (err) {
      console.error("Failed to reset device:", err);
    }
  };

  const handleExport = () => {
    exportToCSV(logs, `Attendance_Export_${new Date().toISOString().split('T')[0]}.csv`);
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Admin Nav */}
      <nav className="bg-slate-900 text-white p-4 shadow-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ShieldAlert className="text-blue-400" />
            <h1 className="font-bold text-lg">Admin Console</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-xs px-4 py-2 rounded flex items-center gap-2">
              <FileSpreadsheet size={16} /> Sync / Export CSV
            </button>
            <button 
              onClick={onLogout} 
              className="text-slate-300 hover:text-white p-2 hover:bg-slate-800 rounded-full transition-colors"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto p-6 space-y-8">
        
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
            <div className="text-slate-500 text-sm font-medium uppercase">Today's Check-ins</div>
            <div className="text-3xl font-bold text-slate-800">
              {logs.filter(l => new Date(l.timestamp?.seconds*1000).toDateString() === new Date().toDateString()).length}
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
             <div className="text-slate-500 text-sm font-medium uppercase">On Time & Authorized</div>
            <div className="text-3xl font-bold text-slate-800">
              {logs.filter(l => l.authorized && l.status === 'Present').length}
            </div>
          </div>
           <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500">
             <div className="text-slate-500 text-sm font-medium uppercase">Flags / Blocked</div>
            <div className="text-3xl font-bold text-slate-800">
              {logs.filter(l => !l.authorized || l.status === 'Blocked').length}
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Recent Activity Feed */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-700">Live Attendance Feed</h3>
              <span className="text-xs text-slate-400">Real-time updates</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {logs.length === 0 && <div className="p-8 text-center text-slate-400">No records found.</div>}
              {logs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${log.authorized ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                      {log.userName.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium text-slate-800 flex items-center gap-2">
                        {log.userName}
                        {!log.authorized && <span className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded border border-red-200">AUTH FAIL</span>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(log.timestamp?.seconds * 1000).toLocaleString()} • {Math.round(log.distance)}m away
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                      log.status === 'Present' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {log.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Device Management */}
          <div className="bg-white rounded-xl shadow-sm h-fit">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-700">Device Registry</h3>
            </div>
            <div className="p-4 space-y-4">
              {users.filter(u => u.role !== 'admin').map(u => (
                <div key={u.id} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium text-sm text-slate-700">{u.name}</span>
                    {u.registeredDevice ? (
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100">Linked</span>
                    ) : (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">Pending</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono break-all mb-3">
                    {u.registeredDevice || "No device registered yet"}
                  </div>
                  {u.registeredDevice && (
                    <div className="mt-2">
                      {confirmResetId === u.id ? (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleResetDevice(u.id)}
                            className="flex-1 text-xs bg-red-600 text-white hover:bg-red-700 transition-colors py-2 rounded flex items-center justify-center gap-1"
                          >
                            <Unlock size={12} /> Confirm
                          </button>
                          <button 
                            onClick={() => setConfirmResetId(null)}
                            className="w-8 text-xs bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors py-2 rounded flex items-center justify-center"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setConfirmResetId(u.id)}
                          className="w-full text-xs bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors py-2 rounded text-slate-600 flex items-center justify-center gap-2"
                        >
                          <Unlock size={12} /> Reset Device Lock
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
    </div>
  );
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [user, setUser] = useState(null); // Firebase Auth User
  const [loading, setLoading] = useState(true);

  // 1. Initialize Firebase Auth
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch/Create User Profile in Firestore upon Mock Login
  const handleLogin = async (mockUser) => {
    if (!user) return;
    setLoading(true);

    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', mockUser.id);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      // First time user setup in DB
      await setDoc(userRef, {
        id: mockUser.id,
        name: mockUser.name,
        role: mockUser.role,
        registeredDevice: null // Will be set on first check-in
      });
      setUserData({ ...mockUser, registeredDevice: null });
    } else {
      setUserData(snap.data());
    }

    // Subscribe to user data changes (for real-time device approval updates)
    onSnapshot(userRef, (doc) => {
      if (doc.exists()) setUserData(doc.data());
    });

    setCurrentUser(mockUser);
    setLoading(false);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setUserData(null);
  };

  if (loading) return <LoadingScreen />;

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="font-sans text-slate-800">
      {currentUser.role === 'admin' ? (
        <AdminDashboard user={currentUser} onLogout={handleLogout} />
      ) : (
        <EmployeeDashboard 
          user={currentUser} 
          userData={userData}
          deviceToken={getDeviceToken()} 
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}