package main

import (
	"errors"
	"strings"
	"unicode"

	goaway "github.com/TwiN/go-away"
)

const (
	minNicknameLength = 2
	maxNicknameLength = 14
)

func sanitizeNickname(raw string) (string, error) {
	trimmed := strings.Join(strings.Fields(strings.TrimSpace(raw)), " ")
	if trimmed == "" {
		return "", errors.New("nickname is required")
	}
	if len([]rune(trimmed)) < minNicknameLength || len([]rune(trimmed)) > maxNicknameLength {
		return "", errors.New("nickname must be 2-14 characters")
	}
	for _, r := range trimmed {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == ' ' || r == '_' || r == '-' {
			continue
		}
		return "", errors.New("nickname contains invalid characters")
	}
	return trimmed, nil
}

func nicknameAbusive(nick string) error {
	if goaway.IsProfane(nick) {
		return errors.New("invalid nickname")
	}
	return nil
}
