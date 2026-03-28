const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Initialize Supabase (No trailing slashes allowed in the URL!)
const supabase = createClient(
    process.env.SUPABASE_URL.trim(), 
    process.env.SUPABASE_KEY.trim()
);

// --- 🛡️ THE DATABASE LOGIC ---
async function loadDB() {
    // maybeSingle avoids the crash if Row 1 is missing
    const { data, error } = await supabase.from('auction_db').select('state').eq('id', 1).maybeSingle();
    if (error) throw error;
    
    if (!data || !data.state) {
        // Your exact Localhost structure
        return {
            tournamentData: { leagueName: "JDVILLA LEAGUE", numTeams: 0, budget: 150, minSquad: 11, maxSquad: 15, teams: [], status: "Setup", currentPhase: 1 },
            ownerDataStore: {},
            soldPlayers: {},
            liveAuction: { activePlayer: null, currentBid: 0, highestBidder: null },
            matches: [],
            users: {}
        };
    }
    return data.state;
}

async function saveDB(newState) {
    const { error } = await supabase.from('auction_db').update({ state: newState }).eq('id', 1);
    if (error) throw error;
}

// --- 🚀 THE FIX FOR THE "FIRST PAGE" LOOP ---
app.post('/api/tournament/save', async (req, res) => {
    try {
        const db = await loadDB();
        
        // We merge your form data AND force the status to change
        db.tournamentData = { 
            ...db.tournamentData, 
            ...req.body, 
            status: "Phase_1_Secret" // THIS is what stops it from showing the setup form again
        };
        
        await saveDB(db);
        res.json({ success: true });
    } catch (e) {
        console.error("Critical Save Error:", e.message);
        res.status(500).json({ error: "Fetch Failed", detail: e.message });
    }
});

app.get('/api/tournament/data', async (req, res) => {
    try {
        const db = await loadDB();
        // Send the data back. If status is "Phase_1_Secret", the frontend should show the dashboard.
        res.json({ ...db.tournamentData, matches: db.matches || [] });
    } catch (e) {
        res.status(500).json({ error: "Fetch Failed", detail: e.message });
    }
});

// Admin Login logic
app.post('/api/admin/login', (req, res) => {
    if (req.body.email === "admin@jdvilla.com" && req.body.password === "Lappu2026") res.json({ success: true });
    else res.status(401).json({ success: false });
});

module.exports = app;
