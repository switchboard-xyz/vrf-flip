import { useMemo } from 'react';
import NavigationBar from './components/NavigationBar';
import DataLayer from './data';
import Router from './Router';

import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import {
  SolflareWalletAdapter,
  PhantomWalletAdapter,
} from '@solana/wallet-adapter-wallets';

// Default styles that can be overridden by your app
import '@solana/wallet-adapter-react-ui/styles.css';

const App: React.FC = () => {
  document.body.style.backgroundColor = '#1c1c1c';

  // wallet connection
  const network = WalletAdapterNetwork.Devnet;
  const rpcEndpoint = useMemo(() => clusterApiUrl(network), [network]);
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    [network]
  );

  return (
    <ConnectionProvider endpoint={rpcEndpoint}>
      <WalletProvider wallets={wallets} autoConnect>
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
