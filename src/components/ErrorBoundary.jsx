import React from 'react';
import { Result, Button } from 'antd';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
          <Result
            status="error"
            title="页面加载失败"
            subTitle="抱歉，页面渲染时发生了错误。请尝试刷新页面或返回首页。"
            extra={[
              <Button type="primary" key="reload" onClick={this.handleReload}>
                刷新页面
              </Button>,
              <Button key="home" onClick={this.handleGoHome}>
                返回首页
              </Button>
            ]}
          >
            <div style={{ textAlign: 'left', background: '#fff', padding: 16, borderRadius: 4, maxHeight: 300, overflow: 'auto' }}>
              <p style={{ fontWeight: 'bold', marginBottom: 8 }}>错误信息：</p>
              <pre style={{ fontSize: 12, color: '#cf1322', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {this.state.error?.toString()}
              </pre>
              {this.state.errorInfo && (
                <>
                  <p style={{ fontWeight: 'bold', marginTop: 16, marginBottom: 8 }}>组件堆栈：</p>
                  <pre style={{ fontSize: 11, color: '#595959', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                </>
              )}
            </div>
          </Result>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
