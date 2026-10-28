import React from 'react';
import ReactDOM from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App';
import './styles.css';

class StorageBoundary extends React.Component<{children: React.ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() {return {failed: true};}
  render() {
    if (this.state.failed) return <main className="storage-fallback"><h1>Your diary needs a little help.</h1><p>SnapBite could not open its local storage. Check that this browser allows site storage, then reload. Your existing data has not been intentionally cleared.</p><button className="primary-button" onClick={() => location.reload()}>Try again</button></main>;
    return this.props.children;
  }
}
registerSW({
  onNeedRefresh() {window.dispatchEvent(new Event('snapbite-update'));},
  onOfflineReady() {window.dispatchEvent(new Event('snapbite-offline'));},
});
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><StorageBoundary><App/></StorageBoundary></React.StrictMode>);
