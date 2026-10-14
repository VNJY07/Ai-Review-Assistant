require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Define file paths for configurations and data storage
const SHOPS_CONFIG_FILE = path.join(__dirname, 'shops.json');
const FEEDBACK_FILE = path.join(__dirname, 'feedbacks.json');

// Helper function to auto-detect an available Groq model
async function getAvailableModel() {
  const baseUrl = (process.env.AI_API_BASE || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  try {
    const res = await axios.get(`${baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${process.env.AI_API_KEY}` }
    });
    const models = res.data.data.map(m => m.id);
    if (models.includes(process.env.AI_MODEL)) {
      return process.env.AI_MODEL;
    }
    return models[0] || 'qwen/qwen3.8-27b';
  } catch (err) {
    return process.env.AI_MODEL || 'qwen/qwen3.8-27b';
  }
}

// Helper function to load shops data from JSON file
function loadShopsData() {
  if (fs.existsSync(SHOPS_CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SHOPS_CONFIG_FILE, 'utf8'));
    } catch (e) {
      console.error("Error reading shops.json", e);
      return {};
    }
  }
  return {};
}

// API: Get shop configuration dynamically
app.get('/api/shop/:id', (req, res) => {
  const shopId = req.params.id;
  const shops = loadShopsData();
  
  // Provide a default fallback if the shop ID is not found
  const shop = shops[shopId] || {
    name: "Default Store",
    googleUrl: "https://maps.google.com",
    tags: ["Great Service", "Nice Environment", "Consistent Quality"]
  };

  res.json(shop);
});

// API: Generate AI review text
app.post('/api/generate', async (req, res) => {
  const { shopId, selectedTags, style } = req.body;
  const shops = loadShopsData();
  const shop = shops[shopId] || shops['pj_kopi'] || { name: "The Store" };

  const prompt = `
You are a real customer who just visited [${shop.name}].
Based on the selected tags: [${selectedTags && selectedTags.length ? selectedTags.join(', ') : 'None'}], write a 1-2 sentence, highly natural and conversational short review in a [${style || 'Warm & Healing'}] tone.

Requirements:
1. Do not use stiff marketing words like "highly recommended", "unparalleled", or "extremely satisfied".
2. Focus on specific details and personal emotional feelings (e.g., quiet environment, very relaxing).
3. Keep the length under 20-50 words, writing it like a casual check-in post on social media or Google Maps.
`;

  try {
    const baseUrl = (process.env.AI_API_BASE || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    const activeModel = await getAvailableModel();

    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model: activeModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85,
        max_tokens: 150
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.AI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const result = response.data.choices[0].message.content.trim();
    res.json({ success: true, text: result });
  } catch (error) {
    console.error('Groq API Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Generation failed, please try again' });
  }
});

// API: Handle private negative feedback submission
app.post('/api/feedback', (req, res) => {
  const { shopId, feedback, contact } = req.body;
  
  const newEntry = {
    id: Date.now(),
    shopId: shopId || 'pj_kopi',
    feedback: feedback || '',
    contact: contact || 'Anonymous',
    time: new Date().toLocaleString()
  };

  let feedbacks = [];
  if (fs.existsSync(FEEDBACK_FILE)) {
    try {
      feedbacks = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
    } catch (e) {
      feedbacks = [];
    }
  }

  // Add the newest feedback to the beginning of the array
  feedbacks.unshift(newEntry);
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedbacks, null, 2), 'utf8');

  res.json({ success: true, message: 'Feedback saved successfully' });
});

// API: Retrieve feedbacks for merchant dashboard
app.get('/api/feedbacks/:shopId', (req, res) => {
  const { shopId } = req.params;
  let feedbacks = [];
  
  if (fs.existsSync(FEEDBACK_FILE)) {
    try {
      const all = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
      feedbacks = all.filter(item => item.shopId === shopId);
    } catch (e) {
      feedbacks = [];
    }
  }

  res.json({ success: true, feedbacks });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});