package main

import (
	"errors"

	"geoduels/pkg/contracts"
	"geoduels/pkg/duel"
	"geoduels/pkg/singleplayer"
)

type gameplayRuntime interface {
	Mode() contracts.MatchMode
	CreateMatch(matchID string, playerIDs []string, profiles map[string]contracts.PlayerProfile, unranked bool) error
	GetSnapshot(matchID string) (*contracts.MatchSnapshot, error)
	SubmitGuess(g contracts.GuessPayload) (*contracts.MatchSnapshot, error)
	AdvanceRound(matchID, userID string) (*contracts.MatchSnapshot, error)
	Forfeit(matchID, userID string) (*contracts.MatchSnapshot, error)
	MarkDisconnected(matchID, userID string) (*contracts.MatchSnapshot, error)
	MarkResumed(matchID, userID string) (*contracts.MatchSnapshot, error)
	Tick() []string
}

type duelRuntime struct {
	engine *duel.Engine
}

func (r duelRuntime) Mode() contracts.MatchMode { return contracts.ModeDuel }

func (r duelRuntime) CreateMatch(matchID string, playerIDs []string, profiles map[string]contracts.PlayerProfile, unranked bool) error {
	_, err := r.engine.CreateMatchWithOptions(matchID, playerIDs, profiles, duel.MatchOptions{Unranked: unranked})
	return err
}

func (r duelRuntime) GetSnapshot(matchID string) (*contracts.MatchSnapshot, error) {
	return r.engine.GetSnapshot(matchID)
}

func (r duelRuntime) SubmitGuess(g contracts.GuessPayload) (*contracts.MatchSnapshot, error) {
	return r.engine.SubmitGuess(g)
}

func (r duelRuntime) AdvanceRound(matchID, userID string) (*contracts.MatchSnapshot, error) {
	return nil, errors.New("advance round is not supported for duel")
}

func (r duelRuntime) Forfeit(matchID, userID string) (*contracts.MatchSnapshot, error) {
	return r.engine.Forfeit(matchID, userID)
}

func (r duelRuntime) MarkDisconnected(matchID, userID string) (*contracts.MatchSnapshot, error) {
	return r.engine.MarkDisconnected(matchID, userID)
}

func (r duelRuntime) MarkResumed(matchID, userID string) (*contracts.MatchSnapshot, error) {
	return r.engine.MarkResumed(matchID, userID)
}

func (r duelRuntime) Tick() []string {
	return r.engine.Tick()
}

type singleplayerRuntime struct {
	engine *singleplayer.Engine
}

func (r singleplayerRuntime) Mode() contracts.MatchMode { return contracts.ModeSingleplayer }

func (r singleplayerRuntime) CreateMatch(matchID string, playerIDs []string, profiles map[string]contracts.PlayerProfile, unranked bool) error {
	_, err := r.engine.CreateMatch(matchID, playerIDs, profiles)
	return err
}

func (r singleplayerRuntime) GetSnapshot(matchID string) (*contracts.MatchSnapshot, error) {
	return r.engine.GetSnapshot(matchID)
}

func (r singleplayerRuntime) SubmitGuess(g contracts.GuessPayload) (*contracts.MatchSnapshot, error) {
	return r.engine.SubmitGuess(g)
}

func (r singleplayerRuntime) AdvanceRound(matchID, userID string) (*contracts.MatchSnapshot, error) {
	return r.engine.AdvanceRound(matchID, userID)
}

func (r singleplayerRuntime) Forfeit(matchID, userID string) (*contracts.MatchSnapshot, error) {
	return r.engine.Forfeit(matchID, userID)
}

func (r singleplayerRuntime) MarkDisconnected(matchID, userID string) (*contracts.MatchSnapshot, error) {
	return r.engine.MarkDisconnected(matchID, userID)
}

func (r singleplayerRuntime) MarkResumed(matchID, userID string) (*contracts.MatchSnapshot, error) {
	return r.engine.MarkResumed(matchID, userID)
}

func (r singleplayerRuntime) Tick() []string { return nil }
