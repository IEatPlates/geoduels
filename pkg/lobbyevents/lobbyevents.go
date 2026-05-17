package lobbyevents

import "strings"

const KindChanged = "changed"

func Channel(lobbyID string) string {
	return "lobby:events:" + strings.TrimSpace(lobbyID)
}
