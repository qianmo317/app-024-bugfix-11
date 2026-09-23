import { useEffect, useState } from 'react';
import { useAppState, useRoute, type Route } from './ui/router';
import { RiddleList } from './pages/RiddleList';
import { RiddleEdit } from './pages/RiddleEdit';
import { PrintPage } from './pages/PrintPage';
import { Onsite } from './pages/Onsite';
import { Library } from './pages/Library';
import { Settings } from './pages/Settings';

const NAV: { href: string; label: string; match: Route['name'] }[] = [
  { href: '#/', label: '谜库', match: 'list' },
  { href: '#/print', label: '出条打印', match: 'print' },
  { href: '#/onsite', label: '现场登记', match: 'onsite' },
  { href: '#/library', label: '谜格说明', match: 'library' },
  { href: '#/settings', label: '设置', match: 'settings' },
];

export function App() {
  const state = useAppState();
  const route = useRoute();
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="topbar-inner">
          <a className="brand" href="#/">
            <span className="brand-lantern" aria-hidden>🏮</span>
            <span>
              <b>元宵灯谜库</b>
              <small>Lantern Riddle Bank</small>
            </span>
          </a>
          <nav className="nav">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className={route.name === n.match ? 'active' : ''}>{n.label}</a>
            ))}
          </nav>
          <div className="topbar-status">
            {!online && <span className="badge badge-offline">离线模式 · 数据保存在本机</span>}
            {!state.ready && <span className="badge">加载中…</span>}
            {state.ready && state.ctx.loadError && (
              <span className="badge badge-warn" title={state.ctx.loadError}>校验数据未加载</span>
            )}
          </div>
        </div>
      </header>

      {!state.ready ? (
        <main className="container"><p className="muted">正在加载本地数据…</p></main>
      ) : (
        <main className="container">
          {route.name === 'list' && <RiddleList />}
          {route.name === 'edit' && <RiddleEdit id={route.id} />}
          {route.name === 'print' && <PrintPage />}
          {route.name === 'onsite' && <Onsite />}
          {route.name === 'library' && <Library />}
          {route.name === 'settings' && <Settings />}
        </main>
      )}

      <footer className="footer no-print">
        <span>全部数据保存在本机浏览器（IndexedDB），断网可用</span>
      </footer>
    </div>
  );
}
