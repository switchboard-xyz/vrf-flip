import { useMemo } from 'react';
import NavigationBar from './components/NavigationBar';
import DataLayer from './data';
import Router from './Router';

import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import {
  BackpackWalletAdapter,
  SolflareWalletAdapter,
  PhantomWalletAdapter,
  NightlyWalletAdapter,
} from '@solana/wallet-adapter-wallets';

// Default styles that can be overridden by your app
import '@solana/wallet-adapter-react-ui/styles.css';

const App: React.FC = () => {
  document.body.style.backgroundColor = '#1c1c1c';

  // wallet connection
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  const wallets = useMemo(
    () => [
      new BackpackWalletAdapter(),
      new PhantomWalletAdapter(),
      new NightlyWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    [network]
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets}>
        <WalletModalProvider>
          <DataLayer>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <NavigationBar />
              <Router />
            </div>
          </DataLayer>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default App;
