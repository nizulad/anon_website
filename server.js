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
        
        // We define the DB name here so we can log it easily
        const dbName = 'Chatapp'; 
        const db = client.db(dbName);
        const usersCol = db.collection('Users');
        const messagesCol = db.collection('Messages');

        console.log("--- DATABASE DEBUG INFO ---");
        console.log(`Connected to: ${dbName}`);
        
        // Let's see what collections actually exist
        const collections = await db.listCollections().toArray();
        console.log("Collections found in DB:", collections.map(c => c.name));

        // Count how many users are in the 'users' collection
        const userCount = await usersCol.countDocuments();
        console.log(`Number of documents in 'users' collection: ${userCount}`);
        console.log("---------------------------");

        app.post('/login', async (req, res) => {
            const { username, password } = req.body;
            
            // Debug the incoming text
            console.log(`Login Attempt -> User: [${username}], Pass: [${password}]`);

            // Find the user
            const user = await usersCol.findOne({ 
                username: username, 
                password: password 
            });

            if (!user) {
                console.log(`FAILED: No match for [${username}] in collection [${usersCol.collectionName}]`);
                return res.status(401).json({ error: "Invalid username or password" });
            }

            if (user.status === 'pending') {
                return res.status(403).json({ error: "Wait for admin approval" });
            }

            console.log(`SUCCESS: Found ${user.username}`);
            res.json({
                username: user.username,
                role: user.role,
                color: user.color,
                room: user.assignedRoom
            });
        });

        // --- Rest of your routes (Signup, Admin, Sockets) stay the same ---
        app.post('/signup', async (req, res) => {
            const { username, password } = req.body;
            const exists = await usersCol.findOne({ username });
            if (exists) return res.status(400).json({ error: "Username taken" });
            await usersCol.insertOne({
                username, password, role: 'user', status: 'pending',
                assignedRoom: null, color: `#${Math.floor(Math.random()*16777215).toString(16)}`
            });
            res.json({ message: "Request sent!" });
        });

        app.get('/admin/pending', async (req, res) => {
            const pending = await usersCol.find({ status: 'pending' }).toArray();
            res.json(pending);
        });

        app.post('/admin/approve', async (req, res) => {
            const { username, room } = req.body;
            await usersCol.updateOne({ username }, { $set: { status: 'approved', assignedRoom: room } });
            res.json({ success: true });
        });

        io.on('connection', (socket) => {
            socket.on('join room', async ({ username, room }) => {
                if(!room) return;
                socket.join(room);
                const history = await messagesCol.find({ room }).sort({ _id: -1 }).limit(50).toArray();
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

    } catch (err) {
        console.error("Critical Server Error:", err);
    }
}

startServer();
