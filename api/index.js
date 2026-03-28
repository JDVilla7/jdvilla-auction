const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '');

// --- 🕵️‍♂️ LOBBY/TEST ROUTE ---
app.get('/api/test', (req, res) => {
    res.json({ status: "Lappu is Online!", time: new Date().toISOString() });
});

// --- 🛡️ ADMIN LOGIN (Hardcoded for speed) ---
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === "admin@jdvilla.com" && password === "Lappu2026") {
        return res.json({ success: true });
    }
    res.status(401).json({ success: false });
});

// --- 🏆 TOURNAMENT DATA ---
app.get('/api/tournament/data', async (req, res) => {
    try {
        const { data, error } = await supabase.from('auction_db').select('state').eq('id', 1).maybeSingle();
        if (error) throw error;
        const state = data ? data.state : { tournamentData: { status: "Setup" } };
        res.json({ ...state.tournamentData, matches: state.matches || [] });
    } catch (e) {
        res.status(500).json({ error: "DB Error", detail: e.message });
    }
});

// --- 🏁 VERCEL EXPORT ---
module.exports = app;
