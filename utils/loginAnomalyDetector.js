const { query } = require('../config/database');
const { geoLocationService } = require('./geolocation');
const logger = require('./logger');
const UAParser = require('ua-parser-js');

// 登录异常检测服务
class LoginAnomalyDetector {
  constructor() {
    this.riskRules = new Map();
    this.loadRiskRules();
  }

  // 加载风险检测规则
  async loadRiskRules() {
    try {
      const rules = await query(
        'SELECT * FROM login_risk_rules WHERE is_enabled = TRUE'
      );
      
      for (const rule of rules) {
        this.riskRules.set(rule.rule_name, {
          type: rule.rule_type,
          description: rule.description,
          riskScore: rule.risk_score,
          conditions: JSON.parse(rule.conditions)
        });
      }
      
      logger.info(`加载了 ${rules.length} 条登录风险检测规则`);
    } catch (error) {
      logger.error('加载风险检测规则失败:', error);
    }
  }

  // 检测登录异常
  async detectAnomalies(userId, loginData) {
    try {
      const {
        ip_address,
        user_agent,
        session_token_hash
      } = loginData;

      let totalRiskScore = 0;
      const anomalies = [];
      const suspiciousReasons = [];

      // 获取地理位置信息
      const locationInfo = await geoLocationService.getLocationInfo(ip_address);
      
      // 解析用户代理
      const uaParser = new UAParser(user_agent);
      const deviceInfo = {
        device_type: this.getDeviceType(uaParser.getDevice()),
        browser: `${uaParser.getBrowser().name} ${uaParser.getBrowser().version}`,
        os: `${uaParser.getOS().name} ${uaParser.getOS().version}`
      };

      // 1. 检测地理位置异常
      const geoAnomaly = await this.checkGeographicAnomaly(userId, locationInfo);
      if (geoAnomaly.isAnomalous) {
        totalRiskScore += geoAnomaly.riskScore;
        anomalies.push(geoAnomaly);
        suspiciousReasons.push(geoAnomaly.reason);
      }

      // 2. 检测IP信誉
      const ipReputationAnomaly = this.checkIPReputation(locationInfo);
      if (ipReputationAnomaly.isAnomalous) {
        totalRiskScore += ipReputationAnomaly.riskScore;
        anomalies.push(ipReputationAnomaly);
        suspiciousReasons.push(ipReputationAnomaly.reason);
      }

      // 3. 检测登录频率异常
      const frequencyAnomaly = await this.checkLoginFrequency(userId, ip_address);
      if (frequencyAnomaly.isAnomalous) {
        totalRiskScore += frequencyAnomaly.riskScore;
        anomalies.push(frequencyAnomaly);
        suspiciousReasons.push(frequencyAnomaly.reason);
      }

      // 4. 检测设备变更
      const deviceAnomaly = await this.checkDeviceAnomaly(userId, deviceInfo, ip_address);
      if (deviceAnomaly.isAnomalous) {
        totalRiskScore += deviceAnomaly.riskScore;
        anomalies.push(deviceAnomaly);
        suspiciousReasons.push(deviceAnomaly.reason);
      }

      // 5. 检测时间异常
      const timeAnomaly = await this.checkTimeAnomaly(userId, locationInfo.timezone);
      if (timeAnomaly.isAnomalous) {
        totalRiskScore += timeAnomaly.riskScore;
        anomalies.push(timeAnomaly);
        suspiciousReasons.push(timeAnomaly.reason);
      }

      // 6. 检测并发会话
      const concurrentAnomaly = await this.checkConcurrentSessions(userId);
      if (concurrentAnomaly.isAnomalous) {
        totalRiskScore += concurrentAnomaly.riskScore;
        anomalies.push(concurrentAnomaly);
        suspiciousReasons.push(concurrentAnomaly.reason);
      }

      // 记录登录日志
      await this.recordLoginLog(userId, {
        ...loginData,
        ...locationInfo,
        ...deviceInfo,
        risk_score: totalRiskScore,
        is_suspicious: totalRiskScore >= 50,
        suspicious_reasons: suspiciousReasons.length > 0 ? JSON.stringify(suspiciousReasons) : null
      });

      return {
        totalRiskScore,
        isSuspicious: totalRiskScore >= 50,
        anomalies,
        suspiciousReasons,
        locationInfo,
        deviceInfo
      };
    } catch (error) {
      logger.error('登录异常检测失败:', error);
      throw error;
    }
  }

  // 检测地理位置异常
  async checkGeographicAnomaly(userId, currentLocation) {
    try {
      if (!currentLocation.latitude || !currentLocation.longitude) {
        return { isAnomalous: false, riskScore: 0 };
      }

      // 获取用户最近的登录位置（24小时内）
      const recentLogins = await query(
        `SELECT latitude, longitude, city, country, login_time 
         FROM user_login_logs 
         WHERE user_id = ? 
           AND latitude IS NOT NULL 
           AND longitude IS NOT NULL 
           AND login_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         ORDER BY login_time DESC 
         LIMIT 5`,
        [userId]
      );

      if (recentLogins.length === 0) {
        return { isAnomalous: false, riskScore: 0 };
      }

      const rule = this.riskRules.get('异常地理位置');
      if (!rule) return { isAnomalous: false, riskScore: 0 };

      // 检查与最近登录位置的距离
      for (const recentLogin of recentLogins) {
        const distance = geoLocationService.calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          recentLogin.latitude,
          recentLogin.longitude
        );

        const timeDiff = (new Date() - new Date(recentLogin.login_time)) / 1000 / 3600; // 小时

        if (distance > rule.conditions.max_distance_km && timeDiff < rule.conditions.time_window_hours) {
          return {
            isAnomalous: true,
            riskScore: rule.riskScore,
            reason: `在${timeDiff.toFixed(1)}小时内从${recentLogin.city}(${recentLogin.country})移动到${currentLocation.city}(${currentLocation.country})，距离${distance.toFixed(0)}公里`,
            type: 'geographic_anomaly',
            details: {
              distance,
              timeDiff,
              previousLocation: `${recentLogin.city}, ${recentLogin.country}`,
              currentLocation: `${currentLocation.city}, ${currentLocation.country}`
            }
          };
        }
      }

      return { isAnomalous: false, riskScore: 0 };
    } catch (error) {
      logger.error('地理位置异常检测失败:', error);
      return { isAnomalous: false, riskScore: 0 };
    }
  }

  // 检测IP信誉
  checkIPReputation(locationInfo) {
    const rule = this.riskRules.get('可疑IP地址');
    if (!rule) return { isAnomalous: false, riskScore: 0 };

    const suspiciousFactors = [];
    let riskScore = 0;

    if (locationInfo.is_proxy) {
      suspiciousFactors.push('代理服务器');
      riskScore += 20;
    }

    if (locationInfo.is_vpn) {
      suspiciousFactors.push('VPN');
      riskScore += 15;
    }

    if (locationInfo.is_tor) {
      suspiciousFactors.push('Tor网络');
      riskScore += 30;
    }

    if (locationInfo.threat_level === 'high') {
      suspiciousFactors.push('高威胁IP');
      riskScore += 25;
    } else if (locationInfo.threat_level === 'medium') {
      suspiciousFactors.push('中等威胁IP');
      riskScore += 15;
    }

    if (suspiciousFactors.length > 0) {
      return {
        isAnomalous: true,
        riskScore: Math.min(riskScore, rule.riskScore),
        reason: `来自可疑IP地址: ${suspiciousFactors.join(', ')}`,
        type: 'ip_reputation',
        details: {
          suspiciousFactors,
          threatLevel: locationInfo.threat_level
        }
      };
    }

    return { isAnomalous: false, riskScore: 0 };
  }

  // 检测登录频率异常
  async checkLoginFrequency(userId, ipAddress) {
    try {
      const rule = this.riskRules.get('频繁登录尝试');
      if (!rule) return { isAnomalous: false, riskScore: 0 };

      const timeWindow = rule.conditions.time_window_minutes;
      const maxAttempts = rule.conditions.max_attempts;

      // 检查IP地址的登录尝试频率
      const recentAttempts = await query(
        `SELECT COUNT(*) as attempt_count 
         FROM user_login_logs 
         WHERE ip_address = ? 
           AND login_time >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
        [ipAddress, timeWindow]
      );

      const attemptCount = recentAttempts[0].attempt_count;

      if (attemptCount >= maxAttempts) {
        return {
          isAnomalous: true,
          riskScore: rule.riskScore,
          reason: `在${timeWindow}分钟内从IP ${ipAddress} 尝试登录${attemptCount}次`,
          type: 'login_frequency',
          details: {
            attemptCount,
            timeWindow,
            ipAddress
          }
        };
      }

      return { isAnomalous: false, riskScore: 0 };
    } catch (error) {
      logger.error('登录频率异常检测失败:', error);
      return { isAnomalous: false, riskScore: 0 };
    }
  }

  // 检测设备变更异常
  async checkDeviceAnomaly(userId, deviceInfo, ipAddress) {
    try {
      const rule = this.riskRules.get('新设备登录');
      if (!rule) return { isAnomalous: false, riskScore: 0 };

      // 生成设备指纹
      const deviceFingerprint = this.generateDeviceFingerprint(deviceInfo, ipAddress);

      // 检查是否为已知设备
      const knownDevice = await query(
        'SELECT id FROM user_trusted_devices WHERE user_id = ? AND device_fingerprint = ?',
        [userId, deviceFingerprint]
      );

      if (knownDevice.length === 0) {
        // 检查用户是否有任何已知设备
        const userDevices = await query(
          'SELECT COUNT(*) as device_count FROM user_trusted_devices WHERE user_id = ?',
          [userId]
        );

        const isFirstDevice = userDevices[0].device_count === 0;

        if (!isFirstDevice) {
          return {
            isAnomalous: true,
            riskScore: rule.riskScore,
            reason: `从新设备登录: ${deviceInfo.device_type} - ${deviceInfo.browser} on ${deviceInfo.os}`,
            type: 'new_device',
            details: {
              deviceFingerprint,
              deviceInfo
            }
          };
        }
      }

      return { isAnomalous: false, riskScore: 0 };
    } catch (error) {
      logger.error('设备异常检测失败:', error);
      return { isAnomalous: false, riskScore: 0 };
    }
  }

  // 检测时间异常
  async checkTimeAnomaly(userId, timezone) {
    try {
      const rule = this.riskRules.get('异常时间登录');
      if (!rule) return { isAnomalous: false, riskScore: 0 };

      // 获取用户的正常登录时间模式
      const userLoginPattern = await this.getUserLoginPattern(userId);
      
      // 获取当前时间（用户时区）
      const currentHour = this.getCurrentHourInTimezone(timezone);
      
      if (currentHour === null) {
        return { isAnomalous: false, riskScore: 0 };
      }

      // 检查是否在正常时间范围内
      const normalHours = rule.conditions.normal_hours;
      const isNormalTime = normalHours.includes(currentHour);

      // 如果用户有自己的登录模式，使用用户模式
      if (userLoginPattern.length > 0) {
        const userNormalHours = userLoginPattern.map(p => p.hour);
        const isUserNormalTime = userNormalHours.includes(currentHour);
        
        if (!isUserNormalTime) {
          return {
            isAnomalous: true,
            riskScore: rule.riskScore,
            reason: `在异常时间登录: ${currentHour}:00 (用户通常在 ${userNormalHours.join(', ')} 时登录)`,
            type: 'time_anomaly',
            details: {
              currentHour,
              userNormalHours,
              timezone
            }
          };
        }
      } else if (!isNormalTime) {
        return {
          isAnomalous: true,
          riskScore: rule.riskScore,
          reason: `在异常时间登录: ${currentHour}:00 (正常时间为 ${normalHours.join(', ')} 时)`,
          type: 'time_anomaly',
          details: {
            currentHour,
            normalHours,
            timezone
          }
        };
      }

      return { isAnomalous: false, riskScore: 0 };
    } catch (error) {
      logger.error('时间异常检测失败:', error);
      return { isAnomalous: false, riskScore: 0 };
    }
  }

  // 检测并发会话异常
  async checkConcurrentSessions(userId) {
    try {
      // 获取最大并发会话数配置
      const settings = await query(
        'SELECT setting_value FROM security_settings WHERE setting_key = "max_concurrent_sessions"'
      );
      
      const maxSessions = settings.length > 0 ? parseInt(settings[0].setting_value) : 5;

      // 检查当前活跃会话数
      const activeSessions = await query(
        'SELECT COUNT(*) as session_count FROM user_login_logs WHERE user_id = ? AND is_active = TRUE',
        [userId]
      );

      const sessionCount = activeSessions[0].session_count;

      if (sessionCount >= maxSessions) {
        return {
          isAnomalous: true,
          riskScore: 25,
          reason: `并发会话数过多: ${sessionCount}个活跃会话 (最大允许${maxSessions}个)`,
          type: 'concurrent_sessions',
          details: {
            sessionCount,
            maxSessions
          }
        };
      }

      return { isAnomalous: false, riskScore: 0 };
    } catch (error) {
      logger.error('并发会话检测失败:', error);
      return { isAnomalous: false, riskScore: 0 };
    }
  }

  // 记录登录日志
  async recordLoginLog(userId, logData) {
    try {
      await query(
        `INSERT INTO user_login_logs (
          user_id, session_token_hash, ip_address, user_agent,
          country, region, city, latitude, longitude, timezone,
          device_type, browser, os, risk_score, is_suspicious, suspicious_reasons
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          logData.session_token_hash,
          logData.ip_address,
          logData.user_agent,
          logData.country,
          logData.region,
          logData.city,
          logData.latitude,
          logData.longitude,
          logData.timezone,
          logData.device_type,
          logData.browser,
          logData.os,
          logData.risk_score,
          logData.is_suspicious,
          logData.suspicious_reasons
        ]
      );
    } catch (error) {
      logger.error('记录登录日志失败:', error);
      throw error;
    }
  }

  // 生成设备指纹
  generateDeviceFingerprint(deviceInfo, ipAddress) {
    const crypto = require('crypto');
    const fingerprint = `${deviceInfo.device_type}-${deviceInfo.browser}-${deviceInfo.os}-${ipAddress}`;
    return crypto.createHash('sha256').update(fingerprint).digest('hex');
  }

  // 获取设备类型
  getDeviceType(device) {
    if (device.type === 'mobile') return 'mobile';
    if (device.type === 'tablet') return 'tablet';
    return 'desktop';
  }

  // 获取用户登录时间模式
  async getUserLoginPattern(userId) {
    try {
      const pattern = await query(
        `SELECT HOUR(login_time) as hour, COUNT(*) as count
         FROM user_login_logs 
         WHERE user_id = ? 
           AND login_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY HOUR(login_time)
         HAVING count >= 3
         ORDER BY count DESC`,
        [userId]
      );

      return pattern;
    } catch (error) {
      logger.error('获取用户登录模式失败:', error);
      return [];
    }
  }

  // 获取指定时区的当前小时
  getCurrentHourInTimezone(timezone) {
    try {
      if (!timezone) return null;
      
      const now = new Date();
      const userTime = new Date(now.toLocaleString("en-US", {timeZone: timezone}));
      return userTime.getHours();
    } catch (error) {
      return null;
    }
  }

  // 更新登录日志状态（登出时调用）
  async updateLoginLogStatus(sessionTokenHash, isActive = false) {
    try {
      await query(
        'UPDATE user_login_logs SET is_active = ?, logout_time = NOW() WHERE session_token_hash = ?',
        [isActive, sessionTokenHash]
      );
    } catch (error) {
      logger.error('更新登录日志状态失败:', error);
    }
  }

  // 添加受信任设备
  async addTrustedDevice(userId, deviceInfo, ipAddress, locationInfo) {
    try {
      const deviceFingerprint = this.generateDeviceFingerprint(deviceInfo, ipAddress);
      const deviceName = `${deviceInfo.browser} on ${deviceInfo.os}`;
      const location = `${locationInfo.city}, ${locationInfo.country}`;

      await query(
        `INSERT INTO user_trusted_devices (
          user_id, device_fingerprint, device_name, device_type, browser, os, 
          ip_address, location
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        last_used = CURRENT_TIMESTAMP,
        ip_address = VALUES(ip_address),
        location = VALUES(location)`,
        [
          userId,
          deviceFingerprint,
          deviceName,
          deviceInfo.device_type,
          deviceInfo.browser,
          deviceInfo.os,
          ipAddress,
          location
        ]
      );
    } catch (error) {
      logger.error('添加受信任设备失败:', error);
    }
  }
}

// 导出单例实例
const loginAnomalyDetector = new LoginAnomalyDetector();

module.exports = {
  LoginAnomalyDetector,
  loginAnomalyDetector
};