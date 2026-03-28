const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Helper to load everything from the ONE working table
async function loadState() {
    const { data, error } = await supabase.from('auction_db').select('state').eq('id', 1).maybeSingle();
    if (error) throw error;
    // Return a safe default if row 1 is missing or empty
    return data ? data.state : { tournamentData: { status: "Setup", teams: [] }, matches: [] };
}

// ✅ LOGIN (We know this works now!)
app.post('/api/admin/login', (req, res) => {
    if (req.body.email === "admin@jdvilla.com" && req.body.password === "Lappu2026") {
        return res.json({ success: true });
    }
    res.status(401).json({ success: false });
});

// ✅ TOURNAMENT DATA (Fixed to stop 500)
app.get('/api/tournament/data', async (req, res) => {
    try {
        const state = await loadState();
        res.json({ ...state.tournamentData, matches: state.matches || [] });
    } catch (e) {
        res.status(500).json({ error: "DB Error", detail: e.message });
    }
});

// ✅ SAVE TOURNAMENT
app.post('/api/tournament/save', async (req, res) => {
    try {
        const state = await loadState();
        state.tournamentData = { ...state.tournamentData, ...req.body, status: "Phase_1_Secret" };
        await supabase.from('auction_db').update({ state }).eq('id', 1);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;
module.exports.handler = serverless(app);
