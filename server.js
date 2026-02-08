const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

const path = require('path');

// 存储所有房间
const rooms = {};

// 提供静态文件
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/test', (req, res) => {
    res.send('Server is working!');
});

// 创建房间API
app.get('/create-room', (req, res) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
        players: {},
        gameState: {
            player1: {
                energy: 0,
                lastAction: null,
                currentChoice: null,
                usedShieldLastTurn: false
            },
            player2: {
                energy: 0,
                lastAction: null,
                currentChoice: null,
                usedShieldLastTurn: false
            },
            round: 0,
            gameOver: false,
            winner: null
        }
    };
    
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://${req.get('host')}`;
    
    res.json({
        roomId: roomId,
        player1Link: `${baseUrl}/game.html?room=${roomId}&player=1`,
        player2Link: `${baseUrl}/game.html?room=${roomId}&player=2`
    });
});

// Socket.io 连接处理
io.on('connection', (socket) => {
    console.log('玩家连接:', socket.id);
    
    socket.on('join-room', (data) => {
        const { roomId, playerId } = data;
        
        if (rooms[roomId]) {
            socket.join(roomId);
            rooms[roomId].players[playerId] = socket.id;
            
            console.log(`玩家${playerId}加入房间${roomId}`);
            
            // 发送当前游戏状态
            socket.emit('game-state', rooms[roomId].gameState);
            
            // 通知房间内所有玩家
            io.to(roomId).emit('player-joined', {
                playerId: playerId,
                playerCount: Object.keys(rooms[roomId].players).length
            });
            
            // 如果两个玩家都到齐了，开始游戏
            if (Object.keys(rooms[roomId].players).length === 2) {
                io.to(roomId).emit('game-start');
            }
        }
    });
    
    // 玩家选择行动
    socket.on('choose-action', (data) => {
        const { roomId, playerId, action } = data;
        const room = rooms[roomId];
        
        if (!room || room.gameState.gameOver) return;
        
        const playerKey = `player${playerId}`;
        const gameState = room.gameState;
        
        // 验证行动是否合法
        if (action === 'attack' && gameState[playerKey].energy < 1) {
            socket.emit('invalid-action', { message: '能量不足！需要1点能量才能使用针' });
            return;
        }
        
        if (action === 'shield' && gameState[playerKey].usedShieldLastTurn) {
            socket.emit('invalid-action', { message: '护盾冷却中！不能连续使用护盾' });
            return;
        }
        
        // 记录玩家选择
        gameState[playerKey].currentChoice = action;
        
        // 通知该玩家已确认选择
        socket.emit('choice-confirmed', { action });
        
        // 通知对方玩家有人已经选择（但不告诉选了什么）
        socket.to(roomId).emit('opponent-chose');
        
        // 检查是否双方都选择了
        const player1Chose = gameState.player1.currentChoice !== null;
        const player2Chose = gameState.player2.currentChoice !== null;
        
        if (player1Chose && player2Chose) {
            // 结算回合
            resolveRound(roomId);
        }
    });
    
    // 重启游戏
    socket.on('restart-game', (data) => {
        const { roomId } = data;
        const room = rooms[roomId];
        
        if (!room) return;
        
        // 重置游戏状态
        room.gameState = {
            player1: {
                energy: 0,
                lastAction: null,
                currentChoice: null,
                usedShieldLastTurn: false
            },
            player2: {
                energy: 0,
                lastAction: null,
                currentChoice: null,
                usedShieldLastTurn: false
            },
            round: 0,
            gameOver: false,
            winner: null
        };
        
        // 通知所有玩家游戏重启
        io.to(roomId).emit('game-restarted', room.gameState);
    });
    
    socket.on('disconnect', () => {
        console.log('玩家断开:', socket.id);
        // 找到玩家所在的房间并通知
        for (const roomId in rooms) {
            const room = rooms[roomId];
            for (const playerId in room.players) {
                if (room.players[playerId] === socket.id) {
                    socket.to(roomId).emit('player-disconnected', { playerId });
                    delete room.players[playerId];
                }
            }
        }
    });
});

// 结算回合
function resolveRound(roomId) {
    const room = rooms[roomId];
    const gameState = room.gameState;
    
    const p1Action = gameState.player1.currentChoice;
    const p2Action = gameState.player2.currentChoice;
    
    gameState.round++;
    
    // 记录本回合行动
    gameState.player1.lastAction = p1Action;
    gameState.player2.lastAction = p2Action;
    
    let result = {
        round: gameState.round,
        player1Action: p1Action,
        player2Action: p2Action,
        player1Energy: gameState.player1.energy,
        player2Energy: gameState.player2.energy,
        message: ''
    };
    
    // 先扣除攻击的能量
    if (p1Action === 'attack') gameState.player1.energy -= 1;
    if (p2Action === 'attack') gameState.player2.energy -= 1;
    
    // 结算逻辑
    if (p1Action === 'bubble' && p2Action === 'attack') {
        // 玩家2获胜
        gameState.gameOver = true;
        gameState.winner = 2;
        result.message = '玩家2的针刺破了玩家1的泡泡！玩家2获胜！';
    } else if (p1Action === 'attack' && p2Action === 'bubble') {
        // 玩家1获胜
        gameState.gameOver = true;
        gameState.winner = 1;
        result.message = '玩家1的针刺破了玩家2的泡泡！玩家1获胜！';
    } else if (p1Action === 'attack' && p2Action === 'attack') {
        // 双方针对冲，无事发生
        result.message = '双方的针互相抵消！';
    } else if (p1Action === 'attack' && p2Action === 'shield') {
        // 护盾防御成功
        result.message = '玩家2的护盾挡住了玩家1的攻击！';
    } else if (p1Action === 'shield' && p2Action === 'attack') {
        // 护盾防御成功
        result.message = '玩家1的护盾挡住了玩家2的攻击！';
    } else if (p1Action === 'bubble' && p2Action === 'bubble') {
        // 双方都吹泡泡
        gameState.player1.energy += 1;
        gameState.player2.energy += 1;
        result.message = '双方都在积攒能量！';
    } else if (p1Action === 'bubble' && p2Action === 'shield') {
        // 玩家1吹泡泡，玩家2举盾
        gameState.player1.energy += 1;
        result.message = '玩家1积攒能量，玩家2防御！';
    } else if (p1Action === 'shield' && p2Action === 'bubble') {
        // 玩家1举盾，玩家2吹泡泡
        gameState.player2.energy += 1;
        result.message = '玩家2积攒能量，玩家1防御！';
    } else if (p1Action === 'shield' && p2Action === 'shield') {
        // 双方都举盾
        result.message = '双方都在防御！';
    }
    
    // 更新护盾冷却状态
    gameState.player1.usedShieldLastTurn = (p1Action === 'shield');
    gameState.player2.usedShieldLastTurn = (p2Action === 'shield');
    
    // 清除本回合选择
    gameState.player1.currentChoice = null;
    gameState.player2.currentChoice = null;
    
    // 更新结果中的能量
    result.player1Energy = gameState.player1.energy;
    result.player2Energy = gameState.player2.energy;
    result.gameOver = gameState.gameOver;
    result.winner = gameState.winner;
    
    // 发送结算结果给所有玩家
    io.to(roomId).emit('round-result', result);
    
    // 发送更新后的游戏状态
    io.to(roomId).emit('game-state', gameState);
}

// 生成随机房间ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', (err) => {
    if (err) {
        console.error('Server failed to start:', err);
        return;
    }
    console.log(`✅ Server is running!`);
    console.log(`📍 Open your browser and visit: http://localhost:${PORT}`);
    console.log(`📁 Serving files from: ${path.join(__dirname, 'public')}`);
});
