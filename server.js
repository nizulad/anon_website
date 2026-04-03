const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const { MongoClient } = require('mongodb');

// Use the environment variable we will set on Render
const uri = process.env.MONGO_URI; 
const client = new MongoClient(uri);

app.use(express.static('public'));

async function startServer() {
    try {
        await client.connect();
        const db = client.db('chatApp');
        const messagesCol = db.collection('messages');
        console.log("Connected to MongoDB!");

        io.on('connection', async (socket) => {
            const userId = socket.id.substring(0, 5);

            // 1. When a user joins, get the last 50 messages from DB
            const history = await messagesCol.find().sort({ _id: -1 }).limit(50).toArray();
            socket.emit('load history', history.reverse());

            // 2. When a user sends a message
            socket.on('chat message', async (msg) => {
                const messageData = { id: userId, text: msg, time: new Date() };
                
                // Save to Database
                await messagesCol.insertOne(messageData);
                
                // Send to everyone else
                io.emit('chat message', messageData);
            });
        });

        const PORT = process.env.PORT || 3000;
        http.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });

    } catch (err) {
        console.error("DB Connection Error:", err);
    }
}

startServer();
