import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { message } from 'antd';
import api from '../services/api';

// 认证状态
const AuthContext = createContext();

// 认证reducer
const authReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_USER':
      return { ...state, user: action.payload, loading: false };
    case 'SET_TOKEN':
      return { ...state, token: action.payload };
    case 'LOGOUT':
      return { ...state, user: null, token: null, loading: false };
    case 'UPDATE_USER':
      return { ...state, user: { ...state.user, ...action.payload } };
    default:
      return state;
  }
};

// 初始状态
const initialState = {
  user: null,
  token: localStorage.getItem('token'),
  loading: true,
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // 设置token到API请求头
  useEffect(() => {
    if (state.token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${state.token}`;
      localStorage.setItem('token', state.token);
    } else {
      delete api.defaults.headers.common['Authorization'];
      localStorage.removeItem('token');
    }
  }, [state.token]);

  // 验证token有效性
  useEffect(() => {
    const verifyToken = async () => {
      if (state.token) {
        try {
          const response = await api.get('/auth/verify');
          dispatch({ type: 'SET_USER', payload: response.data.user });
        } catch (error) {
          // Token无效，清除登录状态
          dispatch({ type: 'LOGOUT' });
          message.error('登录已过期，请重新登录');
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    verifyToken();
  }, [state.token]);

  // 登录
  const login = async (email, password) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const response = await api.post('/auth/login', { email, password });
      const { token, user } = response.data;
      
      dispatch({ type: 'SET_TOKEN', payload: token });
      dispatch({ type: 'SET_USER', payload: user });
      
      message.success('登录成功');
      return { success: true };
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      const errorMessage = error.response?.data?.error || '登录失败';
      message.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // 注册
  const register = async (username, email, password) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const response = await api.post('/auth/register', {
        username,
        email,
        password,
      });
      const { token, user } = response.data;
      
      dispatch({ type: 'SET_TOKEN', payload: token });
      dispatch({ type: 'SET_USER', payload: user });
      
      message.success('注册成功');
      return { success: true };
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      const errorMessage = error.response?.data?.error || '注册失败';
      message.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // 登出
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // 忽略登出错误
    } finally {
      dispatch({ type: 'LOGOUT' });
      message.success('已退出登录');
    }
  };

  // 更新用户信息
  const updateUser = (userData) => {
    dispatch({ type: 'UPDATE_USER', payload: userData });
  };

  // 修改密码
  const changePassword = async (currentPassword, newPassword) => {
    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      message.success('密码修改成功');
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.error || '修改密码失败';
      message.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // 获取当前用户信息
  const getCurrentUser = async () => {
    try {
      const response = await api.get('/auth/me');
      dispatch({ type: 'SET_USER', payload: response.data.user });
      return response.data.user;
    } catch (error) {
      const errorMessage = error.response?.data?.error || '获取用户信息失败';
      message.error(errorMessage);
      throw error;
    }
  };

  const value = {
    user: state.user,
    token: state.token,
    loading: state.loading,
    login,
    register,
    logout,
    updateUser,
    changePassword,
    getCurrentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};