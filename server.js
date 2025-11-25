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

// Variabel untuk kalkulasi powerUsage
let cumulativePowerUsageKWh = 0; // dalam kWh
let lastUpdateTime = Date.now();
let lastResetDate = new Date().getDate(); // Tanggal terakhir reset
let isFirstData = true; // Flag untuk data pertama

// Data structure sesuai dengan database
let latestData = {
  powerUsage: 0, // dalam kWh
  voltage: 0,
  current: 0,
  power: 0,
  consumed: 0, // dalam Watt (P = V × I)
  relayState: false,
  timestamp: "",
  serverTimestamp: Date.now()
};

// Fungsi untuk cek dan reset daily powerUsage
function checkAndResetDaily() {
  const now = new Date();
  const currentDate = now.getDate();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  // Reset jika sudah lewat 23:59 dan tanggal berubah
  if (currentDate !== lastResetDate && currentHour === 0 && currentMinute === 0) {
    cumulativePowerUsageKWh = 0;
    lastUpdateTime = Date.now();
    lastResetDate = currentDate;
    console.log('🔄 PowerUsage direset ke 0 untuk hari baru');
  }
}

// Fungsi untuk menghitung energi dari daya over time
function calculateEnergyConsumption(powerWatts, timeElapsedHours) {
  // Energy (kWh) = Power (kW) × Time (hours)
  // Atau: Energy (kWh) = [Power (Watts) × Time (hours)] / 1000
  return (powerWatts * timeElapsedHours) / 1000;
}

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
    
    // Cek dan reset powerUsage daily
    checkAndResetDaily();
    
    // Map data langsung dari struktur Firebase
    const voltage = parseFloat(rawData.voltage || rawData.Voltage || 0);
    const current = parseFloat(rawData.current || rawData.Current || 0);
    
    // Hitung consumed (daya sesaat) dalam Watt: P = V × I
    const consumedWatts = voltage * current;
    
    // Hitung powerUsage kumulatif (dalam kWh)
    const currentTime = Date.now();
    const timeElapsedHours = (currentTime - lastUpdateTime) / (1000 * 60 * 60); // dalam jam
    
    if (!isFirstData && timeElapsedHours > 0 && consumedWatts > 0) {
      // Hitung energi yang dikonsumsi sejak update terakhir
      const energyConsumedKWh = calculateEnergyConsumption(consumedWatts, timeElapsedHours);
      cumulativePowerUsageKWh += energyConsumedKWh;
      
      console.log(`⏱️  Waktu berlalu: ${timeElapsedHours.toFixed(6)} jam`);
      console.log(`⚡ Energi dikonsumsi: ${energyConsumedKWh.toFixed(6)} kWh`);
      console.log(`📈 PowerUsage total: ${cumulativePowerUsageKWh.toFixed(6)} kWh`);
    } else if (isFirstData) {
      console.log(`🔰 Data pertama: PowerUsage diinisialisasi`);
      isFirstData = false;
    }
    
    // Update waktu terakhir
    lastUpdateTime = currentTime;
    
    // DEBUG: Log semua field yang tersedia untuk memastikan powerUsage ada
    console.log('🔍 Field yang tersedia:', Object.keys(rawData));
    
    // Map data langsung dari struktur Firebase
    latestData = {
      powerUsage: cumulativePowerUsageKWh, // dalam kWh
      voltage: voltage,
      current: current,
      power: parseFloat(rawData.power || rawData.Power || 0),
      consumed: consumedWatts, // dalam Watt
      relayState: Boolean(rawData.relayState || rawData.relaystate || rawData.RelayState || false),
      timestamp: rawData.timestamp || rawData.Timestamp || rawData.time || "",
      serverTimestamp: currentTime,
      rawData: rawData // Untuk debugging
    };
    
    console.log('✅ Data terupdate:', {
      powerUsage: `${latestData.powerUsage.toFixed(6)} kWh`,
      voltage: `${latestData.voltage} V`,
      current: `${latestData.current} A`,
      consumed: `${latestData.consumed.toFixed(2)} W`,
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
    fullTimestamp: convertTimeToTimestamp(latestData.timestamp),
    powerUsageKWh: latestData.powerUsage, // dalam kWh
    consumedWatts: latestData.consumed // dalam Watt
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

// Endpoint untuk reset manual powerUsage
app.post('/api/reset-power', (req, res) => {
  cumulativePowerUsageKWh = 0;
  lastUpdateTime = Date.now();
  lastResetDate = new Date().getDate();
  isFirstData = true;
  console.log('🔄 PowerUsage direset manual ke 0');
  res.json({ 
    success: true, 
    message: 'PowerUsage reset to 0', 
    powerUsage: 0
  });
});

// Endpoint untuk melihat info powerUsage
app.get('/api/power-info', (req, res) => {
  res.json({
    cumulativePowerUsageKWh: cumulativePowerUsageKWh,
    lastUpdateTime: new Date(lastUpdateTime).toISOString(),
    lastResetDate: lastResetDate,
    nextReset: '23:59 daily',
    calculationMethod: 'Energy = V × I × time (converted to kWh)'
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'connected',
    firebase: 'connected',
    lastUpdate: new Date(latestData.serverTimestamp).toISOString(),
    dataAge: Date.now() - latestData.serverTimestamp,
    relayState: latestData.relayState,
    powerUsageKWh: latestData.powerUsage,
    currentConsumedWatts: latestData.consumed,
    voltage: latestData.voltage,
    current: latestData.current
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
      currentData: latestData,
      powerCalculation: {
        cumulativePowerUsageKWh: cumulativePowerUsageKWh,
        lastUpdateTime: lastUpdateTime,
        lastResetDate: lastResetDate,
        isFirstData: isFirstData,
        calculation: `Energy (kWh) = V × I × time`
      }
    });
  }, { onlyOnce: true }); // Hanya baca sekali
});

// Setup interval untuk cek reset harian (setiap menit)
setInterval(checkAndResetDaily, 60000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend server running on http://192.168.1.230:${PORT}`);
  console.log('📊 Monitoring data dari: monitoring/current');
  console.log('⚡ Consumed = V × I (Watt)');
  console.log('📈 PowerUsage = Akumulasi energi (kWh)');
  console.log('🔄 Reset otomatis setiap hari pukul 23:59');
  console.log('\n📍 Endpoints:');
  console.log(`   Realtime Data: http://192.168.1.230:${PORT}/api/realtime`);
  console.log(`   Status: http://192.168.1.230:${PORT}/api/status`);
  console.log(`   Power Info: http://192.168.1.230:${PORT}/api/power-info`);
  console.log(`   Relay Control: http://192.168.1.230:${PORT}/api/relay/on atau /api/relay/off`);
  console.log(`   Reset Power: http://192.168.1.230:${PORT}/api/reset-power`);
  console.log(`   Debug: http://192.168.1.230:${PORT}/api/debug`);
});