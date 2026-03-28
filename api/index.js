const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- 🛡️ DATABASE HELPERS ---
async function loadDB() {
    const { data, error } = await supabase.from('auction_db').select('state').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data ? data.state : { tournamentData: { status: "Setup", teams: [] }, matches: [], soldPlayers: {}, liveAuction: { currentBid: 0 } };
}

async function saveDB(newState) {
    const { error } = await supabase.from('auction_db').update({ state: newState }).eq('id', 1);
    if (error) throw error;
}

// --- 🕵️‍♂️ LOBBY/TEST ---
app.get('/api/test', (req, res) => res.json({ status: "Lappu is Online!", time: new Date().toISOString() }));

app.get('/api/check-db', async (req, res) => {
    try {
        const { data, error } = await supabase.from('auction_db').select('*').limit(1);
        if (error) return res.json({ success: false, error: error.message, hint: error.hint });
        res.json({ success: true, message: "Database is reachable!", data });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// --- 🛡️ ADMIN AUTH ---
app.post('/api/admin/login', (req, res) => {
    if (req.body.email === "admin@jdvilla.com" && req.body.password === "Lappu2026") return res.json({ success: true });
    res.status(401).json({ success: false });
});

// --- 🏆 TOURNAMENT SETUP ---
app.get('/api/tournament/data', async (req, res) => {
    try {
        const db = await loadDB();
        res.json({ ...db.tournamentData, matches: db.matches || [] });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tournament/save', async (req, res) => {
    try {
        const db = await loadDB();
        db.tournamentData = { ...db.tournamentData, ...req.body, status: "Phase_1_Secret" };
        await saveDB(db);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 🔨 LIVE AUCTION LOGIC ---
app.get('/api/live/state', async (req, res) => {
    try {
        const db = await loadDB();
        res.json(db.liveAuction || { activePlayer: null, currentBid: 0 });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/live/bid', async (req, res) => {
    try {
        const { email, teamName, amount } = req.body;
        const db = await loadDB();
        
        const myCount = Object.values(db.soldPlayers).filter(p => p.email === email).length;
        if (myCount >= (db.tournamentData.maxSquad || 15)) return res.status(403).json({ error: "SQUAD FULL" });
        if (db.liveAuction.highestBidder && amount <= db.liveAuction.currentBid) return res.status(400).json({ error: "Bid too low" });

        db.liveAuction.currentBid = amount;
        db.liveAuction.highestBidder = { email, teamName };
        await saveDB(db);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/live/start', async (req, res) => {
    try {
        const db = await loadDB();
        db.liveAuction = { activePlayer: req.body.player, currentBid: req.body.player.base, highestBidder: null, lastResult: null };
        await saveDB(db);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/live/sold', async (req, res) => {
    try {
        const { player, winner, price } = req.body;
        const db = await loadDB();
        db.soldPlayers[player.name] = { email: winner.email, price: price };
        db.liveAuction = { activePlayer: null, lastResult: { name: player.name, team: winner.teamName, price, status: 'SOLD' } };
        await saveDB(db);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 📊 PLAYER DATA ---
app.get('/api/players', (req, res) => {
    const csvPath = path.join(process.cwd(), 'public', 'players.csv');
    if (!fs.existsSync(csvPath)) return res.json([]);
    const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(l => l.trim() !== "");
    const list = lines.slice(1).map(line => {
        const v = line.split(',').map(item => item.trim().replace(/^"|"$/g, ''));
        return { name: v[0], role: v[1], country: v[2], base: parseFloat(v[3]) / 10000000 || 0 };
    });
    res.json(list);
});

module.exports = app;
