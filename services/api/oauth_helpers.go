package main

import (
	"errors"
	"net/http"
	"strings"

	"geoduels/pkg/persistence"
)

func (a *api) resolveOAuthIdentity(r *http.Request, state oauthStateClaims, provider, providerUserID, email, displayName, avatarURL string) (persistence.Identity, error) {
	provider = strings.TrimSpace(strings.ToLower(provider))
	providerUserID = strings.TrimSpace(providerUserID)
	if provider == "" || providerUserID == "" {
		return persistence.Identity{}, errors.New("provider identity unavailable")
	}
	if banned, _, err := a.store.IsProviderIdentityBanned(provider, providerUserID); err != nil {
		return persistence.Identity{}, err
	} else if banned {
		return persistence.Identity{}, errors.New("provider identity banned")
	}
	if state.LinkSub != "" {
		return a.store.LinkProviderIdentity(provider, providerUserID, email, displayName, avatarURL, state.LinkSub)
	}
	identityExists, err := a.store.ProviderIdentityExists(provider, providerUserID)
	if err != nil {
		return persistence.Identity{}, err
	}
	if !identityExists {
		if banned, err := a.store.IsSignupIPBanned(a.clientIP(r)); err != nil {
			return persistence.Identity{}, errors.New("signup unavailable")
		} else if banned {
			return persistence.Identity{}, errors.New("signup unavailable")
		}
	}
	return a.store.UpsertProviderIdentity(provider, providerUserID, email, displayName, avatarURL, "")
}

func (a *api) oauthSessionPayload(provider, accessToken string, identity persistence.Identity, fallbackName, returnTo string) map[string]any {
	suggestedNick := defaultStr(identity.ProviderName, defaultStr(fallbackName, identity.DisplayName))
	return map[string]any{
		"ok":                    true,
		"provider":              provider,
		"accessToken":           accessToken,
		"onboardingRequired":    !identity.Onboarded,
		"suggestedNickname":     suggestedNick,
		"linkedProviders":       identity.LinkedProviders,
		"authMigrationRequired": false,
		"recoveryAvailable":     false,
		"canPlay":               identity.Onboarded && !identity.IsBanned,
		"returnTo":              returnTo,
		"user": map[string]any{
			"id":           identity.Sub,
			"display_name": defaultStr(identity.DisplayName, suggestedNick),
			"avatar_url":   identity.AvatarURL,
			"email":        identity.Email,
			"isGuest":      identity.AccountType == "guest",
			"isAdmin":      identity.IsAdmin,
			"isModerator":  identity.IsModerator,
		},
	}
}

func oauthUserError(err error) string {
	msg := strings.ToLower(strings.TrimSpace(err.Error()))
	switch {
	case strings.Contains(msg, "already linked"):
		return "This sign-in method is already linked to another account."
	case strings.Contains(msg, "identity banned"):
		return "This sign-in method is banned from GeoDuels."
	case strings.Contains(msg, "signup unavailable"):
		return "signup unavailable"
	default:
		return "persist identity failed"
	}
}
