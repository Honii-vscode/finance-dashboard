#!/bin/bash
# 金融看板24小时运行保障脚本

SERVER_DIR="/root/.openclaw/workspace/finance-dashboard-v2"
SERVER_FILE="server-tencent-finance.js"
LOG_FILE="tencent-server-24h.log"
PID_FILE="server-24h.pid"
PORT=3000

cd "$SERVER_DIR"

# 清理旧进程
cleanup() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] 清理旧进程..." >> "$LOG_FILE"
    pkill -f "$SERVER_FILE" 2>/dev/null || true
    sleep 2
}

# 检查端口是否被占用
check_port() {
    if netstat -tln | grep -q ":$PORT "; then
        return 0  # 端口被占用
    else
        return 1  # 端口空闲
    fi
}

# 检查服务是否响应
check_health() {
    if curl -s --max-time 5 "http://43.156.96.119:$PORT/api/health" > /dev/null 2>&1; then
        return 0  # 健康
    else
        return 1  # 不健康
    fi
}

# 启动服务器
start_server() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] 启动服务器..." >> "$LOG_FILE"
    nohup node "$SERVER_FILE" >> "$LOG_FILE" 2>&1 &
    SERVER_PID=$!
    echo "$SERVER_PID" > "$PID_FILE"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] 服务器启动成功，PID: $SERVER_PID" >> "$LOG_FILE"
    
    # 等待服务器启动
    for i in {1..30}; do
        if check_health; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] 服务器健康检查通过" >> "$LOG_FILE"
            return 0
        fi
        sleep 1
    done
    
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] 服务器启动超时" >> "$LOG_FILE"
    return 1
}

# 主函数
main() {
    echo "=========================================" >> "$LOG_FILE"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [START] 金融看板24小时保障脚本启动" >> "$LOG_FILE"
    
    # 设置退出时清理
    trap 'echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] 脚本退出，清理进程..." >> "$LOG_FILE"; cleanup; exit 0' EXIT
    
    # 初始清理
    cleanup
    
    # 主监控循环
    while true; do
        CURRENT_TIME=$(date '+%H:%M')
        
        # 检查服务健康
        if ! check_health; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') [WARN] 服务不健康，重启..." >> "$LOG_FILE"
            cleanup
            if ! start_server; then
                echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] 服务器启动失败，等待重试..." >> "$LOG_FILE"
                sleep 30
                continue
            fi
        else
            # 每5分钟记录一次健康状态
            if [[ "$CURRENT_TIME" =~ :[0-5]0$ ]]; then
                echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] 服务运行正常" >> "$LOG_FILE"
            fi
        fi
        
        # 每天凌晨清理日志（保留7天）
        if [[ "$CURRENT_TIME" == "03:00" ]]; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] 执行日常维护..." >> "$LOG_FILE"
            find "$SERVER_DIR" -name "*.log" -mtime +7 -delete
        fi
        
        sleep 30  # 每30秒检查一次
    done
}

# 运行主函数
main "$@"