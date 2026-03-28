const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🕵️‍♂️ Lappu's Connection Check
console.log("System Check: Checking Supabase Connection...");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

if (!url || !key) {
    console.error("❌ ERROR: Missing URL or KEY in Vercel Settings!");
} else {
    console.log(`✅ URL Loaded. Key Length: ${key.length} characters.`);
    // Note: If Key Length is less than 100, it's definitely the wrong key!
}

const supabase = createClient(url || '', key || '');

async function loadDB() {
    const { data, error } = await supabase.from('auction_db').select('state').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data ? data.state : null;
}

app.post('/api/tournament/save', async (req, res) => {
    try {
        let db = await loadDB();
        if (!db) {
            db = { tournamentData: {}, matches: [], soldPlayers: {}, liveAuction: {}, users: {} };
        }
        // Force status to change to break the loop
        db.tournamentData = { ...db.tournamentData, ...req.body, status: "Phase_1_Secret" };
        
        const { error } = await supabase.from('auction_db').update({ state: db }).eq('id', 1);
        if (error) throw error;
        
        console.log("✅ Tournament Created Successfully!");
        res.json({ success: true });
    } catch (e) {
        console.error("🔥 SAVE ERROR:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/tournament/data', async (req, res) => {
    try {
        const db = await loadDB();
        if (!db) return res.json({ tournamentData: { status: "Setup" }, matches: [] });
        res.json({ ...db.tournamentData, matches: db.matches || [] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = app;
