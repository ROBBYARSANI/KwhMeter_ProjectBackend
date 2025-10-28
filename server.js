const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

let powerUsage = 2; // total akumulasi kWh

function getDummyData() {
  const voltage = parseFloat((Math.random() * 30 + 210).toFixed(1)); 
  const current = parseFloat((Math.random() * 10 + 1).toFixed(2));   
  const power = voltage * current;

  const consumed = parseFloat(((power * 2) / 3600000).toFixed(6));

  powerUsage += consumed;

  return {
    powerUsage: parseFloat(powerUsage.toFixed(5)), 
    voltage,
    current,
    power: parseFloat(power.toFixed(2)),
    consumed,
    timestamp: Date.now()
  };
}

app.get('/api/realtime', (req, res) => {
  res.json(getDummyData());
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on http://192.168.1.230:${PORT}`);
});
