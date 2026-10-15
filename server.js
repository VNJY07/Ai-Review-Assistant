const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SHOPS_FILE = path.join(__dirname, 'shops.json');
const FEEDBACK_FILE = path.join(__dirname, 'feedbacks.json');

// Helper to read shops
function getShops() {
  if (!fs.existsSync(SHOPS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SHOPS_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

// API: Get shop info for frontend
app.get('/api/shop/:shopId', (req, res) => {
  const shops = getShops();
  const shop = shops[req.params.shopId];
  if (!shop) {
    return res.status(404).json({ success: false, message: 'Shop not found' });
  }
  // Do not expose pin to public client
  const { pin, ...safeShop } = shop;
  res.json({ success: true, shop: safeShop });
});

// API: Merchant Login & Fetch Feedbacks
app.post('/api/merchant/login', (req, res) => {
  const { shopId, pin } = req.body;
  const shops = getShops();
  const shop = shops[shopId];

  if (!shop || shop.pin !== pin) {
    return res.status(401).json({ success: false, message: 'Invalid Shop ID or PIN' });
  }

  let feedbacks = [];
  if (fs.existsSync(FEEDBACK_FILE)) {
    try {
      const allFeedbacks = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
      feedbacks = allFeedbacks.filter(item => item.shopId === shopId);
    } catch (e) {
      feedbacks = [];
    }
  }

  res.json({ success: true, shopName: shop.name, feedbacks });
});

// API: Submit Feedback (Private)
app.post('/api/feedback', (req, res) => {
  const { shopId, feedback, contact } = req.body;
  if (!shopId || !feedback) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  let allFeedbacks = [];
  if (fs.existsSync(FEEDBACK_FILE)) {
    try {
      allFeedbacks = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
    } catch (e) {
      allFeedbacks = [];
    }
  }

  const newEntry = {
    id: Date.now().toString(),
    shopId,
    feedback,
    contact: contact || '',
    timestamp: new Date().toISOString()
  };

  allFeedbacks.push(newEntry);
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(allFeedbacks, null, 2), 'utf8');

  res.json({ success: true, message: 'Feedback saved privately' });
});

// API: AI Review Assistant (Groq)
app.post('/api/generate-review', async (req, res) => {
  const { prompt, shopId } = req.body;
  const shops = getShops();
  const shop = shops[shopId] || { name: "Our Store" };

  try {
    const response = await axios.post(
      process.env.AI_API_BASE || 'https://api.groq.com/openai/v1',
      {
        model: process.env.AI_MODEL || 'qwen/qwen3.8-27b',
        messages: [
          {
            role: 'system',
            content: `You are a helpful customer writing a glowing 5-star review for "${shop.name}". Write a natural, warm, and authentic review based on the user's input. Keep it concise (1-3 sentences).`
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.AI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reviewText = response.data.choices[0].message.content.trim();
    res.json({ success: true, review: reviewText });
  } catch (error) {
    console.error('AI Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Failed to generate review' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});