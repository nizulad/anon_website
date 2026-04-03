const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const { MongoClient } = require('mongodb');

// 1. Database Configuration
const uri = process.env.MONGO_URI; 
const client = new MongoClient(uri);

app.use(express.static('public'));
app.use(express.json());

async function startServer() {
    try {
        await client.connect();
        const db = client.db('ChatApp');
        const usersCol = db.collection('users');
        const messagesCol = db.collection('messages');

       app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    console.log(`Login attempt for: ${username}`); // <--- ADD THIS

    const user = await usersCol.findOne({ username, password });
    
    if (user) {
        console.log(`User found in DB: ${user.username}, Status: ${user.status}`); // <--- AND THIS
    } else {
        console.log("No user found with those credentials.");
    }
    // ... rest of code
});





        console.log("Connected to MongoDB Atlas!");

        // --- AUTHENTICATION ROUTES ---

        // Sign Up: New users start as 'pending' with no room
        app.post('/signup', async (req, res) => {
            const { username, password } = req.body;
            if (!username || !password) return res.status(400).json({ error: "Missing fields" });

            const exists = await usersCol.findOne({ username });
            if (exists) return res.status(400).json({ error: "Username already taken" });

            await usersCol.insertOne({
                username,
                password, // For your school project, plain text is fine; for real apps, use bcrypt!
                role: 'user',
                status: 'pending',
                assignedRoom: null,
                color: `#${Math.floor(Math.random()*16777215).toString(16)}`
            });
            res.json({ message: "Access requested! Wait for admin approval." });
        });

        // Login: Checks credentials and status
        app.post('/login', async (req, res) => {
            const { username, password } = req.body;
            const user = await usersCol.findOne({ username, password });

            if (!user) return res.status(401).json({ error: "Invalid username or password" });
            if (user.status === 'pending') return res.status(403).json({ error: "Admin hasn't approved you yet" });

            res.json({
                username: user.username,
                role: user.role,
                color: user.color,
                room: user.assignedRoom
            });
        });

        // --- ADMIN ROUTES ---

        // Get all users waiting for a room
        app.get('/admin/pending', async (req, res) => {
            const pending = await usersCol.find({ status: 'pending' }).toArray();
            res.json(pending);
        });

        // Admin approves and assigns a specific room
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
            // When a user successfully logs in, they "join" their assigned room
            socket.on('join room', async ({ username, room }) => {
                socket.join(room);
                console.log(`${username} joined ${room}`);

                // Fetch history only for that specific room
                const history = await messagesCol.find({ room })
                    .sort({ _id: -1 })
                    .limit(50)
                    .toArray();
                
                socket.emit('load history', history.reverse());
            });

            // Sending a message
            socket.on('chat message', async (data) => {
                const messageData = {
                    username: data.username,
                    text: data.text,
                    room: data.room,
                    color: data.color,
                    time: new Date()
                };

                // Save to DB and broadcast to that specific room only
                await messagesCol.insertOne(messageData);
                io.to(data.room).emit('chat message', messageData);
            });
        });

        // Start the engine
        const PORT = process.env.PORT || 3000;
        http.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });

    } catch (err) {
        console.error("Critical Server Error:", err);
    }
}

startServer();
