#!/bin/bash
# 金融看板保持活跃脚本

SERVER_DIR="/root/.openclaw/workspace/finance-dashboard-v2"
LOG_FILE="$SERVER_DIR/keep-alive.log"
PID_FILE="$SERVER_DIR/server.pid"

cd "$SERVER_DIR"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

check_server() {
    # 检查进程
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            # 检查HTTP服务
            if curl -s --max-time 3 "http://localhost:3000/api/health" > /dev/null; then
                return 0  # 正常
            fi
        fi
    fi
    return 1  # 需要重启
}

start_server() {
    log "启动服务器..."
    pkill -f "server-tencent-finance.js" 2>/dev/null || true
    sleep 2
    nohup node server-tencent-finance.js > "$SERVER_DIR/server-output.log" 2>&1 &
    echo $! > "$PID_FILE"
    log "服务器启动，PID: $!"
    
    # 等待启动
    for i in {1..20}; do
        if curl -s --max-time 3 "http://localhost:3000/api/health" > /dev/null; then
            log "服务器启动成功"
            return 0
        fi
        sleep 1
    done
    log "服务器启动失败"
    return 1
}

# 主循环
log "=== 金融看板保持活跃脚本启动 ==="

while true; do
    if ! check_server; then
        log "检测到服务器异常，重启..."
        start_server
    fi
    
    # 每30秒检查一次
    sleep 30
done