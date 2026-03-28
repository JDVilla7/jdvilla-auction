const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- 🛡️ THE STABLE DATABASE HELPER ---
async function loadDB() {
    // maybeSingle() is safer than single() because it won't crash if the row is missing
    const { data, error } = await supabase.from('auction_db').select('state').eq('id', 1).maybeSingle();
    
    if (error) {
        console.error("Supabase Select Error:", error.message);
        throw error;
    }

    if (!data || !data.state) {
        // Return a default state if the row is empty so the app doesn't crash
        return {
            tournamentData: { leagueName: "JDVILLA", teams: [], status: "Setup" },
            matches: [],
            soldPlayers: {},
            liveAuction: { activePlayer: null, currentBid: 0 },
            users: {}
        };
    }
    return data.state;
}

async function saveDB(newState) {
    const { error } = await supabase.from('auction_db').update({ state: newState }).eq('id', 1);
    if (error) {
        console.error("Supabase Update Error:", error.message);
        throw error;
    }
}

// --- 🚀 FIXED ROUTES WITH ERROR CATCHING ---

app.get('/api/tournament/data', async (req, res) => {
    try {
        const db = await loadDB();
        res.json({ ...db.tournamentData, matches: db.matches || [] });
    } catch (e) {
        console.error("Route Error:", e.message);
        res.status(500).json({ error: "Failed to load data", details: e.message });
    }
});

app.post('/api/tournament/save', async (req, res) => {
    try {
        const { leagueName, numTeams, budget, minSquad, maxSquad } = req.body;
        const db = await loadDB();
        
        db.tournamentData = { 
            ...db.tournamentData, 
            leagueName, numTeams, budget, minSquad, maxSquad,
            status: "Setup" 
        };
        
        await saveDB(db);
        res.json({ success: true });
    } catch (e) {
        console.error("Save Error:", e.message);
        res.status(500).json({ error: "Failed to save data", details: e.message });
    }
});

// Admin Login (Keep this sync since it doesn't use the DB)
app.post('/api/admin/login', (req, res) => {
    if (req.body.email === "admin@jdvilla.com" && req.body.password === "Lappu2026") {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

app.get('/api/players', (req, res) => {
    try {
        const csvPath = path.join(process.cwd(), 'public', 'players.csv');
        if (!fs.existsSync(csvPath)) return res.json([]);
        const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(l => l.trim() !== "");
        const list = lines.slice(1).map(line => {
            const v = line.split(',').map(item => item.trim().replace(/^"|"$/g, ''));
            return { name: v[0], role: v[1], country: v[2], base: parseFloat(v[3]) / 10000000 || 0 };
        });
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: "CSV Read Error" });
    }
});

module.exports = app;
