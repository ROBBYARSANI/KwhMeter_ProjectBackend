const express = require('express');
const cors = require('cors');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, onValue, set } = require('firebase/database');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAKqzzlkxAM0Cld-vZzTTKKM2AehQ1d6aw",
  authDomain: "listrik-bc131.firebaseapp.com",
  databaseURL: "https://listrik-bc131-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "listrik-bc131",
  storageBucket: "listrik-bc131.firebasestorage.app",
  messagingSenderId: "805499906429",
  appId: "1:805499906429:web:4d3a203f40927b54974414",
  measurementId: "G-1JP1GCXJSW"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);

// Data structure sesuai dengan database
let latestData = {
  powerUsage: 0,
  voltage: 0,
  current: 0,
  power: 0,
  consumed: 0,
  relayState: false,
  timestamp: "",
  serverTimestamp: Date.now()
};

// Fungsi untuk mengkonversi time string "HH:mm:ss" ke timestamp lengkap
function convertTimeToTimestamp(timeStr) {
  if (!timeStr) return Date.now();
  
  try {
    const today = new Date();
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
    
    // Set waktu sesuai dengan data
    today.setHours(hours, minutes, seconds, 0);
    
    return today.getTime();
  } catch (error) {
    console.error('Error converting time:', error);
    return Date.now();
  }
}

// Path yang tepat berdasarkan struktur database
const dataRef = ref(database, 'monitoring/current');

// Setup realtime listener
onValue(dataRef, (snapshot) => {
  const rawData = snapshot.val();
  if (rawData) {
    console.log('📊 Data diterima dari Firebase:', rawData);
    
    // DEBUG: Log semua field yang tersedia untuk memastikan powerUsage ada
    console.log('🔍 Field yang tersedia:', Object.keys(rawData));
    
    // Map data langsung dari struktur Firebase
    // Pastikan nama field sesuai dengan yang ada di Firebase
    latestData = {
      powerUsage: parseFloat(rawData.powerUsage || rawData.PowerUsage || rawData.power_usage || 0),
      voltage: parseFloat(rawData.voltage || rawData.Voltage || 0),
      current: parseFloat(rawData.current || rawData.Current || 0),
      power: parseFloat(rawData.power || rawData.Power || 0),
      consumed: parseFloat(rawData.consumed || rawData.Consumed || 0),
      relayState: Boolean(rawData.relayState || rawData.relaystate || rawData.RelayState || false),
      timestamp: rawData.timestamp || rawData.Timestamp || rawData.time || "",
      serverTimestamp: Date.now(),
      rawData: rawData // Untuk debugging
    };
    
    console.log('✅ Data terupdate:', {
      powerUsage: latestData.powerUsage,
      voltage: latestData.voltage,
      current: latestData.current,
      power: latestData.power,
      consumed: latestData.consumed,
      relayState: latestData.relayState,
      timestamp: latestData.timestamp
    });
  }
}, (error) => {
  console.error('❌ Error membaca data dari Firebase:', error);
});

// Endpoints
app.get('/api/realtime', (req, res) => {
  // Tambahkan timestamp yang sudah dikonversi ke response
  const responseData = {
    ...latestData,
    fullTimestamp: convertTimeToTimestamp(latestData.timestamp)
  };
  res.json(responseData);
});

app.get('/api/relay/:state', async (req, res) => {
  const state = req.params.state;
  try {
    const relayRef = ref(database, 'monitoring/current/relayState');
    
    if (state === 'on') {
      await set(relayRef, true);
      res.json({ success: true, message: 'Relay turned ON', relayState: true });
    } else if (state === 'off') {
      await set(relayRef, false);
      res.json({ success: true, message: 'Relay turned OFF', relayState: false });
    } else {
      res.status(400).json({ success: false, message: 'Invalid state. Use "on" or "off"' });
    }
  } catch (error) {
    console.error('Error controlling relay:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/switch', async (req, res) => {
  const { state } = req.body;
  if (typeof state !== 'boolean') {
    return res.status(400).json({ success: false, message: 'State must be a boolean' });
  }
  try {
    const relayRef = ref(database, 'monitoring/current/relayState');
    await set(relayRef, state);
    res.json({ success: true, message: `Relay turned ${state ? 'ON' : 'OFF'}`, relayState: state });
  } catch (error) {
    console.error('Error controlling relay:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'connected',
    firebase: 'connected',
    lastUpdate: new Date(latestData.serverTimestamp).toISOString(),
    dataAge: Date.now() - latestData.serverTimestamp,
    relayState: latestData.relayState,
    powerUsage: latestData.powerUsage
  });
});

// Endpoint khusus untuk debug struktur data Firebase
app.get('/api/debug', (req, res) => {
  const debugRef = ref(database, 'monitoring');
  onValue(debugRef, (snapshot) => {
    const allData = snapshot.val();
    res.json({
      message: 'Struktur data lengkap dari Firebase',
      data: allData,
      currentData: latestData
    });
  }, { onlyOnce: true }); // Hanya baca sekali
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend server running on http://192.168.1.230:${PORT}`);
  console.log('📊 Monitoring data dari: monitoring/current');
  console.log('\n📍 Endpoints:');
  console.log(`   Realtime Data: http://192.168.1.230:${PORT}/api/realtime`);
  console.log(`   Status: http://192.168.1.230:${PORT}/api/status`);
  console.log(`   Relay Control: http://192.168.1.230:${PORT}/api/relay/on atau /api/relay/off`);
  console.log(`   Debug: http://192.168.1.230:${PORT}/api/debug`);
});