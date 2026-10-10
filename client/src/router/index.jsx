import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';

const Login = lazy(() => import('../pages/Login'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const Marketing = lazy(() => import('../pages/Marketing'));
const AiChat = lazy(() => import('../pages/AiChat'));
const BDesign = lazy(() => import('../pages/BDesign'));
const Crm = lazy(() => import('../pages/Crm'));
const Orders = lazy(() => import('../pages/Orders'));
const OrderDetail = lazy(() => import('../pages/Orders/Detail'));
const Production = lazy(() => import('../pages/Production'));
const DataCenter = lazy(() => import('../pages/DataCenter'));
const Cockpit = lazy(() => import('../pages/Cockpit'));
const Settings = lazy(() => import('../pages/Settings'));

// 所有懒加载页面的 import 函数，用于登录后预热，消除首次打开延时
const pageLoaders = [
  () => import('../pages/Login'), () => import('../pages/Dashboard'),
  () => import('../pages/Marketing'), () => import('../pages/AiChat'),
  () => import('../pages/BDesign'), () => import('../pages/Crm'),
  () => import('../pages/Orders'), () => import('../pages/Orders/Detail'),
  () => import('../pages/Production'), () => import('../pages/DataCenter'),
  () => import('../pages/Cockpit'), () => import('../pages/Settings'),
];

export function preloadPages() {
  pageLoaders.forEach((fn) => { fn().catch(() => { /* 预热失败不影响使用 */ }); });
}

export default createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'marketing', element: <Marketing /> },
      { path: 'ai-chat', element: <AiChat /> },
      { path: 'b-design', element: <BDesign /> },
      { path: 'crm', element: <Crm /> },
      { path: 'orders', element: <Orders /> },
      { path: 'orders/:id', element: <OrderDetail /> },
      { path: 'production', element: <Production /> },
      { path: 'data', element: <DataCenter /> },
      { path: 'cockpit', element: <Cockpit /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
