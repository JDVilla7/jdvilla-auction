const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- HELPER: Safe DB Load ---
async function loadDB() {
    const { data, error } = await supabase.from('auction_db').select('state').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data ? data.state : { tournamentData: { status: "Setup", teams: [] }, matches: [], liveAuction: { currentBid: 0 }, soldPlayers: {} };
}

// --- ADMIN AUTH ---
app.post('/api/admin/login', (req, res) => {
    if (req.body.email === "admin@jdvilla.com" && req.body.password === "Lappu2026") {
        return res.json({ success: true });
    }
    res.status(401).json({ success: false });
});

// --- TOURNAMENT DATA ---
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
        await supabase.from('auction_db').update({ state: db }).eq('id', 1);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- LIVE AUCTION ---
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

        if (amount <= (db.liveAuction.currentBid || 0)) {
            return res.status(400).json({ error: "Bid too low" });
        }

        db.liveAuction.currentBid = amount;
        db.liveAuction.highestBidder = { email, teamName };
        
        await supabase.from('auction_db').update({ state: db }).eq('id', 1);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- EXPORT ---
module.exports = app;
module.exports.handler = serverless(app);
