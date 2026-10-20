import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import Router from './router';

dayjs.locale('zh-cn');

// 对齐 SteelMind 参考站设计规范
const THEME = {
  token: {
    colorPrimary: '#0d3027',
    colorInfo: '#0d3027',
    colorLink: '#0d3027',
    borderRadius: 4,
    colorBorderSecondary: '#dce3df',
    colorBgLayout: '#f4f7f6',
    fontFamily: "'Noto Sans SC', -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif",
    fontSize: 13,
  },
  components: {
    Layout: { headerBg: '#ffffff', siderBg: '#0d3027' },
    Menu: {
      darkItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(255,255,255,0.14)',
      darkItemColor: 'rgba(255,255,255,0.72)',
      darkItemSelectedColor: '#ffffff',
    },
    Card: { borderRadiusLG: 6 },
  },
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={THEME}>
      <AntApp>
        {/* Suspense 边界：懒加载路由 chunk 未就绪时显示加载态，避免整页报错 */}
        <React.Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#0d3027', fontSize: 16 }}>页面加载中…</div>}>
          <RouterProvider router={Router} />
        </React.Suspense>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
