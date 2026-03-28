const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Initialize Supabase with a check
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ CRITICAL: Environment variables are missing!");
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '', {
  auth: {
    persistSession: false // This prevents some "fetch" errors in serverless functions
  }
});

app.get('/api/tournament/data', async (req, res) => {
    try {
        const { data, error } = await supabase.from('auction_db').select('state').eq('id', 1).maybeSingle();
        if (error) throw error;
        const db = data ? data.state : { tournamentData: { status: "Setup" } };
        res.json({ ...db.tournamentData, matches: db.matches || [] });
    } catch (e) {
        console.error("Fetch Error:", e.message);
        res.status(500).json({ error: "Fetch Failed", detail: e.message });
    }
});

app.post('/api/tournament/save', async (req, res) => {
    try {
        const { data: current } = await supabase.from('auction_db').select('state').eq('id', 1).maybeSingle();
        let db = current ? current.state : { tournamentData: {}, matches: [], soldPlayers: {}, liveAuction: {}, users: {} };
        
        db.tournamentData = { ...db.tournamentData, ...req.body, status: "Phase_1_Secret" };
        
        const { error } = await supabase.from('auction_db').update({ state: db }).eq('id', 1);
        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin Login
app.post('/api/admin/login', (req, res) => {
    if (req.body.email === "admin@jdvilla.com" && req.body.password === "Lappu2026") res.json({ success: true });
    else res.status(401).json({ success: false });
});

module.exports = app;
