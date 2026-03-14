import re

with open('server-optimized-full.js', 'r') as f:
    content = f.read()

# 找到 symbols 配置部分
pattern = r'symbols: \[[\s\S]*?\],'
new_symbols = '''  symbols: [
    // iTick 可用的符号
    { symbol: '3067.HK', name: '恒生科技ETF', source: 'itick', priority: 1 },
    { symbol: '9878.HK', name: '港股9878', source: 'itick', priority: 2 },
    
    // iTick 优势领域（外汇/贵金属）
    { symbol: 'EURUSD', name: '欧元/美元', source: 'itick', priority: 1 },
    { symbol: 'GBPUSD', name: '英镑/美元', source: 'itick', priority: 2 },
    { symbol: 'USDJPY', name: '美元/日元', source: 'itick', priority: 3 },
    { symbol: 'USDCNY', name: '美元/人民币', source: 'itick', priority: 4 },
    { symbol: 'XAUUSD', name: '黄金', source: 'itick', priority: 1 },
    { symbol: 'XAGUSD', name: '白银', source: 'itick', priority: 2 },
    
    // 需要 Yahoo Finance 的指数
    { symbol: '000001.SS', name: '上证指数', source: 'yahoo', priority: 1 },
    { symbol: '^GSPC', name: '标普500', source: 'yahoo', priority: 1 },
    { symbol: '^IXIC', name: '纳斯达克', source: 'yahoo', priority: 2 },
    { symbol: '^DJI', name: '道琼斯', source: 'yahoo', priority: 3 },
    
    // 需要 Yahoo Finance 的股票
    { symbol: 'AAPL', name: '苹果', source: 'yahoo', priority: 1 },
    { symbol: 'GOOGL', name: '谷歌', source: 'yahoo', priority: 2 },
    { symbol: 'MSFT', name: '微软', source: 'yahoo', priority: 3 },
    { symbol: 'TSLA', name: '特斯拉', source: 'yahoo', priority: 4 },
    
    // 需要 Yahoo Finance 的加密货币
    { symbol: 'BTC-USD', name: '比特币', source: 'yahoo', priority: 1 },
    { symbol: 'ETH-USD', name: '以太坊', source: 'yahoo', priority: 2 }
  ],'''

# 替换 symbols 配置
new_content = re.sub(pattern, new_symbols, content)

with open('server-optimized-full.js', 'w') as f:
    f.write(new_content)

print('✅ 配置已修复')
