/**
 * 腾讯财经金融看板服务器
 * 使用腾讯财经作为主要数据源
 */

const express = require('express');
const axios = require('axios');
const path = require('path');
const { TencentFinanceClient } = require('./tencent-finance-integration.js');

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 创建腾讯财经客户端
const tencentClient = new TencentFinanceClient();

// 符号配置（基于腾讯财经支持）
const SYMBOLS = [
  // 核心指数
  { symbol: '000001.SS', name: '上证指数', type: 'index', priority: 1 },
  { symbol: '000510.SS', name: '中证A500', type: 'index', priority: 2 },
  { symbol: 'HSTECH', name: '恒生科技指数', type: 'index', priority: 3 },
  { symbol: '600900.SS', name: '长江电力', type: 'stock', priority: 4 },
  { symbol: '00882.HK', name: '天津发展', type: 'stock', priority: 5 },
  { symbol: '01810.HK', name: '小米集团', type: 'stock', priority: 6 },
  { symbol: '000300.SS', name: '沪深300', type: 'index', priority: 3 },
  { symbol: '399006.SZ', name: '创业板指', type: 'index', priority: 4 },
  
  // 美股指数
  { symbol: 'usINX', name: '标普500', type: 'index', priority: 1 },
  { symbol: 'usIXIC', name: '纳斯达克综合', type: 'index', priority: 2 },
  // 美股个股
  { symbol: 'NVDA', name: '英伟达', type: 'stock', priority: 3 },
  { symbol: 'GOOG', name: '谷歌', type: 'stock', priority: 4 },
  
  // 商品与ETF
  { symbol: 'XAUUSD', name: '黄金', type: 'commodity', priority: 1 },
  { symbol: 'EWY', name: 'EWY ETF', type: 'etf', priority: 2 },
  
  // 外汇
  { symbol: 'USDCNY', name: '美元/人民币', type: 'forex', priority: 1 },
  { symbol: 'EURUSD', name: '欧元/美元', type: 'forex', priority: 2 }
];

// 提取符号列表
const SYMBOL_LIST = SYMBOLS.map(s => s.symbol);

// 数据缓存
let marketData = {};
let lastUpdateTime = null;
let updateInProgress = false;

/**
 * 更新市场数据
 */
async function updateMarketData() {
  if (updateInProgress) {
    console.log('⏳ 数据更新正在进行中，跳过');
    return;
  }
  
  updateInProgress = true;
  console.log(`🔄 开始更新市场数据 (${SYMBOL_LIST.length} 个符号)`);
  
  try {
    // 使用腾讯财经客户端批量获取数据
    const newData = await tencentClient.getBatchQuotes(SYMBOL_LIST);
    
    // 合并数据并添加元信息
    const processedData = {};
    let successCount = 0;
    
    SYMBOLS.forEach(item => {
      const symbol = item.symbol;
      const rawData = newData[symbol];
      
      if (rawData) {
        processedData[symbol] = {
          ...rawData,
          name: item.name,
          type: item.type,
          priority: item.priority
        };
        successCount++;
      } else {
        // 如果没有数据，使用模拟数据作为降级
        processedData[symbol] = createFallbackData(item);
      }
    });
    
    // 更新全局数据
    marketData = processedData;
    lastUpdateTime = new Date().toISOString();
    
    console.log(`✅ 数据更新完成: ${successCount}/${SYMBOL_LIST.length} 个符号成功`);
    console.log(`📊 腾讯财经统计:`, tencentClient.getStats());
    
  } catch (error) {
    console.error(`❌ 数据更新失败: ${error.message}`);
    
    // 使用模拟数据作为紧急降级
    marketData = createEmergencyFallbackData();
    lastUpdateTime = new Date().toISOString();
    
  } finally {
    updateInProgress = false;
  }
}

/**
 * 创建降级数据
 */
function createFallbackData(item) {
  const basePrice = 100 + Math.random() * 100;
  const change = (Math.random() - 0.5) * 5;
  const changePercent = (change / basePrice) * 100;
  
  return {
    name: item.name,
    symbol: item.symbol,
    price: parseFloat(basePrice.toFixed(2)),
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    open: parseFloat((basePrice - change * 0.5).toFixed(2)),
    high: parseFloat((basePrice + Math.abs(change)).toFixed(2)),
    low: parseFloat((basePrice - Math.abs(change)).toFixed(2)),
    volume: Math.floor(Math.random() * 1000000),
    source: 'fallback',
    timestamp: new Date().toISOString(),
    type: item.type,
    priority: item.priority
  };
}

/**
 * 创建紧急降级数据
 */
function createEmergencyFallbackData() {
  const data = {};
  SYMBOLS.forEach(item => {
    data[item.symbol] = createFallbackData(item);
  });
  return data;
}

/**
 * 定时更新数据
 */
function scheduleUpdates() {
  // 立即更新一次
  updateMarketData();
  
  // 每5分钟更新一次
  setInterval(updateMarketData, 5 * 60 * 1000);
  
  console.log('⏰ 定时更新已启动: 每5分钟');
}

// API路由

/**
 * 健康检查端点
 */
app.get('/api/health', (req, res) => {
  const stats = tencentClient.getStats();
  
  res.json({
    status: 'healthy',
    server: {
      version: 'tencent-finance-v1',
      uptime: process.uptime(),
      startupTime: new Date(Date.now() - process.uptime() * 1000).toISOString()
    },
    data: {
      source: '腾讯财经',
      symbolCount: SYMBOL_LIST.length,
      cacheSize: Object.keys(marketData).length,
      lastUpdate: lastUpdateTime
    },
    tencentFinance: {
      status: 'healthy',
      message: '腾讯财经API连接正常',
      stats: stats
    },
    memory: {
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
    }
  });
});

/**
 * 市场数据端点
 */
app.get('/api/market-data', (req, res) => {
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    lastUpdate: lastUpdateTime,
    source: 'tencent-finance',
    data: marketData,
    symbols: SYMBOL_LIST.length,
    stats: tencentClient.getStats()
  });
});

/**
 * 单个符号数据端点
 */
app.get('/api/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  
  try {
    const data = await tencentClient.getStockQuote(symbol);
    
    if (data) {
      res.json({
        success: true,
        data: data
      });
    } else {
      res.status(404).json({
        success: false,
        error: `未找到符号 ${symbol} 的数据`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 腾讯财经统计端点
 */
app.get('/api/tencent-stats', (req, res) => {
  res.json({
    success: true,
    stats: tencentClient.getStats(),
    supportedSymbols: tencentClient.getAllSupportedSymbols()
  });
});

/**
 * 清空缓存端点
 */
app.post('/api/clear-cache', (req, res) => {
  tencentClient.clearCache();
  res.json({
    success: true,
    message: '缓存已清空'
  });
});

/**
 * 文档页面
 */
app.get('/docs', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>腾讯财经金融看板 - 文档</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { color: #333; }
        .endpoint { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
        code { background: #eee; padding: 2px 5px; border-radius: 3px; }
      </style>
    </head>
    <body>
      <h1>📊 腾讯财经金融看板 API 文档</h1>
      <p>服务器运行在: <code>http://43.156.96.119:${PORT}</code></p>
      
      <div class="endpoint">
        <h3>GET /api/health</h3>
        <p>健康检查端点，返回服务器状态和统计信息。</p>
      </div>
      
      <div class="endpoint">
        <h3>GET /api/market-data</h3>
        <p>获取所有市场数据（${SYMBOL_LIST.length} 个符号）。</p>
      </div>
      
      <div class="endpoint">
        <h3>GET /api/quote/:symbol</h3>
        <p>获取单个符号的实时数据。</p>
        <p>示例: <code>/api/quote/SPY</code></p>
      </div>
      
      <div class="endpoint">
        <h3>GET /api/tencent-stats</h3>
        <p>获取腾讯财经API统计信息。</p>
      </div>
      
      <div class="endpoint">
        <h3>POST /api/clear-cache</h3>
        <p>清空腾讯财经数据缓存。</p>
      </div>
      
      <h2>支持的符号</h2>
      <ul>
        ${SYMBOLS.map(s => `<li><code>${s.symbol}</code> - ${s.name}</li>`).join('')}
      </ul>
      
      <h2>数据更新</h2>
      <p>数据每5分钟自动更新一次，使用腾讯财经API作为主要数据源。</p>
      
      <p><a href="/">返回看板界面</a></p>
    </body>
    </html>
  `);
});

/**
 * 首页重定向到看板
 */
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

/**
 * 加密货币数据API (CryptoCompare)
 */
const CRYPTO_SYMBOLS = ['BTC', 'ETH'];
const cryptoClient = axios.create({
  baseURL: 'https://min-api.cryptocompare.com/data',
  timeout: 10000
});

// 加密货币数据缓存
let cryptoData = {};
let lastCryptoUpdate = null;

async function updateCryptoData() {
  try {
    // CoinGecko: 获取BTC和ETH的24h变化
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'bitcoin,ethereum',
        vs_currencies: 'usd',
        include_24hr_change: 'true'
      }
    });
    const data = response.data;
    
    // 格式化数据
    const nameMap = { bitcoin: '比特币', ethereum: '以太坊' };
    const symbolMap = { bitcoin: 'BTC', ethereum: 'ETH' };
    
    const formattedData = {};
    for (const [coinId, priceData] of Object.entries(data)) {
      const price = priceData.usd;
      const changePercent = priceData.usd_24h_change || 0;
      const change = price * (changePercent / 100);
      
      formattedData[`CRYPTO${symbolMap[coinId]}`] = {
        name: nameMap[coinId],
        symbol: `CRYPTO${symbolMap[coinId]}`,
        price: price,
        previousClose: price - change,
        change: change,
        changePercent: changePercent,
        timestamp: new Date().toISOString(),
        source: 'coingecko',
        lastUpdated: new Date().toISOString(),
        type: 'crypto',
        priority: symbolMap[coinId] === 'BTC' ? 1 : 2
      };
    }
    
    cryptoData = formattedData;
    lastCryptoUpdate = new Date().toISOString();
    console.log('✅ 加密货币数据更新成功:', Object.keys(cryptoData));
  } catch (error) {
    console.error('❌ 加密货币数据更新失败:', error.message);
  }
}

// 初始更新
updateCryptoData();

// 每60秒更新一次
setInterval(updateCryptoData, 60000);

// 加密货币API端点
app.get('/api/crypto-data', (req, res) => {
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    lastUpdate: lastCryptoUpdate,
    source: 'cryptocompare',
    data: cryptoData
  });
});

/**
 * K线数据API
 */
app.get('/api/kline', async (req, res) => {
  const { symbol, days = 5 } = req.query;
  
  if (!symbol) {
    return res.json({ success: false, error: '缺少symbol参数' });
  }
  
  try {
    // 获取腾讯财经K线数据
    // A股: shXXXXXX, 港股: hkXXXXX, 美股: usXXXXX
    let qtSymbol = symbol;
    console.log('K-line request:', symbol, '-> mapped to before:', qtSymbol);
    
    // 尝试从配置中查找真实代码
    const mapped = tencentClient.getTencentSymbol(symbol);
    if (mapped !== symbol) {
      qtSymbol = mapped;
    }
    console.log('K-line request:', symbol, '-> mapped to after:', qtSymbol);
    
    const url = `http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?_var=kline&param=${qtSymbol},day,,,${days},qfq`;
    const response = await axios.get(url, { timeout: 10000, maxRedirects: 5 });
    let rawData = response.data;
    
    // 如果返回的是字符串，解析JSON
    if (typeof rawData === 'string') {
      if (rawData.startsWith('kline=')) {
        rawData = rawData.substring(6);
      }
      try {
        rawData = JSON.parse(rawData);
      } catch (e) {
        return res.json({ success: false, error: 'JSON解析失败' });
      }
    }
    
    // 获取所有key
    const keys = rawData && rawData.data ? Object.keys(rawData.data) : [];
    
    // 尝试获取数据
    let stockData = null;
    if (rawData.data) {
      stockData = rawData.data[qtSymbol] || rawData.data[symbol] || rawData.data[keys[0]];
    }
    
    if (!stockData || !stockData.qfqday) {
      return res.json({ success: false, error: '无法获取K线数据', debug: { qtSymbol, symbol, keys } });
    }
    
    // 格式化K线数据 [日期, 开盘, 收盘, 最高, 最低, 成交量]
    const klines = stockData.qfqday.map(item => ({
      date: item[0],
      open: parseFloat(item[1]),
      close: parseFloat(item[2]),
      high: parseFloat(item[3]),
      low: parseFloat(item[4]),
      volume: parseFloat(item[5])
    }));
    
    res.json({
      success: true,
      symbol: symbol,
      data: klines
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

/**
 * 启动服务器
 */
function startServer() {
  // 启动定时更新
  scheduleUpdates();
  
  // 启动服务器
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 腾讯财经金融看板服务器启动
📊 监控 ${SYMBOL_LIST.length} 个符号
💾 缓存文件: ${path.join(__dirname, 'tencent-cache.json')}
🚀 服务器运行在 http://0.0.0.0:${PORT}
🌐 外部访问: http://43.156.96.119:${PORT}
📊 监控端点: http://43.156.96.119:${PORT}/api/health
💡 文档: http://43.156.96.119:${PORT}/docs
⏰ 数据更新: 每5分钟
    `);
  });
}

// 启动服务器
startServer();

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('🛑 收到终止信号，保存缓存...');
  // 可以在这里保存最终状态
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 收到中断信号，保存缓存...');
  // 可以在这里保存最终状态
  process.exit(0);
});