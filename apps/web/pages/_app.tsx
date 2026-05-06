import type { AppProps } from 'next/app';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Head from 'next/head';
import Script from 'next/script';
import { Montserrat } from 'next/font/google';
import { useEffect, useState } from 'react';
import { getRuntimeConfig } from '../lib/runtime-config';
import 'leaflet/dist/leaflet.css';
import '../styles/globals.css';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat'
});

export default function App({ Component, pageProps }: AppProps) {
  const [config] = useState(() => getRuntimeConfig());
  const [adsenseScriptReady, setAdsenseScriptReady] = useState(false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: false
          }
        }
      })
  );

  useEffect(() => {
    setAdsenseScriptReady(config.adsenseClientId.startsWith('ca-pub-'));
  }, [config.adsenseClientId]);

  return (
    <>
      <Head>
        <link rel="icon" href="/icon.png" type="image/png" />
        <link rel="shortcut icon" href="/icon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icon.png" />
      </Head>
      {adsenseScriptReady ? (
        <Script
          id="adsense-script"
          async
          strategy="afterInteractive"
          crossOrigin="anonymous"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(config.adsenseClientId)}`}
        />
      ) : null}
      <div className={montserrat.variable}>
        <QueryClientProvider client={queryClient}>
          <Component {...pageProps} />
        </QueryClientProvider>
      </div>
    </>
  );
}
