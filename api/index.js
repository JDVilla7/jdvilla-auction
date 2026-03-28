const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// ✅ SUPABASE CONNECTION
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ---------------- AUTH ----------------
app.post('/api/admin/login', (req, res) => {
  if (
    req.body.email === "admin@jdvilla.com" &&
    req.body.password === "Lappu2026"
  ) {
    return res.json({ success: true });
  }
  res.status(401).json({ success: false });
});

// ---------------- TOURNAMENT ----------------
app.get('/api/tournament/data', async (req, res) => {
  const { data } = await supabase.from('tournament').select('*').single();
  const { data: matches } = await supabase.from('matches').select('*');

  res.json({
    ...data,
    matches: matches || []
  });
});

app.post('/api/tournament/save', async (req, res) => {
  await supabase.from('tournament').upsert(req.body);
  res.json({ success: true });
});

// ---------------- MATCH ----------------
app.post('/api/admin/schedule-match', async (req, res) => {
  const match = {
    id: "M" + Date.now(),
    ...req.body,
    teamAXI: [],
    teamBXI: []
  };

  await supabase.from('matches').insert(match);
  res.json({ success: true });
});

app.delete('/api/admin/delete-match/:id', async (req, res) => {
  await supabase.from('matches').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// ---------------- LIVE AUCTION ----------------
app.post('/api/admin/live/start', async (req, res) => {
  const { player } = req.body;

  await supabase.from('live_auction').upsert({
    id: 1,
    activePlayer: player,
    currentBid: player.base,
    highestBidder: null
  });

  res.json({ success: true });
});

app.get('/api/live/state', async (req, res) => {
  const { data } = await supabase.from('live_auction').select('*').single();
  res.json(data || {});
});

app.post('/api/live/bid', async (req, res) => {
  const { email, teamName, amount } = req.body;

  const { data } = await supabase.from('live_auction').select('*').single();

  if (amount <= data.currentBid) {
    return res.status(400).json({ error: "Bid too low" });
  }

  await supabase.from('live_auction').update({
    currentBid: amount,
    highestBidder: { email, teamName }
  }).eq('id', 1);

  res.json({ success: true });
});

app.post('/api/admin/live/sold', async (req, res) => {
  const { player, winner, price } = req.body;

  await supabase.from('sold_players').insert({
    player: player.name,
    email: winner.email,
    price
  });

  await supabase.from('live_auction').update({
    activePlayer: null,
    currentBid: 0,
    highestBidder: null
  }).eq('id', 1);

  res.json({ success: true });
});

// ---------------- BIDS ----------------
app.post('/api/bids/save', async (req, res) => {
  const { email, bids } = req.body;

  await supabase.from('bids').upsert({
    email,
    bids,
    submitted: false
  });

  res.json({ success: true });
});

app.post('/api/bids/submit', async (req, res) => {
  const { email } = req.body;

  await supabase.from('bids').update({
    submitted: true
  }).eq('email', email);

  res.json({ success: true });
});

app.get('/api/bids/:email', async (req, res) => {
  const { data } = await supabase.from('bids')
    .select('*')
    .eq('email', req.params.email)
    .single();

  res.json(data || { bids: [], submitted: false });
});

// ---------------- RESULTS ----------------
app.get('/api/results/my-squad/:email', async (req, res) => {
  const { data } = await supabase.from('sold_players')
    .select('*')
    .eq('email', req.params.email);

  res.json(data || []);
});

// ---------------- EMAIL (RESEND) ----------------
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

app.post('/api/admin/send-invites', async (req, res) => {
  const { data: teams } = await supabase.from('teams').select('*');

  for (const t of teams) {
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: t.email,
      subject: 'Auction Invite',
      html: `<p>Join here: https://your-app.vercel.app/owner.html</p>`
    });
  }

  res.json({ success: true });
});

// ---------------- EXPORT ----------------
module.exports = serverless(app);
