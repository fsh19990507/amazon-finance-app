// 帮助中心页 —— 快速上手、注意事项、常见问题 FAQ、报表字典
// 面向零基础用户：默认账号说明、6 类报表导入步骤、离线/汇率/热力图/店铺对比注意事项、
// 常见问题解答（人话版 + 操作步骤）、6 类报表的下载路径与解读说明
import React from 'react';
import {
  Tabs, Card, Alert, List, Tag, Collapse, Table, Typography
} from 'antd';

const { Title, Text } = Typography;

// ============= 报表字典数据（Tab4 共用） =============

// 6 类报表：名称 / 卖家中心下载路径 / 能解读什么
const reportDict = [
  {
    key: 'transaction',
    name: '交易明细',
    download: '卖家中心 → 数据报告 → 付款 → 所有结算 → 交易明细',
    desc: '每笔交易的日期、交易状态/类型、订单号、商品、价格构成（商品价/促销/亚马逊费用/合计）'
  },
  {
    key: 'profit',
    name: '利润报表',
    download: '卖家中心 → 数据报告 → 付款 → 自定义导出利润报表（店铺月度汇总）',
    desc: '店铺级月度利润全景：销售额、退款、广告花费、仓储费、毛利率、ROI 等 165 项指标'
  },
  {
    key: 'settlement',
    name: '英文结算报表',
    download: '卖家中心 → 数据报告 → 付款 → 所有结算 → Settlement Report V2',
    desc: '每笔结算交易的结算 ID、起止日期、交易类型、订单/调整 ID、金额构成与总金额'
  },
  {
    key: 'business',
    name: '业务报告',
    download: '卖家中心 → 数据报告 → 业务报告 → 销售量与访问量（Sales & Traffic）',
    desc: '每日流量与销量：访问量、页面浏览量、购买按钮赢得率、转化率、订单数与销售额'
  },
  {
    key: 'ad',
    name: '广告报告',
    download: '卖家中心 → 广告 → 衡量和报告 → 广告活动报告（SP/SD/SB）',
    desc: '广告活动表现：曝光、点击、CTR、花费、销售额、ACOS、ROAS、订单数'
  },
  {
    key: 'inventory',
    name: '库存报告',
    download: '卖家中心 → 库存 → 库存报告 → 所有库存报告（FBA 库存 / 滞留 / 赔偿）',
    desc: '库存数量（可用/预留/在途/总库存）、滞留原因、库存赔偿记录'
  }
];

const dictionaryColumns = [
  { title: '报表名称', dataIndex: 'name', width: 110 },
  { title: '从哪下载（卖家中心路径）', dataIndex: 'download', width: 340 },
  { title: '能解读什么', dataIndex: 'desc' }
];

// ============= Tab 内容 =============

const tabItems = [
  {
    key: 'quick-start',
    label: '快速上手',
    children: (
      <div>
        {/* 账号说明 */}
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="默认账号说明"
          description={
            <span>
              默认登录账号为 <Text strong>admin</Text>，密码为 <Text strong>admin</Text>。
              首次登录后请尽快修改密码：进入「系统设置 → 账户管理」修改，避免账号被他人使用。
            </span>
          }
        />
        {/* 6 类报表导入步骤 */}
        <Card title="6 类报表导入步骤" size="small">
          <List
            dataSource={[
              { title: '下载报表', description: '从亚马逊卖家中心下载对应报表（各报表下载路径见「报表字典」标签）' },
              { title: '打开导入页', description: '进入本系统「数据导入」页面' },
              { title: '上传文件', description: '将 Excel / CSV 文件拖拽到上传区域，或点击选择文件' },
              { title: '自动识别类型', description: '系统自动识别报表类型：交易明细 / 利润报表 / 英文结算报表 / 业务报告 / 广告报告 / 库存报告' },
              { title: '查看导入结果', description: '导入完成后展示报告：成功条数、重复跳过条数；重复数据自动跳过，不会叠加' },
              { title: '去分析页面查看', description: '导入成功后，到对应的数据 / 分析页面查看报表解读结果' }
            ]}
            renderItem={(item, index) => (
              <List.Item>
                <List.Item.Meta
                  avatar={<Tag color="blue">{index + 1}</Tag>}
                  title={item.title}
                  description={item.description}
                />
              </List.Item>
            )}
          />
        </Card>
      </div>
    )
  },
  {
    key: 'notice',
    label: '注意事项',
    children: (
      <List
        bordered
        dataSource={[
          {
            tag: '离线',
            color: 'orange',
            title: '离线模式说明',
            description: '数据默认存本机；配置 GitHub 私有仓库（免费）后自动云端同步。云端不可达时自动使用本地缓存，数据不丢，恢复后自动补传。'
          },
          {
            tag: '汇率',
            color: 'blue',
            title: '汇率自动更新',
            description: '汇率每 60 分钟自动更新一次；切换回页面超过 30 分钟、或断网恢复时也会自动刷新。把鼠标悬停在顶栏汇率数字上，可查看最近一次更新时间。'
          },
          {
            tag: '热力图',
            color: 'green',
            title: '热力图解读',
            description: '销售额热力图中，格子颜色越深代表当天销售额越高，颜色越浅越低；灰色格子表示当天没有数据。'
          },
          {
            tag: '对比',
            color: 'purple',
            title: '店铺对比',
            description: '管理员可在顶栏切换「对比模式」，勾选多个店铺后即可横向对比各店铺的销售额、利润等核心指标。'
          }
        ]}
        renderItem={(item) => (
          <List.Item>
            <List.Item.Meta
              avatar={<Tag color={item.color}>{item.tag}</Tag>}
              title={item.title}
              description={item.description}
            />
          </List.Item>
        )}
      />
    )
  },
  {
    key: 'faq',
    label: '常见问题 FAQ',
    children: (
      <Collapse
        items={[
          {
            key: 'faq-cloud',
            label: '云端连不上怎么办？',
            children: (
              <div>
                <p><Text strong>人话解答：</Text>系统数据可存到 GitHub 私有仓库（免费云端）。云端不可达时会自动改用你本机缓存的旧数据，期间功能不受影响，数据不会丢。</p>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>检查网络：确认能正常上网（可以试着打开其他网站）</li>
                  <li>未配置云端：数据只在本地时，属正常「本地模式」。到「设置 → 云端同步」配置 GitHub 仓库即可上云</li>
                  <li>Token 失效：如曾配置过云端但失效，到「设置 → 云端同步」重新填入 Token 测试连接</li>
                  <li>数据安全：离线期间的数据，云端恢复后会自动补传同步</li>
                </ul>
              </div>
            )
          },
          {
            key: 'faq-login',
            label: '登录不进去怎么办？',
            children: (
              <div>
                <p><Text strong>人话解答：</Text>登录需要联网验证账号密码。云端连不上、密码输错、账号不存在都会导致登录失败。</p>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>确认账号密码：默认账号 admin / 密码 admin（注意区分大小写）</li>
                  <li>密码不对：请管理员在「系统设置 → 账户管理」中重置密码</li>
                  <li>网络问题：参照「云端连不上」的检查步骤，联网后重试</li>
                  <li>仍无法登录：联系管理员确认账号是否已被停用或删除</li>
                </ul>
              </div>
            )
          },
          {
            key: 'faq-header',
            label: '导入报「表头不匹配」怎么办？',
            children: (
              <div>
                <p><Text strong>人话解答：</Text>系统靠第一行的列名（表头）来识别报表。表头对不上就识别不了，这不是文件损坏，而是格式不对。</p>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>确认报表类型：在卖家中心下载对应类型的原始报表（见「报表字典」）</li>
                  <li>不要改动表头：不要修改/删除第一行列名，不要合并单元格</li>
                  <li>用原始文件：上传卖家中心导出的原始文件，不要用二次加工过的版本</li>
                  <li>仍然失败：查看「报表字典」确认格式要求，或联系管理员协助</li>
                </ul>
              </div>
            )
          },
          {
            key: 'faq-rate',
            label: '汇率不更新怎么办？',
            children: (
              <div>
                <p><Text strong>人话解答：</Text>汇率每 60 分钟自动更新，且必须能连上汇率服务；断网时会沿用上一次的汇率。</p>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>查看更新时间：鼠标悬停顶栏汇率数字，看「最近更新时间」是否很久以前</li>
                  <li>手动刷新：按 F5 刷新页面，会立即触发重新获取</li>
                  <li>检查网络：汇率更新依赖外网接口，网络不通时无法更新</li>
                  <li>耐心等待：网络正常的情况下，最多 60 分钟会自动更新</li>
                </ul>
              </div>
            )
          },
          {
            key: 'faq-mobile',
            label: '手机打开白屏怎么办？',
            children: (
              <div>
                <p><Text strong>人话解答：</Text>白屏通常是浏览器版本太旧、缓存了旧页面、或某些手机浏览器省流量模式拦截了页面，跟你的数据没有关系。</p>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>换浏览器：使用 Chrome 或手机自带浏览器的较新版本打开</li>
                  <li>清理缓存：在浏览器设置中清除本网站的缓存和 Cookie 后重新打开</li>
                  <li>强制刷新：电脑上按 Ctrl+F5；手机上在浏览器菜单选择「刷新」或「重新加载」</li>
                  <li>关闭省流量模式：部分浏览器开启省流量/极速模式会拦截页面脚本</li>
                </ul>
              </div>
            )
          },
          {
            key: 'faq-duplicate',
            label: '数据重复导入怎么办？',
            children: (
              <div>
                <p><Text strong>人话解答：</Text>系统已经按「去重键」自动去重，重复的行会被跳过并计入「重复跳过」，不会叠加成两条。</p>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>直接重新导入：重复的数据会自动跳过，不会重复入库</li>
                  <li>核对结果：在「数据导入 → 导入报告」里查看成功 / 重复条数</li>
                  <li>怀疑数据异常：可在「导入历史」里对照每次导入的条数，或联系管理员检查</li>
                </ul>
              </div>
            )
          },
          {
            key: 'faq-clear',
            label: '想清空所有数据怎么办？',
            children: (
              <div>
                <p><Text strong>人话解答：</Text>清空会删除全部 6 类报表数据且不可恢复，请先确认已不再需要这些数据。</p>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>进入「数据导入」页面</li>
                  <li>点击右上角红色「清空所有数据」按钮</li>
                  <li>在弹窗中确认，即删除全部数据（不可恢复，请谨慎操作）</li>
                  <li>清空后需要重新导入报表才能继续分析</li>
                </ul>
              </div>
            )
          }
        ]}
        defaultActiveKey={[]}
      />
    )
  },
  {
    key: 'dictionary',
    label: '报表字典',
    children: (
      <Card size="small">
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          scroll={{ x: 900 }}
          dataSource={reportDict}
          columns={dictionaryColumns}
        />
      </Card>
    )
  }
];

export default function HelpCenter() {
  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>帮助中心</Title>
      <Tabs items={tabItems} />
    </div>
  );
}
