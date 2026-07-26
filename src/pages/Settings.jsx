// 系统设置页 —— 账户管理、角色管理、店铺管理、数据管理、操作日志
import React, { useState, useMemo } from 'react';
import {
  Tabs, Table, Button, Modal, Form, Input, Select, Space, message,
  Popconfirm, Card, Row, Col, Statistic, Tag, Tooltip, Alert, List, Typography, Divider
} from 'antd';
import {
  UserOutlined, TeamOutlined, ShopOutlined, DeleteOutlined,
  FileTextOutlined, SettingOutlined, PlusOutlined, EditOutlined,
  ExclamationCircleOutlined, ReloadOutlined
} from '@ant-design/icons';
import { useLiveQuery } from '../hooks/useLiveQuery.js';
import db, { hashPassword } from '../db/database.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PERM, permLevelName } from '../utils/permissions.js';
import { writeLog, LOG_ACTIONS, actionLabels } from '../utils/operationLog.js';
import dayjs from 'dayjs';

const { TabPane } = Tabs;
const { Option } = Select;
const { Title, Text } = Typography;

export default function Settings() {
  const { currentAccount, can } = useAuth();
  const [activeTab, setActiveTab] = useState('account');

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>系统设置</Title>
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab={<span><UserOutlined />账户管理</span>} key="account">
          <AccountManager />
        </TabPane>
        <TabPane tab={<span><TeamOutlined />角色权限</span>} key="role">
          <RoleManager />
        </TabPane>
        <TabPane tab={<span><ShopOutlined />店铺管理</span>} key="store">
          <StoreManager />
        </TabPane>
        <TabPane tab={<span><DeleteOutlined />数据管理</span>} key="data">
          <DataManager />
        </TabPane>
        <TabPane tab={<span><FileTextOutlined />操作日志</span>} key="logs">
          <LogViewer />
        </TabPane>
      </Tabs>
    </div>
  );
}

// ============= 账户管理 =============
function AccountManager() {
  const { can, currentAccount } = useAuth();
  const accounts = useLiveQuery(() => db.accounts.orderBy('id').toArray(), [], []);
  const roles = useLiveQuery(() => db.roles.orderBy('level').reverse().toArray(), [], []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const canManage = can(PERM.MANAGE_ACCOUNTS);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (acc) => {
    setEditing(acc);
    form.setFieldsValue({
      username: acc.username,
      nickname: acc.nickname,
      level: acc.level
    });
    setModalOpen(true);
  };

  const handleSave = async (values) => {
    try {
      if (editing) {
        await db.accounts.update(editing.id, {
          nickname: values.nickname,
          level: values.level
        });
        if (values.password) {
          await db.accounts.update(editing.id, {
            passwordHash: hashPassword(values.password),
            mustChangePassword: false
          });
        }
        await writeLog({
          accountId: currentAccount?.id,
          action: LOG_ACTIONS.EDIT_ACCOUNT,
          targetType: 'account',
          targetId: editing.id,
          detail: `编辑账户 ${values.username}`
        });
        message.success('更新成功');
      } else {
        if (!values.password) {
          message.error('请设置初始密码');
          return;
        }
        const exists = await db.accounts.where('username').equals(values.username).first();
        if (exists) {
          message.error('用户名已存在');
          return;
        }
        const id = await db.accounts.add({
          username: values.username,
          passwordHash: hashPassword(values.password),
          nickname: values.nickname || values.username,
          level: values.level,
          createdAt: Date.now(),
          mustChangePassword: true
        });
        await writeLog({
          accountId: currentAccount?.id,
          action: LOG_ACTIONS.ADD_ACCOUNT,
          targetType: 'account',
          targetId: id,
          detail: `新增账户 ${values.username}`
        });
        message.success('添加成功');
      }
      setModalOpen(false);
    } catch (err) {
      message.error('操作失败：' + err.message);
    }
  };

  const handleDelete = async (acc) => {
    if (acc.id === currentAccount?.id) {
      message.error('不能删除当前登录账户');
      return;
    }
    try {
      await db.accounts.delete(acc.id);
      await writeLog({
        accountId: currentAccount?.id,
        action: LOG_ACTIONS.DELETE_ACCOUNT,
        targetType: 'account',
        targetId: acc.id,
        detail: `删除账户 ${acc.username}`
      });
      message.success('删除成功');
    } catch (err) {
      message.error('删除失败：' + err.message);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username', width: 140 },
    { title: '昵称', dataIndex: 'nickname', width: 140 },
    {
      title: '级别',
      dataIndex: 'level',
      width: 140,
      render: (v) => {
        const role = roles?.find((r) => r.level === v);
        return <Tag color={v === 4 ? 'red' : v === 3 ? 'orange' : v === 2 ? 'blue' : 'default'}>
          Lv.{v} {role?.name || permLevelName(v)}
        </Tag>;
      }
    },
    {
      title: '首次登录需改密',
      dataIndex: 'mustChangePassword',
      width: 120,
      render: (v) => v ? <Tag color="warning">是</Tag> : <Tag color="success">否</Tag>
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} disabled={!canManage}>
            编辑
          </Button>
          <Popconfirm title="确定删除此账户？" onConfirm={() => handleDelete(record)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
            <Button size="small" danger disabled={!canManage}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary">共 {accounts?.length || 0} 个账户</Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} disabled={!canManage}>
          新增账户
        </Button>
      </div>
      {!canManage && <Alert type="warning" showIcon message="需要管理员权限才能管理账户" style={{ marginBottom: 12 }} />}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={accounts}
        size="small"
        pagination={{ pageSize: 10 }}
      />
      <Modal
        title={editing ? '编辑账户' : '新增账户'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input disabled={!!editing} placeholder="登录用的用户名" />
          </Form.Item>
          <Form.Item name="nickname" label="昵称">
            <Input placeholder="显示名称" />
          </Form.Item>
          <Form.Item name="level" label="角色级别" rules={[{ required: true, message: '请选择级别' }]}>
            <Select>
              {roles?.map((r) => (
                <Option key={r.level} value={r.level}>Lv.{r.level} - {r.name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="password" label={editing ? '新密码（留空不修改）' : '初始密码'} rules={editing ? [] : [{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder={editing ? '留空则不修改密码' : '至少4位'} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>{editing ? '保存' : '添加'}</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ============= 角色管理 =============
function RoleManager() {
  const { can, currentAccount } = useAuth();
  const roles = useLiveQuery(() => db.roles.orderBy('level').reverse().toArray(), [], []);
  const [editingLevel, setEditingLevel] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const canManage = can(PERM.MANAGE_ROLES);

  const handleEdit = (role) => {
    setEditingLevel(role.level);
    setEditName(role.name);
    setEditDesc(role.description || '');
  };

  const handleSave = async () => {
    try {
      await db.roles.put({ level: editingLevel, name: editName, description: editDesc });
      await writeLog({
        accountId: currentAccount?.id,
        action: LOG_ACTIONS.EDIT_ROLE,
        targetType: 'role',
        targetId: String(editingLevel),
        detail: `修改角色 Lv.${editingLevel} 名称为 ${editName}`
      });
      message.success('保存成功');
      setEditingLevel(null);
    } catch (err) {
      message.error('保存失败：' + err.message);
    }
  };

  return (
    <div>
      {!canManage && <Alert type="warning" showIcon message="需要管理员权限才能编辑角色名称" style={{ marginBottom: 12 }} />}
      <Row gutter={[16, 16]}>
        {roles?.map((role) => (
          <Col span={12} key={role.level}>
            <Card size="small" title={`Lv.${role.level}`} extra={
              <Button size="small" type="link" onClick={() => handleEdit(role)} disabled={!canManage}>
                <EditOutlined /> 重命名
              </Button>
            }>
              <Title level={5} style={{ margin: 0 }}>{role.name}</Title>
              <Text type="secondary">{role.description}</Text>
            </Card>
          </Col>
        ))}
      </Row>
      <Modal
        title="编辑角色名称"
        open={editingLevel !== null}
        onCancel={() => setEditingLevel(null)}
        onOk={handleSave}
        okText="保存"
      >
        <Form layout="vertical">
          <Form.Item label="角色名称">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </Form.Item>
          <Form.Item label="描述">
            <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ============= 店铺管理 =============
function StoreManager() {
  const { can, currentAccount } = useAuth();
  const stores = useLiveQuery(() => db.stores.orderBy('id').toArray(), [], []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const canManage = can(PERM.MANAGE_STORES);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (s) => {
    setEditing(s);
    form.setFieldsValue(s);
    setModalOpen(true);
  };

  const handleSave = async (values) => {
    try {
      if (editing) {
        await db.stores.update(editing.id, values);
        await writeLog({
          accountId: currentAccount?.id,
          action: LOG_ACTIONS.EDIT_STORE,
          targetType: 'store',
          targetId: editing.id,
          detail: `编辑店铺 ${values.name}`
        });
        message.success('更新成功');
      } else {
        const id = values.id || values.name?.replace(/\s/g, '_');
        if (!id) { message.error('请输入店铺ID'); return; }
        const exists = await db.stores.get(id);
        if (exists) { message.error('店铺ID已存在'); return; }
        await db.stores.put({ ...values, id, createdAt: Date.now() });
        await writeLog({
          accountId: currentAccount?.id,
          action: LOG_ACTIONS.ADD_STORE,
          targetType: 'store',
          targetId: id,
          detail: `新增店铺 ${values.name}`
        });
        message.success('添加成功');
      }
      setModalOpen(false);
    } catch (err) {
      message.error('操作失败：' + err.message);
    }
  };

  const handleDelete = async (s) => {
    if (s.id === 'default') {
      message.error('默认店铺不能删除');
      return;
    }
    try {
      await db.stores.delete(s.id);
      // 把该店铺的数据迁移到 default
      const txs = await db.transactions.where('storeId').equals(s.id).toArray();
      for (const t of txs) await db.transactions.update(t.id, { storeId: 'default' });
      const prs = await db.profitReports.where('storeId').equals(s.id).toArray();
      for (const p of prs) await db.profitReports.update(p.id, { storeId: 'default' });
      await writeLog({
        accountId: currentAccount?.id,
        action: LOG_ACTIONS.DELETE_STORE,
        targetType: 'store',
        targetId: s.id,
        detail: `删除店铺 ${s.name}，数据迁移到默认店铺`
      });
      message.success('删除成功，数据已迁移到默认店铺');
    } catch (err) {
      message.error('删除失败：' + err.message);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 120 },
    { title: '店铺名称', dataIndex: 'name', width: 180 },
    { title: '站点', dataIndex: 'site', width: 100 },
    { title: '币种', dataIndex: 'currency', width: 80 },
    {
      title: '操作',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} disabled={!canManage}>编辑</Button>
          <Popconfirm title="确定删除？该店铺数据将迁移到默认店铺" onConfirm={() => handleDelete(record)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
            <Button size="small" danger disabled={!canManage}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary">共 {stores?.length || 0} 个店铺</Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} disabled={!canManage}>新增店铺</Button>
      </div>
      {!canManage && <Alert type="warning" showIcon message="需要管理员权限才能管理店铺" style={{ marginBottom: 12 }} />}
      <Table rowKey="id" columns={columns} dataSource={stores} size="small" pagination={false} />
      <Modal title={editing ? '编辑店铺' : '新增店铺'} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="id" label="店铺 ID" rules={[{ required: !editing, message: '请输入店铺ID' }]}>
            <Input disabled={!!editing} placeholder="如：blue_ocean_us" />
          </Form.Item>
          <Form.Item name="name" label="店铺名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：蓝海易购-US" />
          </Form.Item>
          <Form.Item name="site" label="站点">
            <Input placeholder="如：美国 / 欧洲 / 日本" />
          </Form.Item>
          <Form.Item name="currency" label="币种" initialValue="USD">
            <Select>
              <Option value="USD">USD 美元</Option>
              <Option value="EUR">EUR 欧元</Option>
              <Option value="GBP">GBP 英镑</Option>
              <Option value="JPY">JPY 日元</Option>
              <Option value="CAD">CAD 加元</Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>{editing ? '保存' : '添加'}</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ============= 数据管理（精细化删除） =============
function DataManager() {
  const { can, currentAccount } = useAuth();
  const [txCount, setTxCount] = useState(0);
  const [prCount, setPrCount] = useState(0);
  const [logCount, setLogCount] = useState(0);
  const [monthOptions, setMonthOptions] = useState([]);
  const [storeOptions, setStoreOptions] = useState([]);

  React.useEffect(() => {
    (async () => {
      setTxCount(await db.transactions.count());
      setPrCount(await db.profitReports.count());
      setLogCount(await db.operationLogs.count());
      const months = await db.transactions.orderBy('month').uniqueKeys();
      setMonthOptions(months.sort().reverse());
      const stores = await db.stores.toArray();
      setStoreOptions(stores);
    })();
  }, []);

  const refreshCounts = async () => {
    setTxCount(await db.transactions.count());
    setPrCount(await db.profitReports.count());
    setLogCount(await db.operationLogs.count());
    const months = await db.transactions.orderBy('month').uniqueKeys();
    setMonthOptions(months.sort().reverse());
  };

  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);

  const handleDeleteByMonth = async () => {
    if (!selectedMonth) { message.warning('请选择月份'); return; }
    const txCount = await db.transactions.where('month').equals(selectedMonth).count();
    const prCount = await db.profitReports.where('month').equals(selectedMonth).count();
    Modal.confirm({
      title: '按月份删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定删除 ${selectedMonth} 的所有数据？\n将删除 ${txCount} 条交易明细，${prCount} 条利润报表`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await db.transactions.where('month').equals(selectedMonth).delete();
          await db.profitReports.where('month').equals(selectedMonth).delete();
          await writeLog({
            accountId: currentAccount?.id,
            action: LOG_ACTIONS.DELETE_BY_MONTH,
            targetType: 'month',
            targetId: selectedMonth,
            detail: `删除 ${selectedMonth} 数据：${txCount} 条交易，${prCount} 条利润报表`
          });
          message.success('删除成功');
          refreshCounts();
        } catch (err) {
          message.error('删除失败：' + err.message);
        }
      }
    });
  };

  const handleDeleteByStore = async () => {
    if (!selectedStore) { message.warning('请选择店铺'); return; }
    if (selectedStore === 'default') {
      Modal.confirm({
        title: '默认店铺',
        content: '默认店铺是兜底店铺，确定要清空其中所有数据吗？店铺本身不会删除。',
        okText: '清空数据',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => doDeleteStore(selectedStore)
      });
    } else {
      Modal.confirm({
        title: '按店铺删除',
        icon: <ExclamationCircleOutlined />,
        content: '确定删除该店铺的所有数据？店铺本身将保留。',
        okText: '确认删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => doDeleteStore(selectedStore)
      });
    }
  };

  const doDeleteStore = async (storeId) => {
    try {
      const txDel = await db.transactions.where('storeId').equals(storeId).delete();
      const prDel = await db.profitReports.where('storeId').equals(storeId).delete();
      await writeLog({
        accountId: currentAccount?.id,
        action: LOG_ACTIONS.DELETE_BY_STORE,
        targetType: 'store',
        targetId: storeId,
        detail: `删除店铺 ${storeId} 数据：${txDel} 条交易，${prDel} 条利润报表`
      });
      message.success('删除成功');
      refreshCounts();
    } catch (err) {
      message.error('删除失败：' + err.message);
    }
  };

  const handleDeleteByType = async (type) => {
    const typeName = type === 'tx' ? '交易明细' : '利润报表';
    const count = type === 'tx' ? txCount : prCount;
    Modal.confirm({
      title: `清空所有${typeName}`,
      icon: <ExclamationCircleOutlined />,
      content: `确定清空所有 ${typeName}？将删除 ${count} 条记录，此操作不可恢复。`,
      okText: '确认清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          if (type === 'tx') await db.transactions.clear();
          else await db.profitReports.clear();
          await writeLog({
            accountId: currentAccount?.id,
            action: LOG_ACTIONS.DELETE_BY_TYPE,
            targetType: type,
            detail: `清空所有${typeName}：${count} 条`
          });
          message.success('删除成功');
          refreshCounts();
        } catch (err) {
          message.error('删除失败：' + err.message);
        }
      }
    });
  };

  const handleDeleteAll = async () => {
    Modal.confirm({
      title: '清空全部业务数据',
      icon: <ExclamationCircleOutlined />,
      content: '确定清空所有交易明细、利润报表、导入日志、操作日志？账户和店铺配置保留。此操作不可恢复！',
      okText: '确认清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await db.cleanAll();
          await writeLog({
            accountId: currentAccount?.id,
            action: LOG_ACTIONS.DELETE_ALL,
            detail: '清空全部业务数据'
          });
          message.success('已清空');
          refreshCounts();
        } catch (err) {
          message.error('失败：' + err.message);
        }
      }
    });
  };

  const handleFactoryReset = async () => {
    Modal.confirm({
      title: '工厂重置（危险！）',
      icon: <ExclamationCircleOutlined style={{ color: 'red' }} />,
      content: '这将删除所有数据（包括账户、店铺、配置），恢复到初始状态。\n默认账户 admin/admin123 将重新创建。\n确定要继续吗？',
      okText: '确认重置',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await db.factoryReset();
          message.success('已重置，请重新登录');
          setTimeout(() => { window.location.reload(); }, 1500);
        } catch (err) {
          message.error('失败：' + err.message);
        }
      }
    });
  };

  const canDeleteType = can(PERM.DELETE_BY_TYPE);
  const canDeleteMonth = can(PERM.DELETE_BY_MONTH);
  const canDeleteStore = can(PERM.DELETE_BY_STORE);
  const canDeleteAll = can(PERM.DELETE_ALL);
  const canFactoryReset = can(PERM.FACTORY_RESET);

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="交易明细" value={txCount} suffix="条" />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="利润报表" value={prCount} suffix="条" />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="操作日志" value={logCount} suffix="条" />
          </Card>
        </Col>
      </Row>

      <Divider />

      <Title level={5}>精细化删除</Title>

      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card size="small" title="按月份删除" extra={<Tag color="orange">Lv.3</Tag>}>
            <Space.Compact style={{ width: '100%' }}>
              <Select
                style={{ width: '70%' }}
                placeholder="选择月份"
                value={selectedMonth}
                onChange={setSelectedMonth}
                options={monthOptions.map((m) => ({ value: m, label: m }))}
                size="small"
                disabled={!canDeleteMonth}
              />
              <Button danger size="small" onClick={handleDeleteByMonth} disabled={!canDeleteMonth}>
                删除该月
              </Button>
            </Space.Compact>
            {!canDeleteMonth && <Text type="secondary" style={{ fontSize: 12 }}>需要高级用户权限</Text>}
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="按店铺删除" extra={<Tag color="orange">Lv.3</Tag>}>
            <Space.Compact style={{ width: '100%' }}>
              <Select
                style={{ width: '70%' }}
                placeholder="选择店铺"
                value={selectedStore}
                onChange={setSelectedStore}
                options={storeOptions.map((s) => ({ value: s.id, label: s.name }))}
                size="small"
                disabled={!canDeleteStore}
              />
              <Button danger size="small" onClick={handleDeleteByStore} disabled={!canDeleteStore}>
                删除该店
              </Button>
            </Space.Compact>
            {!canDeleteStore && <Text type="secondary" style={{ fontSize: 12 }}>需要高级用户权限</Text>}
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="按类型清空" extra={<Tag color="orange">Lv.3</Tag>}>
            <Space>
              <Button danger size="small" onClick={() => handleDeleteByType('tx')} disabled={!canDeleteType}>
                清空所有交易明细
              </Button>
              <Button danger size="small" onClick={() => handleDeleteByType('pr')} disabled={!canDeleteType}>
                清空所有利润报表
              </Button>
            </Space>
            {!canDeleteType && <Text type="secondary" style={{ fontSize: 12 }}>需要高级用户权限</Text>}
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="清空全部业务数据" extra={<Tag color="red">Lv.4</Tag>}>
            <Button danger onClick={handleDeleteAll} disabled={!canDeleteAll}>
              清空全部（保留账户/店铺配置）
            </Button>
            {!canDeleteAll && <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>需要管理员权限</Text>}
          </Card>
        </Col>
      </Row>

      <Divider />

      <Card size="small" title="工厂重置" extra={<Tag color="red">Lv.4 危险</Tag>} style={{ borderColor: '#ff4d4f' }}>
        <Button danger type="primary" onClick={handleFactoryReset} disabled={!canFactoryReset}>
          恢复出厂设置
        </Button>
        <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
          删除所有数据，恢复默认账户 admin/admin123
        </Text>
      </Card>
    </div>
  );
}

// ============= 操作日志 =============
function LogViewer() {
  const { can } = useAuth();
  const [logs, setLogs] = useState([]);
  const [filterAction, setFilterAction] = useState('');

  React.useEffect(() => {
    (async () => {
      const rows = await db.operationLogs.orderBy('createdAt').reverse().limit(200).toArray();
      setLogs(rows);
    })();
  }, [filterAction]);

  const canView = can(PERM.VIEW_LOGS);

  // 查账户名
  const accountMap = useMemo(() => {
    const m = {};
    return m;
  }, []);

  const columns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm:ss')
    },
    { title: '账户ID', dataIndex: 'accountId', width: 80 },
    {
      title: '操作类型',
      dataIndex: 'action',
      width: 160,
      render: (v) => <Tag>{actionLabels[v] || v}</Tag>
    },
    { title: '目标类型', dataIndex: 'targetType', width: 100 },
    { title: '目标ID', dataIndex: 'targetId', width: 140, ellipsis: true },
    { title: '详情', dataIndex: 'detail', ellipsis: true }
  ];

  if (!canView) {
    return <Alert type="warning" showIcon message="需要高级用户权限才能查看操作日志" />;
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Select
          placeholder="筛选操作类型"
          style={{ width: 200 }}
          allowClear
          value={filterAction || undefined}
          onChange={setFilterAction}
          size="small"
          options={Object.entries(actionLabels).map(([k, v]) => ({ value: k, label: v }))}
        />
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filterAction ? logs.filter((l) => l.action === filterAction) : logs}
        size="small"
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
}
