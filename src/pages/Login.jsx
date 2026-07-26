import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Typography, message, Alert, Spin } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext.jsx';
import db, { hashPassword } from '../db/database.js';

const { Title, Text } = Typography;

export default function Login() {
  const { login, currentAccount } = useAuth();
  const [loading, setLoading] = useState(false);
  const [initState, setInitState] = useState('checking'); // 'checking' | 'ready' | 'error'
  const [showChangePwd, setShowChangePwd] = useState(false);

  // 检查数据库是否可用（不调用 ensureInitialized，避免重复初始化）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 简单检查数据库连接
        const count = await db.accounts.count();
        if (!cancelled) {
          setInitState(count > 0 ? 'ready' : 'error');
        }
      } catch (e) {
        console.error('数据库连接失败:', e.message);
        if (!cancelled) setInitState('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 重试连接
  const handleRetry = () => {
    setInitState('checking');
    setTimeout(() => {
      db.accounts.count()
        .then((count) => setInitState(count > 0 ? 'ready' : 'error'))
        .catch(() => setInitState('error'));
    }, 500);
  };

  // 如果已登录但必须改密码，直接显示改密码表单
  useEffect(() => {
    if (currentAccount?.mustChangePassword) {
      setShowChangePwd(true);
    }
  }, [currentAccount]);

  const handleLogin = async (values) => {
    setLoading(true);
    try {
      const result = await login(values.username, values.password);
      if (!result.ok) {
        message.error(result.msg);
        return;
      }
      if (result.account.mustChangePassword) {
        setShowChangePwd(true);
        message.info('首次登录，请修改密码');
      } else {
        message.success('登录成功');
      }
    } catch (err) {
      message.error('登录失败：' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (values) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }
    if (values.newPassword.length < 4) {
      message.error('密码至少 4 位');
      return;
    }
    try {
      const acc = currentAccount;
      if (!acc) return;
      const newHash = hashPassword(values.newPassword);
      await db.accounts.update(acc.id, { passwordHash: newHash, mustChangePassword: false });
      message.success('密码修改成功');
      setShowChangePwd(false);
    } catch (err) {
      message.error('修改失败：' + err.message);
    }
  };

  if (initState === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <Card style={{ width: 400, textAlign: 'center' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: '#8c8c8c' }}>正在连接云数据库...</div>
        </Card>
      </div>
    );
  }

  if (initState === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <Card style={{ width: 400 }}>
          <Alert
            type="warning"
            showIcon
            message="云数据库连接失败"
            description="无法连接到Supabase云数据库，请检查网络后重试"
            style={{ marginBottom: 16 }}
          />
          <Button type="primary" block icon={<ReloadOutlined />} onClick={handleRetry}>
            重试连接
          </Button>
        </Card>
      </div>
    );
  }

  if (showChangePwd && currentAccount) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <Card style={{ width: 400 }}>
          <Title level={4} style={{ marginTop: 0, textAlign: 'center', color: '#1e3a5f' }}>修改初始密码</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16, textAlign: 'center' }}>
            为安全起见，请修改初始密码
          </Text>
          <Form layout="vertical" onFinish={handleChangePassword}>
            <Form.Item name="newPassword" label="新密码" rules={[{ required: true, message: '请输入新密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="请输入新密码" />
            </Form.Item>
            <Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true, message: '请再次输入新密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="请再次输入新密码" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block icon={<LoginOutlined />}>确认修改</Button>
            </Form.Item>
          </Form>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)' }}>
      <Card style={{ width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ marginBottom: 4, color: '#1e3a5f' }}>亚马逊财务系统</Title>
          <Text type="secondary">本地化部署 · 数据安全留存</Text>
        </div>
        <Form layout="vertical" onFinish={handleLogin} initialValues={{ username: 'admin', password: 'admin123' }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} icon={<LoginOutlined />}>
              登录
            </Button>
          </Form.Item>
        </Form>
        <Alert type="info" showIcon message="默认账户" description="用户名：admin / 密码：admin123" size="small" />
      </Card>
    </div>
  );
}
