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

// --- 🌐 CLOUD SERVICES ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// --- 🛡️ THE HEART: DATABASE LOGIC ---
async function loadDB() {
    try {
        const { data, error } = await supabase.from('auction_db').select('state').eq('id', 1).maybeSingle();
        if (error) throw error;

        if (!data || !data.state) {
            // Your original Localhost structure
            return {
                tournamentData: { leagueName: "JDVILLA LEAGUE", numTeams: 0, budget: 150, minSquad: 11, maxSquad: 15, teams: [], status: "Setup", currentPhase: 1 },
                ownerDataStore: {},
                soldPlayers: {},
                liveAuction: { activePlayer: null, currentBid: 0, highestBidder: null },
                matches: [],
                fantasyTeams: {},
                users: {}
            };
        }
        return data.state;
    } catch (e) {
        console.error("DB Load Error:", e.message);
        throw e;
    }
}

async function saveDB(newState) {
    const { error } = await supabase.from('auction_db').update({ state: newState }).eq('id', 1);
    if (error) throw error;
}

// --- 🛡️ AUTH & LOGIN ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email } = req.body;
        const db = await loadDB();
        const owner = db.tournamentData.teams.find(t => t.email.toLowerCase() === email.toLowerCase());
        if (owner) return res.json({ success: true, role: 'owner', teamName: owner.name });
        if (db.users && db.users[email.toLowerCase()]) return res.json({ success: true, role: 'user', name: db.users[email.toLowerCase()].name });
        res.status(401).json({ success: false, message: "Please Sign Up first!" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/login', (req, res) => {
    if (req.body.email === "admin@jdvilla.com" && req.body.password === "Lappu2026") res.json({ success: true });
    else res.status(401).json({ success: false });
});

// --- 🏆 TOURNAMENT SETUP (The fix for the loop) ---
app.post('/api/tournament/save', async (req, res) => {
    try {
        const db = await loadDB();
        db.tournamentData = { ...db.tournamentData, ...req.body, status: "Phase_1_Secret" };
        await saveDB(db);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tournament/data', async (req, res) => {
    try {
        const db = await loadDB();
        res.json({ ...db.tournamentData, matches: db.matches || [] });
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
        db.liveAuction = { activePlayer: null, currentBid: 0, lastResult: { name: player.name, team: winner.teamName, price, status: 'SOLD' } };
        await saveDB(db);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 📊 PLAYER & RESULTS ---
app.get('/api/players', (req, res) => {
    try {
        const csvPath = path.join(process.cwd(), 'public', 'players.csv');
        if (!fs.existsSync(csvPath)) return res.json([]);
        const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(l => l.trim() !== "");
        const playerList = lines.slice(1).map(line => {
            const v = line.split(',').map(item => item.trim().replace(/^"|"$/g, ''));
            return { name: v[0], role: v[1], country: v[2], base: parseFloat(v[3]) / 10000000 || 0 };
        });
        res.json(playerList);
    } catch (e) { res.json([]); }
});

app.get('/api/bids/:email', async (req, res) => {
    const db = await loadDB();
    res.json(db.ownerDataStore[req.params.email] || { bids: [], submitted: false });
});

app.post('/api/bids/save', async (req, res) => {
    const db = await loadDB();
    if (db.ownerDataStore[req.body.email]?.submitted) return res.status(403).json({ error: "LOCKED" });
    db.ownerDataStore[req.body.email] = { bids: req.body.bids, submitted: false };
    await saveDB(db);
    res.json({ success: true });
});

module.exports = app;
