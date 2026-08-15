const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const sqlite3 = require('sqlite3').verbose();

// --- CONFIGURATION ---
// Change this to the actual COM port your Gateway ESP32 is plugged into (e.g., 'COM3', 'COM5', '/dev/ttyUSB0')
const GATEWAY_COM_PORT = 'COM7'; 
const BAUD_RATE = 115200;

// --- DATABASE SETUP ---
const db = new sqlite3.Database('./tingog_local.db', (err) => {
    if (err) console.error('Database opening error: ', err);
    else console.log('Connected to SQLite database.');
});

// Create tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT,
        seq_num INTEGER,
        msg_type INTEGER,
        button_code INTEGER,
        press_type TEXT,
        battery_pct INTEGER,
        parsed_needs TEXT,
        received_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// --- EXPRESS & SOCKET.IO SETUP ---
const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
    console.log('Frontend connected:', socket.id);
});

// --- SERIAL PORT SETUP (USB) ---
const port = new SerialPort({ path: GATEWAY_COM_PORT, baudRate: BAUD_RATE }, function (err) {
  if (err) {
    return console.log(`\n[!] Error: Could not open serial port ${GATEWAY_COM_PORT}. Make sure your Gateway ESP32 is plugged in and you set the correct COM port!\n`, err.message);
  }
});

const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

parser.on('data', (data) => {
    try {
        // We expect the Gateway ESP32 to send JSON strings like: {"device_id":"DEV-001", "button_code": 1, ...}
        if (!data.startsWith('{')) return; // Ignore debug messages

        const payload = JSON.parse(data);
        console.log('Received payload from Gateway USB:', payload);

        // Map button_code to need_types based on bitmask
        const needs = [];
        if (payload.button_code & (1 << 0)) needs.push('TABANG');
        if (payload.button_code & (1 << 1)) needs.push('TUBIG');
        if (payload.button_code & (1 << 2)) needs.push('TAMBAL');
        if (payload.button_code & (1 << 3)) needs.push('PAGKAON');
        if (payload.button_code & (1 << 4)) needs.push('LUWAS');

        const needsString = JSON.stringify(needs);

        // 1. Save to SQLite Database
        db.run(`INSERT INTO events (device_id, seq_num, msg_type, button_code, press_type, battery_pct, parsed_needs) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [payload.device_id, payload.seq_num, payload.msg_type, payload.button_code, payload.press_type, payload.battery_pct, needsString],
            function(err) {
                if (err) {
                    console.error('Error inserting into database:', err.message);
                } else {
                    console.log(`Saved event ${this.lastID} to database.`);
                }
            }
        );

        // 2. Broadcast to React Frontend
        const enrichedPayload = { ...payload, parsed_needs: needs };
        io.emit('purok-update', enrichedPayload);

    } catch (err) {
        console.error('Error parsing Serial data:', err.message);
    }
});

// Start Server
const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend server running on port ${PORT}`);
    console.log(`Listening for Gateway ESP32 on ${GATEWAY_COM_PORT} at ${BAUD_RATE} baud...`);
});
