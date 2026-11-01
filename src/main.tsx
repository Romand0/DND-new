// DM Toolkit - React Entry Point
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initCampaignScopeFromStorage } from './data/campaignScope'

// 渲染前同步初始化团组分桶键：保证各 store 首次 load 就落到当前团组的 localStorage 桶
initCampaignScopeFromStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
