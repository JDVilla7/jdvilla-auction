const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'data.json');

// --- DATABASE LOGIC ---
function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        return {
            tournamentData: { leagueName: "", numTeams: 0, budget: 150, minSquad: 11, maxSquad: 15, teams: [], status: "Setup", currentPhase: 1 },
            ownerDataStore: {},
            soldPlayers: {},
            liveAuction: { activePlayer: null, currentBid: 0, highestBidder: null },
            // NEW FIELDS FOR TOURNAMENT
            matches: [], // { id, teamA, teamB, startTime, teamAXI: [], teamBXI: [] }
            fantasyTeams: {}, // { userId: { matchId: { players: [], cIndex, vcIndex } } }
            users: {} // { gmail: { name, points } }
        };
    }
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!data.matches) data.matches = [];
    if (!data.fantasyTeams) data.fantasyTeams = {};
    if (!data.users) data.users = {};
    return data;
}

// 1. ADD PLAYER MANUALLY DURING AUCTION
app.post('/api/admin/add-player', (req, res) => {
    const { name, role, country, base } = req.body;
    // Note: This adds to the pool, but players.csv remains unchanged (original data safety)
    // We will handle this by merging CSV data with a 'manualPlayers' array if needed, 
    // but for now, we'll just let the admin Hammer them directly.
    db.liveAuction = { activePlayer: { name, role, country, base }, currentBid: base, highestBidder: null };
    saveData(db);
    res.json({ success: true });
});

// 2. COMPLETE AUCTION & START TOURNAMENT MODE
app.post('/api/admin/complete-auction', (req, res) => {
    db.tournamentData.status = "Auction_Completed";
    db.liveAuction = { activePlayer: null, currentBid: 0, highestBidder: null, lastResult: null };
    saveData(db);
    res.json({ success: true });
});

// 3. SCHEDULE MATCH
app.post('/api/admin/schedule-match', (req, res) => {
    const match = { 
        id: "M" + Date.now(), 
        ...req.body, // teamA, teamB, startTime 
        teamAXI: [], 
        teamBXI: [],
        resultSubmitted: false 
    };
    db.matches.push(match);
    saveData(db);
    res.json({ success: true });
});

function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
let db = loadData();

// --- ADMIN AUTH ---
app.post('/api/admin/login', (req, res) => {
    if (req.body.email === "admin@jdvilla.com" && req.body.password === "Lappu2026") res.json({ success: true });
    else res.status(401).json({ success: false });
});

// --- TOURNAMENT CORE ---
app.post('/api/tournament/save', (req, res) => {
    db.tournamentData = { ...db.tournamentData, ...req.body };
    saveData(db);
    res.json({ success: true });
});

// REPLACE THIS ROUTE IN server.js
app.get('/api/tournament/data', (req, res) => {
    // This sends BOTH the tournament settings AND the matches list
    res.json({
        ...db.tournamentData,
        matches: db.matches || []
    });
});

// --- SECRET PHASE LOGIC (Phases 1 & 2) ---
app.post('/api/admin/declare-results', (req, res) => {
    const playerBids = {};
    Object.keys(db.ownerDataStore).forEach(email => {
        db.ownerDataStore[email].bids.forEach(b => {
            if (!playerBids[b.name]) playerBids[b.name] = [];
            playerBids[b.name].push({ email, bid: b.bid });
        });
    });

    Object.keys(playerBids).forEach(pName => {
        const bids = playerBids[pName].sort((a, b) => b.bid - a.bid);
        if (bids.length === 1 || (bids.length > 1 && bids[0].bid > bids[1].bid)) {
            db.soldPlayers[pName] = { email: bids[0].email, price: bids[0].bid };
        }
    });

    Object.keys(db.ownerDataStore).forEach(email => {
        db.ownerDataStore[email].bids = []; 
        db.ownerDataStore[email].submitted = false; 
    });
    db.tournamentData.status = "Results_Declared";
    saveData(db);
    res.json({ success: true });
});

app.post('/api/admin/start-next-phase', (req, res) => {
    const { mode, startTime, endTime } = req.body;
    db.tournamentData.currentPhase = parseInt(db.tournamentData.currentPhase || 1) + 1;
    db.tournamentData.status = (mode === 'secret') ? "Phase_Secret_Live" : "Phase_Live_Auction";
    db.tournamentData.phase1Start = startTime;
    db.tournamentData.phase1End = endTime;
    
    // Clear live state just in case
    db.liveAuction = { activePlayer: null, currentBid: 0, highestBidder: null };

    Object.keys(db.ownerDataStore).forEach(email => {
        db.ownerDataStore[email].submitted = false;
        db.ownerDataStore[email].bids = [];
    });
    saveData(db);
    res.json({ success: true });
});

// --- LIVE HAMMER LOGIC ---

// 1. Admin pushes player to hammer
app.post('/api/admin/live/start', (req, res) => {
    const { player } = req.body;
    db.liveAuction = {
        activePlayer: player,
        currentBid: player.base,
        highestBidder: null,
        lastResult: null // Clear the previous result when new player starts
    };
    saveData(db);
    res.json({ success: true });
});

// 2. Admin finalizes sale
app.post('/api/admin/live/sold', (req, res) => {
    const { player, winner, price } = req.body;
    db.soldPlayers[player.name] = { email: winner.email, price: price };
    
    // NEW: Save the result so owners can see it!
    db.liveAuction = { 
        activePlayer: null, 
        currentBid: 0, 
        highestBidder: null,
        lastResult: { name: player.name, team: winner.teamName, price: price, status: 'SOLD' } 
    };
    saveData(db);
    res.json({ success: true });
});

app.post('/api/admin/live/unsold', (req, res) => {
    db.liveAuction = { 
        activePlayer: null, 
        currentBid: 0, 
        highestBidder: null,
        lastResult: { name: db.liveAuction.activePlayer.name, status: 'UNSOLD' } 
    };
    saveData(db);
    res.json({ success: true });
});

// --- OWNER LIVE ROUTES ---

// Polling route
app.get('/api/live/state', (req, res) => {
    res.json(db.liveAuction || { activePlayer: null, currentBid: 0, highestBidder: null });
});

// Bidding route
app.post('/api/live/bid', (req, res) => {
    const { email, teamName, amount } = req.body;
    // 1. Check Squad Size (Count how many players this email ALREADY owns)
    const myPlayersCount = Object.values(db.soldPlayers).filter(p => p.email === email).length;
    const maxLimit = parseInt(db.tournamentData.maxSquad || 15);

    if (myPlayersCount >= maxLimit) {
        return res.status(403).json({ error: "SQUAD FULL! You cannot bid for more players." });
    }
    
    // Check if someone has already bid
    if (db.liveAuction.highestBidder) {
        // If there's already a bidder, new bid MUST be strictly higher
        if (amount <= db.liveAuction.currentBid) {
            return res.status(400).json({ error: "Bid too low" });
        }
    } else {
        // If it's the FIRST bid, it can be EQUAL to the base price
        if (amount < db.liveAuction.currentBid) {
            return res.status(400).json({ error: "Bid below base price" });
        }
    }

    console.log(`\x1b[36m🔥 NEW BID: ${teamName} raised to ${amount.toFixed(2)} Cr\x1b[0m`);
    db.liveAuction.currentBid = amount;
    db.liveAuction.highestBidder = { email, teamName };
    saveData(db);
    res.json({ success: true });
});

// --- PLAYER & RESULTS DATA ---
app.get('/api/players', (req, res) => {
    const csvPath = path.join(__dirname, 'players.csv');
    if (!fs.existsSync(csvPath)) return res.json([]);
    const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(line => line.trim() !== "");
    
    const playerList = lines.slice(1).map(line => {
        const v = line.split(',').map(item => item.trim().replace(/^"|"$/g, ''));
        if (v.length < 4 || db.soldPlayers[v[0]]) return null;

        let raw = parseFloat(v[3].replace(/,/g, '')) || 0;
        let price = (raw >= 100000) ? (raw / 10000000) : raw; 

        return { name: v[0], role: v[1], country: v[2], base: price };
    }).filter(p => p !== null);

    res.json(playerList);
});

app.get('/api/bids/:email', (req, res) => {
    res.json(db.ownerDataStore[req.params.email] || { bids: [], submitted: false });
});

app.get('/api/results/my-squad/:email', (req, res) => {
    const myWinnings = Object.entries(db.soldPlayers)
        .filter(([name, data]) => data.email === req.params.email)
        .map(([name, data]) => ({ name, price: data.price }));
    res.json(myWinnings || []);
});

// --- SAVING & STATUS ---
app.post('/api/bids/save', (req, res) => {
    const { email, bids } = req.body;
    if (db.ownerDataStore[email]?.submitted) return res.status(403).json({ error: "LOCKED" });
    db.ownerDataStore[email] = { bids, submitted: false };
    saveData(db);
    res.json({ success: true });
});

app.post('/api/bids/submit', (req, res) => {
    const { email } = req.body;
    if (!db.ownerDataStore[email]) db.ownerDataStore[email] = { bids: [], submitted: true };
    else db.ownerDataStore[email].submitted = true;
    saveData(db);
    res.json({ success: true });
});

app.get('/api/admin/status', (req, res) => {
    res.json(db.tournamentData.teams.map(t => ({ ...t, submitted: db.ownerDataStore[t.email]?.submitted || false })));
});

// --- UPDATE THIS ROUTE IN server.js ---
app.get('/api/tournament/data', (req, res) => {
    // We send tournamentData AND the matches array together
    res.json({
        ...db.tournamentData,
        matches: db.matches || []
    });
});

app.post('/api/tournament/submit-xi', (req, res) => {
    const { matchId, email, players } = req.body;
    const match = db.matches.find(m => m.id === matchId);
    if (!match) return res.status(404).send("Match not found");

    const teamObj = db.tournamentData.teams.find(t => t.email === email);
    if (match.teamA === teamObj.name) match.teamAXI = players;
    else if (match.teamB === teamObj.name) match.teamBXI = players;

    saveData(db);
    res.json({ success: true });
});

server.listen(5000, () => console.log('\x1b[35m🚀 JDVILLA ENGINE ONLINE: http://localhost:5000\x1b[0m'));