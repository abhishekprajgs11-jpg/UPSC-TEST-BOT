const bot = require('../bot');

module.exports = async (req, res) => {
    // Handle GET requests so it doesn't crash if someone visits the URL in browser
    if (req.method === 'GET') {
        return res.status(200).send('Bot Webhook is active and running!');
    }

    if (req.method === 'POST') {
        try {
            // Handle the Telegram update (do not pass 'res' to avoid header conflicts)
            await bot.handleUpdate(req.body);
            
            // Only send response if Telegraf hasn't already sent it
            if (!res.headersSent) {
                return res.status(200).send('OK');
            }
        } catch (e) {
            console.error("Webhook error:", e);
            if (!res.headersSent) {
                return res.status(500).send("Error");
            }
        }
    } else {
        return res.status(405).send('Method Not Allowed');
    }
};
