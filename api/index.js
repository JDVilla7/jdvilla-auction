const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- INITIALIZE CLOUD SERVICES ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// --- CLOUD DATABASE HELPERS ---
async function loadDB() {
    const { data, error } = await supabase.from('auction_db').select('state').eq('id', 1).single();
    if (error) throw error;
    return data.state;
}

async function saveDB(newState) {
    const { error } = await supabase.from('auction_db').update({ state: newState }).eq('id', 1);
    if (error) throw error;
}

// --- 🛡️ AUTH & SECURITY LOGIC ---

// 1. LOGIN: Checks if email is an Owner (VIP) or a signed-up User
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email } = req.body;
        const db = await loadDB();

        // Check Team Owners first (VIP)
        const owner = db.tournamentData.teams.find(t => t.email.toLowerCase() === email.toLowerCase());
        if (owner) {
            return res.json({ success: true, role: 'owner', teamName: owner.name, ownerName: owner.owner });
        }

        // Check Registered Users (Fans)
        if (db.users && db.users[email.toLowerCase()]) {
            const user = db.users[email.toLowerCase()];
            return res.json({ success: true, role: 'user', name: user.name });
        }

        res.status(401).json({ success: false, message: "Access Denied. Please Sign Up first!" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. SIGNUP: For new users to register
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, name } = req.body;
        const db = await loadDB();
        
        if (!db.users) db.users = {};
        if (db.users[email.toLowerCase()]) return res.status(400).json({ error: "Already registered!" });

        db.users[email.toLowerCase()] = { name, points: 0, joinedAt: new Date().toISOString() };
        await saveDB(db);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ⚙️ ADMIN ROUTES ---

app.post('/api/admin/login', (req, res) => {
    if (req.body.email === "admin@jdvilla.com" && req.body.password === "Lappu2026") res.json({ success: true });
    else res.status(401).json({ success: false });
});

app.post('/api/tournament/save', async (req, res) => {
    const db = await loadDB();
    db.tournamentData = { ...db.tournamentData, ...req.body };
    await saveDB(db);
    res.json({ success: true });
});

app.post('/api/admin/schedule-match', async (req, res) => {
    const db = await loadDB();
    db.matches.push({ id: "M" + Date.now(), ...req.body, teamAXI: [], teamBXI: [], resultSubmitted: false });
    await saveDB(db);
    res.json({ success: true });
});

// --- 🔨 LIVE AUCTION ROUTES ---

app.get('/api/live/state', async (req, res) => {
    const db = await loadDB();
    res.json(db.liveAuction || { activePlayer: null, currentBid: 0 });
});

app.post('/api/live/bid', async (req, res) => {
    const { email, teamName, amount } = req.body;
    const db = await loadDB();
    
    const myPlayersCount = Object.values(db.soldPlayers).filter(p => p.email === email).length;
    if (myPlayersCount >= (db.tournamentData.maxSquad || 15)) return res.status(403).json({ error: "SQUAD FULL" });

    if (db.liveAuction.highestBidder && amount <= db.liveAuction.currentBid) return res.status(400).json({ error: "Bid too low" });
    
    db.liveAuction.currentBid = amount;
    db.liveAuction.highestBidder = { email, teamName };
    await saveDB(db);
    res.json({ success: true });
});

app.post('/api/admin/live/sold', async (req, res) => {
    const { player, winner, price } = req.body;
    const db = await loadDB();
    db.soldPlayers[player.name] = { email: winner.email, price: price };
    db.liveAuction = { activePlayer: null, lastResult: { name: player.name, team: winner.teamName, price, status: 'SOLD' } };
    await saveDB(db);
    res.json({ success: true });
});

// --- 📊 DATA FETCHING ---

app.get('/api/tournament/data', async (req, res) => {
    const db = await loadDB();
    res.json({ ...db.tournamentData, matches: db.matches || [] });
});

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
