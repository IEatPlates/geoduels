package persistence

import "testing"

func TestGoogleOnboardedAt(t *testing.T) {
	if got := googleOnboardedAt(false); got != nil {
		t.Fatalf("expected non-guest google users to keep current onboarding state")
	}
	if got := googleOnboardedAt(true); got == nil {
		t.Fatalf("expected linked guest users to stay onboarded")
	}
}

func TestChooseGoogleIdentityUser(t *testing.T) {
	tests := []struct {
		name                     string
		existingGoogleUserID     string
		existingEmailUserID      string
		existingEmailAccountType string
		linkUserID               string
		linkAccountType          string
		wantUserID               string
		wantLinkedGuest          bool
		wantGenerated            bool
	}{
		{
			name:                 "existing google identity wins over guest link",
			existingGoogleUserID: "registered-google-user",
			linkUserID:           "guest-user",
			linkAccountType:      "guest",
			wantUserID:           "registered-google-user",
		},
		{
			name:                     "existing registered email wins over guest link",
			existingEmailUserID:      "registered-email-user",
			existingEmailAccountType: "registered",
			linkUserID:               "guest-user",
			linkAccountType:          "guest",
			wantUserID:               "registered-email-user",
		},
		{
			name:                     "existing guest email is upgraded before guest link",
			existingEmailUserID:      "email-guest-user",
			existingEmailAccountType: "guest",
			linkUserID:               "current-guest-user",
			linkAccountType:          "guest",
			wantUserID:               "email-guest-user",
			wantLinkedGuest:          true,
		},
		{
			name:            "guest link upgrades guest when no registered account exists",
			linkUserID:      "guest-user",
			linkAccountType: "guest",
			wantUserID:      "guest-user",
			wantLinkedGuest: true,
		},
		{
			name:            "registered link is not migrated",
			linkUserID:      "registered-link-user",
			linkAccountType: "registered",
			wantGenerated:   true,
		},
		{
			name:          "new google user gets generated id",
			wantGenerated: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotUserID, gotLinkedGuest := chooseGoogleIdentityUser(tt.existingGoogleUserID, tt.existingEmailUserID, tt.existingEmailAccountType, tt.linkUserID, tt.linkAccountType)
			if tt.wantGenerated {
				if gotUserID == "" || gotUserID == tt.linkUserID || gotUserID == tt.existingGoogleUserID || gotUserID == tt.existingEmailUserID {
					t.Fatalf("expected generated user id, got %q", gotUserID)
				}
			} else if gotUserID != tt.wantUserID {
				t.Fatalf("user id = %q, want %q", gotUserID, tt.wantUserID)
			}
			if gotLinkedGuest != tt.wantLinkedGuest {
				t.Fatalf("linked guest = %v, want %v", gotLinkedGuest, tt.wantLinkedGuest)
			}
		})
	}
}
