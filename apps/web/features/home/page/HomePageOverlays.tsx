import EndMatchOverlay from "../../../components/ui/EndMatchOverlay";
import NicknameOnboardingModal from "../../../components/home/NicknameOnboardingModal";
import type {
  HomeActions,
  HomeAuthView,
  HomeOverlaysView,
} from "../model/types";

type HomePageOverlaysProps = {
  auth: HomeAuthView;
  overlays: HomeOverlaysView;
  actions: Pick<
    HomeActions,
    | "setNicknameInput"
    | "submitOnboardingNickname"
    | "leaveGame"
    | "reportPlayer"
    | "startSingleplayer"
  >;
};

export default function HomePageOverlays({
  auth,
  overlays,
  actions,
}: HomePageOverlaysProps) {
  return (
    <>
      <NicknameOnboardingModal
        open={overlays.onboardingOpen}
        nicknameInput={auth.nicknameInput}
        nicknameError={auth.nicknameError}
        nicknameSaving={auth.nicknameSaving}
        onChangeNickname={actions.setNicknameInput}
        onSubmit={() => void actions.submitOnboardingNickname()}
      />
      {overlays.endMatch.open && (
        <EndMatchOverlay
          onLeaveGame={actions.leaveGame}
          mode={overlays.endMatch.mode}
          outcome={overlays.endMatch.outcome}
          selfName={overlays.endMatch.selfName}
          opponentName={overlays.endMatch.opponentName}
          opponentUserId={overlays.endMatch.opponentUserId}
          selfElo={overlays.endMatch.selfElo}
          opponentElo={overlays.endMatch.opponentElo}
          selfEloDelta={overlays.endMatch.selfEloDelta}
          opponentEloDelta={overlays.endMatch.opponentEloDelta}
          selfHP={overlays.endMatch.selfHP}
          oppHP={overlays.endMatch.oppHP}
          selfAvatarUrl={overlays.endMatch.selfAvatarUrl}
          oppAvatarUrl={overlays.endMatch.oppAvatarUrl}
          selfFallback={overlays.endMatch.selfFallback}
          oppFallback={overlays.endMatch.oppFallback}
          selfIsAdmin={overlays.endMatch.selfIsAdmin}
          opponentIsAdmin={overlays.endMatch.opponentIsAdmin}
          totalScore={overlays.endMatch.totalScore}
          roundResults={overlays.endMatch.roundResults}
          resultPlayerNames={overlays.endMatch.resultPlayerNames}
          resultPlayerAvatars={overlays.endMatch.resultPlayerAvatars}
          resultPlayerFallbacks={overlays.endMatch.resultPlayerFallbacks}
          onReportPlayer={actions.reportPlayer}
          onPlayAgain={
            overlays.endMatch.mode === "singleplayer"
              ? actions.startSingleplayer
              : undefined
          }
          asPage
        />
      )}
    </>
  );
}
