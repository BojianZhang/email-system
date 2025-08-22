const axios = require('axios');
const { query } = require('../config/database');
const logger = require('./logger');

// IP地理位置查询服务
class GeoLocationService {
  constructor() {
    // 支持多个地理位置API提供商
    this.providers = {
      ipapi: {
        url: 'http://ip-api.com/json/{ip}?fields=status,message,country,regionName,city,lat,lon,timezone,isp,proxy',
        rateLimit: 45, // 每分钟45次请求
        free: true
      },
      ipinfo: {
        url: 'https://ipinfo.io/{ip}/json',
        token: process.env.IPINFO_TOKEN,
        rateLimit: 50000, // 每月50000次请求
        free: false
      },
      maxmind: {
        url: 'https://geoip.maxmind.com/geoip/v2.1/city/{ip}',
        token: process.env.MAXMIND_TOKEN,
        rateLimit: 1000, // 每小时1000次请求
        free: false
      }
    };
    
    this.currentProvider = process.env.GEOLOCATION_PROVIDER || 'ipapi';
    this.cache = new Map(); // 内存缓存
    this.rateLimitCounter = new Map();
  }

  // 获取IP地理位置信息
  async getLocationInfo(ip) {
    try {
      // 检查IP地址有效性
      if (!this.isValidIP(ip) || this.isPrivateIP(ip)) {
        return this.getDefaultLocationInfo();
      }

      // 先从数据库缓存中查找
      const cached = await this.getCachedLocation(ip);
      if (cached && this.isCacheValid(cached)) {
        return cached;
      }

      // 从API获取新数据
      const locationData = await this.fetchFromAPI(ip);
      
      // 保存到数据库缓存
      await this.saveCachedLocation(ip, locationData);
      
      return locationData;
    } catch (error) {
      logger.error(`获取IP地理位置失败 ${ip}:`, error);
      return this.getDefaultLocationInfo();
    }
  }

  // 从API获取地理位置数据
  async fetchFromAPI(ip) {
    const provider = this.providers[this.currentProvider];
    
    if (!provider) {
      throw new Error(`未知的地理位置提供商: ${this.currentProvider}`);
    }

    // 检查速率限制
    if (!this.checkRateLimit()) {
      throw new Error('API请求频率超限');
    }

    const url = provider.url.replace('{ip}', ip);
    const config = {
      timeout: 5000,
      headers: {}
    };

    // 添加认证头
    if (provider.token) {
      if (this.currentProvider === 'ipinfo') {
        config.headers['Authorization'] = `Bearer ${provider.token}`;
      } else if (this.currentProvider === 'maxmind') {
        config.auth = {
          username: provider.token.split(':')[0],
          password: provider.token.split(':')[1]
        };
      }
    }

    const response = await axios.get(url, config);
    return this.normalizeResponse(response.data);
  }

  // 标准化不同API的响应格式
  normalizeResponse(data) {
    let normalized = {
      country: null,
      region: null,
      city: null,
      latitude: null,
      longitude: null,
      timezone: null,
      isp: null,
      is_proxy: false,
      is_vpn: false,
      is_tor: false,
      threat_level: 'low'
    };

    if (this.currentProvider === 'ipapi') {
      if (data.status === 'success') {
        normalized = {
          country: data.country,
          region: data.regionName,
          city: data.city,
          latitude: data.lat,
          longitude: data.lon,
          timezone: data.timezone,
          isp: data.isp,
          is_proxy: data.proxy || false,
          is_vpn: false,
          is_tor: false,
          threat_level: data.proxy ? 'medium' : 'low'
        };
      }
    } else if (this.currentProvider === 'ipinfo') {
      const loc = data.loc ? data.loc.split(',') : [null, null];
      normalized = {
        country: data.country,
        region: data.region,
        city: data.city,
        latitude: parseFloat(loc[0]) || null,
        longitude: parseFloat(loc[1]) || null,
        timezone: data.timezone,
        isp: data.org,
        is_proxy: false,
        is_vpn: false,
        is_tor: false,
        threat_level: 'low'
      };
    }

    return normalized;
  }

  // 从数据库缓存获取位置信息
  async getCachedLocation(ip) {
    try {
      const results = await query(
        'SELECT * FROM ip_geolocation_cache WHERE ip_address = ?',
        [ip]
      );
      
      if (results.length > 0) {
        const row = results[0];
        return {
          country: row.country,
          region: row.region,
          city: row.city,
          latitude: row.latitude,
          longitude: row.longitude,
          timezone: row.timezone,
          isp: row.isp,
          is_proxy: row.is_proxy,
          is_vpn: row.is_vpn,
          is_tor: row.is_tor,
          threat_level: row.threat_level,
          last_updated: row.last_updated
        };
      }
      
      return null;
    } catch (error) {
      logger.error('查询IP缓存失败:', error);
      return null;
    }
  }

  // 保存位置信息到数据库缓存
  async saveCachedLocation(ip, locationData) {
    try {
      await query(
        `INSERT INTO ip_geolocation_cache 
         (ip_address, country, region, city, latitude, longitude, timezone, isp, is_proxy, is_vpn, is_tor, threat_level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         country = VALUES(country),
         region = VALUES(region),
         city = VALUES(city),
         latitude = VALUES(latitude),
         longitude = VALUES(longitude),
         timezone = VALUES(timezone),
         isp = VALUES(isp),
         is_proxy = VALUES(is_proxy),
         is_vpn = VALUES(is_vpn),
         is_tor = VALUES(is_tor),
         threat_level = VALUES(threat_level),
         last_updated = CURRENT_TIMESTAMP`,
        [
          ip,
          locationData.country,
          locationData.region,
          locationData.city,
          locationData.latitude,
          locationData.longitude,
          locationData.timezone,
          locationData.isp,
          locationData.is_proxy,
          locationData.is_vpn,
          locationData.is_tor,
          locationData.threat_level
        ]
      );
    } catch (error) {
      logger.error('保存IP缓存失败:', error);
    }
  }

  // 检查缓存是否有效（24小时内）
  isCacheValid(cachedData) {
    if (!cachedData.last_updated) return false;
    
    const cacheAge = Date.now() - new Date(cachedData.last_updated).getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24小时
    
    return cacheAge < maxAge;
  }

  // 检查API请求频率限制
  checkRateLimit() {
    const provider = this.providers[this.currentProvider];
    if (!provider) return false;

    const now = Date.now();
    const windowStart = now - 60000; // 1分钟窗口
    
    // 清理过期的计数器
    for (const [timestamp, count] of this.rateLimitCounter.entries()) {
      if (timestamp < windowStart) {
        this.rateLimitCounter.delete(timestamp);
      }
    }

    // 计算当前分钟的请求数
    let currentRequests = 0;
    for (const [timestamp, count] of this.rateLimitCounter.entries()) {
      if (timestamp >= windowStart) {
        currentRequests += count;
      }
    }

    if (currentRequests >= provider.rateLimit) {
      return false;
    }

    // 记录这次请求
    const currentMinute = Math.floor(now / 60000) * 60000;
    this.rateLimitCounter.set(currentMinute, (this.rateLimitCounter.get(currentMinute) || 0) + 1);
    
    return true;
  }

  // 验证IP地址格式
  isValidIP(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  // 检查是否为私有IP地址
  isPrivateIP(ip) {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
      /^::1$/,
      /^fc00:/,
      /^fe80:/
    ];
    
    return privateRanges.some(range => range.test(ip));
  }

  // 获取默认位置信息
  getDefaultLocationInfo() {
    return {
      country: 'Unknown',
      region: 'Unknown',
      city: 'Unknown',
      latitude: null,
      longitude: null,
      timezone: null,
      isp: 'Unknown',
      is_proxy: false,
      is_vpn: false,
      is_tor: false,
      threat_level: 'low'
    };
  }

  // 计算两个地理位置之间的距离（公里）
  calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  // 清理过期的缓存数据
  async cleanupCache() {
    try {
      const result = await query(
        'DELETE FROM ip_geolocation_cache WHERE last_updated < DATE_SUB(NOW(), INTERVAL 30 DAY)'
      );
      logger.info(`清理了 ${result.affectedRows} 条过期的IP地理位置缓存`);
    } catch (error) {
      logger.error('清理IP地理位置缓存失败:', error);
    }
  }

  // 获取威胁情报信息
  async getThreatIntelligence(ip) {
    try {
      // 这里可以集成威胁情报API，如AbuseIPDB、VirusTotal等
      // 目前返回基础检查结果
      const location = await this.getLocationInfo(ip);
      
      let threatLevel = 'low';
      if (location.is_proxy || location.is_vpn || location.is_tor) {
        threatLevel = 'medium';
      }
      
      return {
        ...location,
        threat_level: threatLevel,
        threat_sources: []
      };
    } catch (error) {
      logger.error('获取威胁情报失败:', error);
      return this.getDefaultLocationInfo();
    }
  }
}

// 导出单例实例
const geoLocationService = new GeoLocationService();

module.exports = {
  GeoLocationService,
  geoLocationService
};