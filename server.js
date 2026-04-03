const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// 1. This is your "Database" for now (it stays in RAM)
let convoHistory = []; 

io.on('connection', (socket) => {
    const userId = "User-" + Math.floor(Math.random() * 9999);
    
    // 2. When someone connects, send them the existing "convo"
    socket.emit('load history', convoHistory);

    socket.on('chat message', (msg) => {
        const messageData = { id: userId, text: msg };
        
        // 3. Store the message in the array
        convoHistory.push(messageData);
        
        // Limit history to 100 messages so it doesn't get too heavy
        if (convoHistory.length > 100) convoHistory.shift();

        io.emit('chat message', messageData);
    });
});
const PORT = process.env.PORT || 3000 ;
http.listen(PORT, () => {
    console.log('Server is running on port ${PORT}');
});
