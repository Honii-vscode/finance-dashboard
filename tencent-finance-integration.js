/**
 * 腾讯财经数据集成模块
 * 使用腾讯财经API获取实时市场数据
 * API格式: https://qt.gtimg.cn/q=股票代码
 */

const axios = require('axios');
const iconv = require('iconv-lite');
const fs = require('fs');
const path = require('path');

// 腾讯财经配置
const TENCENT_FINANCE_CONFIG = {
  baseUrl: 'https://qt.gtimg.cn',
  timeout: 10000,
  
  // 符号映射表（腾讯财经格式）
  symbolMapping: {
    // A股
    '000001.SS': 'sh000001',  // 上证指数
    '000510.SS': 'sh000510',  // 中证A500
    '600900.SS': 'sh600900',  // 长江电力
    // 港股
    '01810.HK': 'hk01810',    // 小米集团
    '00882.HK': 'hk00882',    // 天津发展
    // 美股指数
    'usINX': 'usINX',         // 标普500
    'usIXIC': 'usIXIC',      // 纳斯达克综合
    // 美股个股
    'NVDA': 'usNVDA',        // 英伟达
    'GOOG': 'usGOOG',        // 谷歌
    
    '399001.SZ': 'sz399001',  // 深证成指
    '000300.SS': 'sh000300',  // 沪深300
    '399006.SZ': 'sz399006',  // 创业板指
    
    // 港股
    '0700.HK': 'hk00700',     // 腾讯控股
    '9988.HK': 'hk09988',     // 阿里巴巴
    '3690.HK': 'hk03690',     // 美团
    'HSTECH': 'hkHSTECH',     // 恒生科技指数
    
    // 美股（腾讯财经格式）
    'SPY': 'usSPY',           // 标普500 ETF
    'QQQ': 'usQQQ',           // 纳斯达克100 ETF
    'DIA': 'usDIA',           // 道琼斯ETF
    'EWY': 'usEWY',           // 韩国ETF-iShares MSCI
    'AAPL': 'usAAPL',         // 苹果
    'MSFT': 'usMSFT',         // 微软
    'GOOGL': 'usGOOGL',       // 谷歌
    'AMZN': 'usAMZN',         // 亚马逊
    'TSLA': 'usTSLA',         // 特斯拉
    'NVDA': 'usNVDA',         // 英伟达
    'META': 'usFB',           // Meta (Facebook)
    'JPM': 'usJPM',           // 摩根大通
    'BAC': 'usBAC',           // 美国银行
    'WFC': 'usWFC',           // 富国银行
    
    // 中国概念股
    'BABA': 'usBABA',         // 阿里巴巴
    'PDD': 'usPDD',           // 拼多多
    'JD': 'usJD',             // 京东
    'BIDU': 'usBIDU',         // 百度
    'NIO': 'usNIO',           // 蔚来
    
    // 外汇和商品
    'EURUSD': 'fx_sEURUSD',   // 欧元/美元
    'GBPUSD': 'fx_sGBPUSD',   // 英镑/美元
    'USDJPY': 'fx_sUSDJPY',   // 美元/日元
    'USDCNY': 'fx_sUSDCNY',   // 美元/人民币
    'XAUUSD': 'hf_XAU',       // 黄金
    'XAGUSD': 'hf_XAG',       // 白银
    'CL': 'hf_CL',            // 原油
  },
  
  // 缓存配置
  cache: {
    enabled: true,
    memoryTTL: 60 * 1000,     // 1分钟内存缓存
    diskTTL: 5 * 60 * 1000,   // 5分钟磁盘缓存
    cacheFile: path.join(__dirname, 'tencent-cache.json')
  },
  
  // 请求配置
  request: {
    batchSize: 10,            // 批量请求大小
    delayBetweenBatches: 100, // 批次间延迟(ms)
    maxRetries: 3,            // 最大重试次数
    retryDelay: 1000          // 重试延迟(ms)
  }
};

// 内存缓存
const memoryCache = new Map();

class TencentFinanceClient {
  constructor(config = {}) {
    this.config = { ...TENCENT_FINANCE_CONFIG, ...config };
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      lastUpdate: null
    };
    
    // 加载磁盘缓存
    this.loadDiskCache();
  }
  
  /**
   * 加载磁盘缓存
   */
  loadDiskCache() {
    try {
      if (fs.existsSync(this.config.cache.cacheFile)) {
        const cacheData = JSON.parse(fs.readFileSync(this.config.cache.cacheFile, 'utf8'));
        const now = Date.now();
        
        // 检查缓存是否过期
        if (cacheData.timestamp && (now - cacheData.timestamp) < this.config.cache.diskTTL) {
          for (const [symbol, data] of Object.entries(cacheData.data || {})) {
            memoryCache.set(symbol, {
              data,
              timestamp: cacheData.timestamp
            });
          }
          console.log(`💾 腾讯财经缓存加载: ${Object.keys(cacheData.data || {}).length} 个符号`);
        }
      }
    } catch (error) {
      console.log(`⚠️ 加载腾讯财经缓存失败: ${error.message}`);
    }
  }
  
  /**
   * 保存磁盘缓存
   */
  saveDiskCache(data) {
    try {
      const cacheData = {
        timestamp: Date.now(),
        data: data
      };
      fs.writeFileSync(this.config.cache.cacheFile, JSON.stringify(cacheData, null, 2));
      console.log(`💾 腾讯财经缓存保存: ${Object.keys(data).length} 个符号`);
    } catch (error) {
      console.log(`⚠️ 保存腾讯财经缓存失败: ${error.message}`);
    }
  }
  
  /**
   * 获取腾讯财经格式的符号
   */
  getTencentSymbol(symbol) {
    return this.config.symbolMapping[symbol] || symbol;
  }
  
  /**
   * 解析腾讯财经数据
   */
  parseTencentData(rawData, originalSymbol) {
    if (!rawData || !rawData.includes('=')) {
      return null;
    }
    
    try {
      // 解析数据格式: v_symbol="field1~field2~field3..." 或 v_symbol="field1,field2,field3..."
      const dataStr = rawData.split('=')[1].trim().replace(/"/g, '');
      
      // 判断分隔符类型
      let parts;
      let isCommaSeparated = false;
      
      if (dataStr.includes(',')) {
        // 逗号分隔符（用于黄金、外汇等）
        parts = dataStr.split(',');
        isCommaSeparated = true;
      } else if (dataStr.includes('~')) {
        // 波浪号分隔符（用于股票）
        parts = dataStr.split('~');
      } else {
        return null;
      }
      
      let result;
      
      if (isCommaSeparated && parts.length >= 14) {
        // 黄金/外汇数据格式（逗号分隔，14个字段）
        // 字段映射: 0=当前价, 1=涨跌, 2=今开, 3=昨收, 4=最高, 5=最低, 6=时间, 7=买一, 8=卖一, 9-11=未知, 12=日期, 13=名称
        result = {
          name: parts[13]?.replace(/;$/, '') || originalSymbol, // 去掉末尾分号
          symbol: originalSymbol,
          price: parseFloat(parts[0]) || 0,
          previousClose: parseFloat(parts[3]) || 0,
          open: parseFloat(parts[2]) || 0,
          high: parseFloat(parts[4]) || 0,
          low: parseFloat(parts[5]) || 0,
          volume: 0, // 黄金数据无成交量
          turnover: 0, // 黄金数据无成交额
          change: parseFloat(parts[1]) || 0,
          changePercent: 0, // 需要计算
          timestamp: `${parts[12] || ''} ${parts[6] || ''}`.trim(),
          source: 'tencent-finance',
          lastUpdated: new Date().toISOString()
        };
        
        // 计算涨跌幅
        if (result.previousClose > 0) {
          result.changePercent = (result.change / result.previousClose) * 100;
        }
        
      } else if (!isCommaSeparated && parts.length >= 40) {
        // 股票数据格式（波浪号分隔，40+个字段）
        result = {
          name: parts[1] || originalSymbol,
          symbol: originalSymbol,
          price: parseFloat(parts[3]) || 0,
          previousClose: parseFloat(parts[4]) || 0,
          open: parseFloat(parts[5]) || 0,
          high: parseFloat(parts[33]) || 0,
          low: parseFloat(parts[34]) || 0,
          volume: parseInt(parts[6]) || 0,
          turnover: parseFloat(parts[7]) || 0,
          change: parseFloat(parts[31]) || 0,
          changePercent: parseFloat(parts[32]) || 0,
          timestamp: parts[30] || new Date().toISOString().replace(/[-:]/g, '').slice(0, 14),
          source: 'tencent-finance',
          lastUpdated: new Date().toISOString()
        };
        
        // 计算涨跌幅（如果changePercent为0但change不为0）
        if (result.changePercent === 0 && result.change !== 0 && result.previousClose > 0) {
          result.changePercent = (result.change / result.previousClose) * 100;
        }
      } else {
        return null;
      }
      
      return result;
      
    } catch (error) {
      console.log(`❌ 解析腾讯财经数据失败: ${error.message}`);
      return null;
    }
  }
  
  /**
   * 获取单个股票数据
   */
  async getStockQuote(symbol) {
    // 1. 检查内存缓存
    const cached = memoryCache.get(symbol);
    if (cached && (Date.now() - cached.timestamp) < this.config.cache.memoryTTL) {
      this.stats.cacheHits++;
      console.log(`💾 腾讯财经缓存命中: ${symbol}`);
      return cached.data;
    }
    
    // 2. 获取腾讯财经格式的符号
    const tencentSymbol = this.getTencentSymbol(symbol);
    if (!tencentSymbol) {
      console.log(`⚠️ 无腾讯财经符号映射: ${symbol}`);
      return null;
    }
    
    // 3. 发送请求
    this.stats.totalRequests++;
    
    try {
      console.log(`🔍 腾讯财经请求: ${symbol} -> ${tencentSymbol}`);
      
      const response = await axios.get(this.config.baseUrl + '/q=' + tencentSymbol, {
        responseType: 'arraybuffer',
        timeout: this.config.timeout
      });
      
      // 腾讯财经返回GBK编码，需要转换
      const decodedData = iconv.decode(response.data, 'gbk');
      
      // 解析数据
      const parsedData = this.parseTencentData(decodedData, symbol);
      
      if (parsedData) {
        this.stats.successfulRequests++;
        console.log(`✅ 腾讯财经成功: ${symbol} = ${parsedData.price}`);
        
        // 保存到内存缓存
        memoryCache.set(symbol, {
          data: parsedData,
          timestamp: Date.now()
        });
        
        return parsedData;
      } else {
        this.stats.failedRequests++;
        console.log(`⚠️ 腾讯财经无数据: ${symbol}`);
        return null;
      }
      
    } catch (error) {
      this.stats.failedRequests++;
      console.log(`❌ 腾讯财经请求失败: ${symbol} - ${error.message}`);
      return null;
    }
  }
  
  /**
   * 批量获取股票数据
   */
  async getBatchQuotes(symbols) {
    const results = {};
    const batchSize = this.config.request.batchSize;
    
    console.log(`📊 腾讯财经批量获取 ${symbols.length} 个符号`);
    
    // 分批处理，避免请求过大
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      
      // 并行获取批次内的数据
      const batchPromises = batch.map(symbol => this.getStockQuote(symbol));
      const batchResults = await Promise.all(batchPromises);
      
      // 收集结果
      batch.forEach((symbol, index) => {
        const data = batchResults[index];
        if (data) {
          results[symbol] = data;
        }
      });
      
      // 批次间延迟
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, this.config.request.delayBetweenBatches));
      }
    }
    
    // 更新统计
    this.stats.lastUpdate = new Date().toISOString();
    
    // 保存到磁盘缓存
    if (Object.keys(results).length > 0) {
      this.saveDiskCache(results);
    }
    
    return results;
  }
  
  /**
   * 获取所有支持的符号
   */
  getAllSupportedSymbols() {
    return Object.keys(this.config.symbolMapping);
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    const cacheHitRate = this.stats.totalRequests > 0 
      ? ((this.stats.cacheHits / this.stats.totalRequests) * 100).toFixed(1)
      : '0.0';
    
    return {
      ...this.stats,
      cacheHitRate,
      supportedSymbols: this.getAllSupportedSymbols().length,
      memoryCacheSize: memoryCache.size
    };
  }
  
  /**
   * 清空缓存
   */
  clearCache() {
    memoryCache.clear();
    try {
      if (fs.existsSync(this.config.cache.cacheFile)) {
        fs.unlinkSync(this.config.cache.cacheFile);
      }
      console.log('🧹 腾讯财经缓存已清空');
    } catch (error) {
      console.log(`⚠️ 清空缓存失败: ${error.message}`);
    }
  }
}

// 导出模块
module.exports = {
  TencentFinanceClient,
  TENCENT_FINANCE_CONFIG
};