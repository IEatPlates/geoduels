package main

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

const guestSignupRateLimitKeyPrefix = "api:ratelimit:guest_signup:ip:"

var guestSignupRateLimitScript = redis.NewScript(`
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return {count, ttl}
`)

func (a *api) checkGuestSignupRateLimit(r *http.Request) (bool, time.Duration, error) {
	if a.guestSignupIPLimit <= 0 {
		return true, 0, nil
	}
	if a.redis == nil {
		return false, 0, errors.New("guest signup rate limit requires redis")
	}
	window := a.guestSignupIPWindow
	if window <= 0 {
		window = 10 * time.Minute
	}
	ip := a.clientIP(r)
	if ip == "" {
		ip = "unknown"
	}
	ctx, cancel := context.WithTimeout(r.Context(), 500*time.Millisecond)
	defer cancel()

	key := guestSignupRateLimitKeyPrefix + ip
	result, err := guestSignupRateLimitScript.Run(ctx, a.redis, []string{key}, window.Milliseconds()).Slice()
	if err != nil {
		return false, 0, err
	}
	if len(result) != 2 {
		return false, 0, errors.New("unexpected guest signup rate limit response")
	}
	count, err := redisInt64(result[0])
	if err != nil {
		return false, 0, err
	}
	ttlMillis, err := redisInt64(result[1])
	if err != nil {
		return false, 0, err
	}
	if count <= int64(a.guestSignupIPLimit) {
		return true, 0, nil
	}
	retryAfter := time.Duration(ttlMillis) * time.Millisecond
	if retryAfter <= 0 {
		retryAfter = window
	}
	return false, retryAfter, nil
}

func writeRateLimited(w http.ResponseWriter, retryAfter time.Duration) {
	if retryAfter > 0 {
		seconds := int(retryAfter.Round(time.Second).Seconds())
		if seconds < 1 {
			seconds = 1
		}
		w.Header().Set("Retry-After", strconv.Itoa(seconds))
	}
	http.Error(w, "too many guest signups", http.StatusTooManyRequests)
}

func redisInt64(v any) (int64, error) {
	switch n := v.(type) {
	case int64:
		return n, nil
	case int:
		return int64(n), nil
	case string:
		return strconv.ParseInt(n, 10, 64)
	default:
		return 0, errors.New("unexpected redis integer type")
	}
}
