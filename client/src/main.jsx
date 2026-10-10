import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import Router from './router';

dayjs.locale('zh-cn');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
          colorBgLayout: '#f5f6f8',
        },
      }}
    >
      <AntApp>
        {/* Suspense 边界：懒加载路由 chunk 未就绪时显示加载态，避免整页报错 */}
        <React.Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#1677ff', fontSize: 16 }}>页面加载中…</div>}>
          <RouterProvider router={Router} />
        </React.Suspense>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
