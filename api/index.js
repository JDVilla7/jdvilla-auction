const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🕵️‍♂️ DIAGNOSTIC LOG: This will show in Vercel Logs to confirm keys are loaded
console.log("Checking Environment Variables...");
if (!process.env.SUPABASE_URL) console.error("❌ SUPABASE_URL is MISSING in Vercel Settings!");
else console.log("✅ SUPABASE_URL detected:", process.env.SUPABASE_URL.substring(0, 15) + "...");

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '');

async function loadDB() {
    try {
        const { data, error } = await supabase.from('auction_db').select('state').eq('id', 1).maybeSingle();
        if (error) throw error;
        return data ? data.state : null;
    } catch (e) {
        // This will now log the REAL reason for the "fetch failed"
        console.error("CRITICAL DB LOAD ERROR:", e.message);
        throw e;
    }
}

async function saveDB(state) {
    const { error } = await supabase.from('auction_db').update({ state }).eq('id', 1);
    if (error) {
        console.error("CRITICAL DB SAVE ERROR:", error.message);
        throw error;
    }
}

app.get('/api/tournament/data', async (req, res) => {
    try {
        const db = await loadDB();
        if (!db) return res.json({ status: "Setup", teams: [] });
        res.json({ ...db.tournamentData, matches: db.matches || [] });
    } catch (e) {
        res.status(500).json({ error: "Fetch Failed", detail: e.message });
    }
});

app.post('/api/tournament/save', async (req, res) => {
    try {
        let db = await loadDB();
        if (!db) {
            db = { tournamentData: {}, matches: [], soldPlayers: {}, liveAuction: {}, users: {} };
        }
        db.tournamentData = { ...db.tournamentData, ...req.body, status: "Phase_1_Secret" };
        await saveDB(db);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Save Failed", detail: e.message });
    }
});

// Admin Login
app.post('/api/admin/login', (req, res) => {
    if (req.body.email === "admin@jdvilla.com" && req.body.password === "Lappu2026") res.json({ success: true });
    else res.status(401).json({ success: false });
});

module.exports = app;
