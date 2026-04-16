const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// Basic health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'success',
        message: 'ImRa Backend is running smoothly',
        timestamp: new Date().toISOString()
    });
});

// Future endpoint placeholder for thesis drafting features
app.post('/api/draft/paraphrase', async (req, res) => {
    try {
        const { text } = req.body;
        // Logic to communicate with Gemini directly from backend could go here
        res.json({ result: "Paraphrased text will appear here." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
