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
        const db = client.db('Chatapp'); 
        const usersCol = db.collection('Users'); 
        const messagesCol = db.collection('Messages'); 

        console.log("Connected to MongoDB Atlas! (Chatapp.Users)");

        // --- AUTHENTICATION ---
        app.post('/login', async (req, res) => {
            const { username, password } = req.body;
            const user = await usersCol.findOne({ username, password });

            if (!user) return res.status(401).json({ error: "Invalid credentials" });
            if (user.status === 'pending') return res.status(403).json({ error: "Wait for approval" });

            res.json({
                username: user.username,
                role: user.role,
                color: user.color,
                room: user.assignedRoom
            });
        });

        app.post('/signup', async (req, res) => {
            const { username, password } = req.body;
            const exists = await usersCol.findOne({ username });
            if (exists) return res.status(400).json({ error: "Taken" });
            await usersCol.insertOne({
                username, password, role: 'user', status: 'pending',
                assignedRoom: null, color: `#${Math.floor(Math.random()*16777215).toString(16)}`
            });
            res.json({ message: "Request sent!" });
        });

        // --- SOCKET LOGIC WITH ADMIN SECURITY ---
        io.on('connection', (socket) => {
            socket.on('join room', async ({ username, room }) => {
                const user = await usersCol.findOne({ username });
                if (!user) return;

                let targetRoom = room;
                // SECURITY: If not admin, force them to their assigned room
                if (user.role !== 'super') {
                    targetRoom = user.assignedRoom;
                }

                // Leave old rooms
                Array.from(socket.rooms).forEach(r => {
                    if (r !== socket.id) socket.leave(r);
                });

                socket.join(targetRoom);
                console.log(`${username} joined ${targetRoom}`);

                const history = await messagesCol.find({ room: targetRoom })
                    .sort({ _id: -1 }).limit(50).toArray();
                socket.emit('load history', history.reverse());
            });

            socket.on('chat message', async (data) => {
                const msg = { ...data, time: new Date() };
                await messagesCol.insertOne(msg);
                io.to(data.room).emit('chat message', msg);
            });
        });

        const PORT = process.env.PORT || 3000;
        http.listen(PORT, () => console.log(`Server Live on ${PORT}`));
    } catch (err) { console.error(err); }
}
startServer();
