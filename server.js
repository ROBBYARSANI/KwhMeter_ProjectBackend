const express = require('express');
const cors = require('cors');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, onValue, get } = require('firebase/database');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const firebaseConfig = {
  apiKey: "AIzaSyAKqzzlkxAM0Cld-vZzTTKKM2AehQ1d6aw",
  authDomain: "listrik-bc131.firebasestorage.app",
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

// Variabel untuk menyimpan data dan konfigurasi
let latestData = {
  powerUsage: 0,
  voltage: 0,
  current: 0,
  power: 0,
  consumed: 0,
  timestamp: Date.now()
};

let databaseStructure = null;

// Fungsi untuk mendeteksi struktur database
async function detectDatabaseStructure() {
  try {
    console.log('🔍 Mendeteksi struktur database...');
    const rootRef = ref(database, '/');
    const snapshot = await get(rootRef);
    
    if (snapshot.exists()) {
      const allData = snapshot.val();
      databaseStructure = allData;
      console.log('✅ Struktur database ditemukan:');
      console.log(JSON.stringify(allData, null, 2));
      
      // Cari path yang mungkin berisi data sensor
      const sensorPaths = findSensorPaths(allData);
      console.log('📍 Path sensor yang mungkin:', sensorPaths);
      
      return sensorPaths;
    } else {
      console.log('❌ Database kosong');
      return [];
    }
  } catch (error) {
    console.error('❌ Error mendeteksi struktur:', error);
    return [];
  }
}

// Fungsi untuk mencari path yang berisi data sensor
function findSensorPaths(data, currentPath = '') {
  const paths = [];
  
  // Cek jika objek saat ini memiliki field sensor
  if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data);
    
    // Jika ada field yang mencurigakan sebagai data sensor
    const sensorKeywords = ['voltage', 'current', 'power', 'energy', 'kwh', 'sensor', 'data', 'measurement'];
    const hasSensorData = keys.some(key => 
      sensorKeywords.some(keyword => 
        key.toLowerCase().includes(keyword)
      )
    );
    
    if (hasSensorData) {
      paths.push(currentPath || '/');
    }
    
    // Rekursif untuk nested objects
    for (const key of keys) {
      const newPath = currentPath ? `${currentPath}/${key}` : key;
      paths.push(...findSensorPaths(data[key], newPath));
    }
  }
  
  return paths;
}

// Fungsi untuk mengekstrak data dari berbagai struktur
function extractSensorData(rawData) {
  // Coba berbagai kemungkinan struktur data
  const extracted = {
    powerUsage: 0,
    voltage: 0,
    current: 0,
    power: 0,
    consumed: 0,
    timestamp: Date.now(),
    rawData: rawData // Simpan data mentah untuk debugging
  };
  
  if (!rawData) return extracted;
  
  // Mapping berbagai kemungkinan nama field
  const fieldMappings = {
    powerUsage: ['powerUsage', 'energy', 'kwh', 'totalEnergy', 'accumulated', 'usage'],
    voltage: ['voltage', 'tegangan', 'V', 'volts'],
    current: ['current', 'arus', 'I', 'ampere', 'amps'],
    power: ['power', 'daya', 'P', 'watt', 'powerNow'],
    consumed: ['consumed', 'energyUsed', 'usage', 'consumption'],
    timestamp: ['timestamp', 'time', 'lastUpdate', 'createdAt']
  };
  
  // Fungsi helper untuk mencari value berdasarkan berbagai kemungkinan key
  function findValue(obj, possibleKeys) {
    for (const key of possibleKeys) {
      if (obj && obj[key] !== undefined && obj[key] !== null) {
        return obj[key];
      }
    }
    return 0;
  }
  
  // Ekstrak values
  extracted.powerUsage = parseFloat(findValue(rawData, fieldMappings.powerUsage)) || 0;
  extracted.voltage = parseFloat(findValue(rawData, fieldMappings.voltage)) || 0;
  extracted.current = parseFloat(findValue(rawData, fieldMappings.current)) || 0;
  extracted.power = parseFloat(findValue(rawData, fieldMappings.power)) || 0;
  extracted.consumed = parseFloat(findValue(rawData, fieldMappings.consumed)) || 0;
  
  const timestampValue = findValue(rawData, fieldMappings.timestamp);
  if (timestampValue) {
    extracted.timestamp = typeof timestampValue === 'number' ? timestampValue : Date.parse(timestampValue) || Date.now();
  }
  
  // Jika power tidak ada, hitung dari voltage dan current
  if (extracted.power === 0 && extracted.voltage > 0 && extracted.current > 0) {
    extracted.power = parseFloat((extracted.voltage * extracted.current).toFixed(2));
  }
  
  return extracted;
}

// Setup listener untuk data realtime
async function setupRealtimeListener() {
  const sensorPaths = await detectDatabaseStructure();
  
  if (sensorPaths.length > 0) {
    // Gunakan path pertama yang ditemukan
    const primaryPath = sensorPaths[0];
    console.log(`🎯 Menggunakan path: ${primaryPath}`);
    
    const dataRef = ref(database, primaryPath);
    
    onValue(dataRef, (snapshot) => {
      const rawData = snapshot.val();
      if (rawData) {
        latestData = extractSensorData(rawData);
        console.log('📊 Data terupdate:', {
          powerUsage: latestData.powerUsage,
          voltage: latestData.voltage,
          current: latestData.current,
          power: latestData.power
        });
      }
    }, (error) => {
      console.error('❌ Error realtime listener:', error);
    });
    
    return primaryPath;
  } else {
    console.log('⚠️ Tidak ada path sensor yang terdeteksi, menggunakan data default');
    return null;
  }
}

// Endpoints
app.get('/api/realtime', (req, res) => {
  res.json(latestData);
});

app.get('/api/debug/structure', async (req, res) => {
  try {
    const rootRef = ref(database, '/');
    const snapshot = await get(rootRef);
    
    if (snapshot.exists()) {
      const allData = snapshot.val();
      const sensorPaths = findSensorPaths(allData);
      
      res.json({
        success: true,
        fullStructure: allData,
        detectedSensorPaths: sensorPaths,
        currentData: latestData,
        message: 'Check server console for detailed structure'
      });
    } else {
      res.json({ 
        success: false, 
        message: 'Database is empty or inaccessible' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    firebaseConnected: !!database,
    currentData: {
      timestamp: new Date(latestData.timestamp).toISOString(),
      hasData: latestData.voltage > 0 || latestData.current > 0
    }
  });
});

// Initialize server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Backend server running on http://192.168.1.230:${PORT}`);
  console.log('📡 Connecting to Firebase...');
  
  await setupRealtimeListener();
  
  console.log('\n📍 Endpoints:');
  console.log(`   Realtime Data: http://192.168.1.230:${PORT}/api/realtime`);
  console.log(`   Debug Structure: http://192.168.1.230:${PORT}/api/debug/structure`);
  console.log(`   Health Check: http://192.168.1.230:${PORT}/api/health`);
});