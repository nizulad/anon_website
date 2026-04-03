const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

app.use(express.static('public'));
app.use(express.json());

async function startServer() {
    try {
        await client.connect();
        // Matching your screenshot 1686.jpg: Database is "Chatapp"
        const db = client.db('Chatapp'); 
        const usersCol = db.collection('users');
        const messagesCol = db.collection('messages');
        console.log("Connected to MongoDB Atlas!");

        // --- AUTHENTICATION ROUTES ---

        app.post('/login', async (req, res) => {
            const { username, password } = req.body;
            console.log(`--- Login Attempt: ${username} ---`);

            const user = await usersCol.findOne({ username, password });

            if (!user) {
                console.log("Result: No user found in DB.");
                return res.status(401).json({ error: "Invalid username or password" });
            }

            if (user.status === 'pending') {
                console.log("Result: User is pending approval.");
                return res.status(403).json({ error: "Admin hasn't approved you yet" });
            }

            console.log(`Result: Success! User assigned to ${user.assignedRoom}`);
            res.json({
                username: user.username,
                role: user.role,
                color: user.color,
                room: user.assignedRoom
            });
        });

        app.post('/signup', async (req, res) => {
            const { username, password } = req.body;
            if (!username || !password) return res.status(400).json({ error: "Missing fields" });

            const exists = await usersCol.findOne({ username });
            if (exists) return res.status(400).json({ error: "Username already taken" });

            await usersCol.insertOne({
                username,
                password,
                role: 'user',
                status: 'pending',
                assignedRoom: null,
                color: `#${Math.floor(Math.random()*16777215).toString(16)}`
            });
            res.json({ message: "Access requested! Wait for admin approval." });
        });

        // --- ADMIN ROUTES ---
        app.get('/admin/pending', async (req, res) => {
            const pending = await usersCol.find({ status: 'pending' }).toArray();
            res.json(pending);
        });

        app.post('/admin/approve', async (req, res) => {
            const { username, room } = req.body;
            await usersCol.updateOne(
                { username },
                { $set: { status: 'approved', assignedRoom: room } }
            );
            res.json({ success: true });
        });

        // --- REAL-TIME SOCKET LOGIC ---
        io.on('connection', (socket) => {
            socket.on('join room', async ({ username, room }) => {
                if(!room) return;
                socket.join(room);
                console.log(`${username} joined ${room}`);

                const history = await messagesCol.find({ room })
                    .sort({ _id: -1 })
                    .limit(50)
                    .toArray();

                socket.emit('load history', history.reverse());
            });

            socket.on('chat message', async (data) => {
                const messageData = {
                    username: data.username,
                    text: data.text,
                    room: data.room,
                    color: data.color,
                    time: new Date()
                };
                await messagesCol.insertOne(messageData);
                io.to(data.room).emit('chat message', messageData);
            });
        });

        const PORT = process.env.PORT || 3000;
        http.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });

    } catch (err) {
        console.error("Critical Server Error:", err);
    }
}

startServer();
