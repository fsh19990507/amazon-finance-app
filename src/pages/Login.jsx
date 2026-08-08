import React, { useState, useEffect, useCallback } from 'react';
import { Card, Form, Input, Button, Typography, message, Alert, Spin } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined, ReloadOutlined, CloudSyncOutlined, DisconnectOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import db, { hashPassword, checkCloudStatus } from '../db/database.js';

const { Title, Text } = Typography;

export default function Login() {
  const { login, currentAccount } = useAuth();
  // 主题配置：登录页背景/标题颜色随主题联动
  const { themeConfig } = useTheme();
  const [loading, setLoading] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  // 云端连接状态：'checking' | 'online' | 'dns_fail' | 'timeout' | 'network_error'
  const [cloudStatus, setCloudStatus] = useState('checking');
  const [cloudDetail, setCloudDetail] = useState('');

  // 检测云端连通性（不阻塞登录页渲染）
  const runCloudCheck = useCallback(async () => {
    setCloudStatus('checking');
    setCloudDetail('');
    try {
      const result = await checkCloudStatus();
      setCloudStatus(result.status);
      setCloudDetail(result.detail || '');
    } catch {
      setCloudStatus('network_error');
      setCloudDetail('检测过程发生未知错误');
    }
  }, []);

  useEffect(() => {
    runCloudCheck();
  }, [runCloudCheck]);

  // 如果已登录但必须改密码，直接显示改密码表单
  useEffect(() => {
    if (currentAccount?.mustChangePassword) {
      setShowChangePwd(true);
    }
  }, [currentAccount]);

  const handleLogin = async (values) => {
    console.log('[登录] handleLogin 触发', values.username);
    setLoading(true);
    try {
      const result = await login(values.username, values.password);
      console.log('[登录] login 返回', JSON.stringify(result));
      if (!result.ok) {
        // 凭证类错误（账户不存在 / 密码错误）
        if (!result.network) {
          message.error(result.msg);
          return;
        }
        // 网络类错误：显示更详细的分类提示
        if (result.msg.includes('域名解析')) {
          message.error('无法连接云端（域名解析失败），多为网络环境限制。请切换网络或稍后重试；也可稍后尝试本地缓存登录', 6);
        } else if (result.msg.includes('超时')) {
          message.error('连接云端超时，请检查网络后重试', 4);
        } else {
          message.error(result.msg, 4);
        }
        return;
      }
      if (result.account.mustChangePassword) {
        setShowChangePwd(true);
        message.info('首次登录，请修改密码');
      } else if (result.offline) {
        message.warning('已通过离线账户登录（云端不可达），当前为离线模式', 4);
      } else {
        message.success('登录成功');
      }
    } catch (err) {
      message.error('登录失败：' + err.message, 4);
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

  if (showChangePwd && currentAccount) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <Card style={{ width: 400 }}>
          <Title level={4} style={{ marginTop: 0, textAlign: 'center', color: themeConfig.token.colorPrimary }}>修改初始密码</Title>
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: themeConfig.extended.loginGradient }}>
      <Card style={{ width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        {/* 云端连接状态条 */}
        <div style={{ marginBottom: 16 }}>
          {cloudStatus === 'checking' && (
            <Alert
              type="info"
              showIcon
              icon={<Spin size="small" />}
              message="正在检测云端连接..."
              style={{ borderRadius: 6 }}
            />
          )}
          {cloudStatus === 'online' && (
            <Alert
              type="success"
              showIcon
              icon={<CloudSyncOutlined />}
              message="云端已连接，数据实时同步"
              style={{ borderRadius: 6 }}
            />
          )}
          {cloudStatus !== 'checking' && cloudStatus !== 'online' && (
            <Alert
              type="warning"
              showIcon
              icon={<DisconnectOutlined />}
              message={cloudStatus === 'dns_fail'
                ? '无法连接云端（域名解析失败）'
                : cloudStatus === 'timeout'
                  ? '无法连接云端（连接超时）'
                  : '无法连接云端（网络异常）'}
              description={cloudDetail
                ? `${cloudDetail}。已缓存数据仍可查看，可先登录进入系统。`
                : '已缓存数据仍可查看，可先登录进入系统。'}
              action={
                <Button size="small" icon={<ReloadOutlined />} onClick={runCloudCheck}>
                  重新检测
                </Button>
              }
              style={{ borderRadius: 6 }}
            />
          )}
        </div>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ marginBottom: 4, color: themeConfig.token.colorPrimary }}>亚马逊财务系统</Title>
          <Text type="secondary">本地化部署 · 数据安全留存</Text>
        </div>
        <Form layout="vertical" onFinish={handleLogin} initialValues={{ username: 'admin', password: 'admin' }}>
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
        <Alert type="info" showIcon message="默认账户" description="用户名：admin / 密码：admin" size="small" />
        {/* 云端不可达时的全面引导 */}
        {cloudStatus !== 'checking' && cloudStatus !== 'online' && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 16, borderRadius: 6 }}
            message="无法连接云端时怎么办？"
            description={
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
                <li><strong>仍可登录：</strong>系统会自动使用本地缓存账户登录，可正常查看已同步的数据</li>
                <li><strong>建议操作：</strong>切换网络（如手机热点/公司网络）或开启代理后，点上方「重新检测」</li>
                <li><strong>离线不丢数据：</strong>新增/导入的数据会先保存在本地，云端恢复后自动同步</li>
                <li><strong>若仍无法连接：</strong>多为 supabase.co 域名在国内网络受限，属网络环境问题，非系统故障</li>
              </ul>
            }
          />
        )}
      </Card>
    </div>
  );
}
