import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef } from 'react';
import HomePageView from '../features/home/page/HomePageView';
import { useHomeModel } from '../features/home/model/useHomeModel';
import { getSiteURL } from '../lib/site';

export default function HomePage() {
  const router = useRouter();
  const lobbyInviteCode =
    router.isReady && typeof router.query.lobby === 'string'
      ? router.query.lobby
      : '';
  const handlePrivateLobbyEntered = useCallback(
    (inviteCode: string) => {
      void router.push(`/lobby/${encodeURIComponent(inviteCode)}`);
    },
    [router],
  );
  const model = useHomeModel({
    routeContext: 'home',
    lobbyInviteCode,
    onPrivateLobbyEntered: handlePrivateLobbyEntered
  });
  const prevMatchIdRef = useRef(model.view.meta.activeMatchId);
  const siteURL = getSiteURL();
  const canonicalURL = `${siteURL}/`;
  const title = 'GeoDuels | Multiplayer';
  const description =
    'Play GeoDuels, a competitive GeoGuessr-style multiplayer geography game with ranked duels, Street View rounds, and singleplayer practice.';

  useEffect(() => {
    const nextMatchId = model.view.meta.activeMatchId;
    const prevMatchId = prevMatchIdRef.current;
    prevMatchIdRef.current = nextMatchId;
    if (!nextMatchId || nextMatchId === prevMatchId) {
      return;
    }
    void router.push(`/match/${encodeURIComponent(nextMatchId)}`);
  }, [model.view.meta.activeMatchId, router]);

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href={canonicalURL} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="GeoDuels" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonicalURL} />
        <meta property="og:image" content={`${siteURL}/logo.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={`${siteURL}/logo.png`} />
      </Head>
      <HomePageView model={model} />
    </>
  );
}
