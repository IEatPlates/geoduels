package main

import "testing"

func TestSanitizeNicknameMaxLength(t *testing.T) {
	if _, err := sanitizeNickname("FourteenChars!"); err == nil {
		t.Fatal("expected invalid character error")
	}
	if nick, err := sanitizeNickname("FourteenChars"); err != nil || nick != "FourteenChars" {
		t.Fatalf("sanitizeNickname 13 chars = %q, %v", nick, err)
	}
	if nick, err := sanitizeNickname("FourteenCharss"); err != nil || nick != "FourteenCharss" {
		t.Fatalf("sanitizeNickname 14 chars = %q, %v", nick, err)
	}
	if _, err := sanitizeNickname("FifteenCharssss"); err == nil {
		t.Fatal("expected nickname over 14 chars to fail")
	}
}
