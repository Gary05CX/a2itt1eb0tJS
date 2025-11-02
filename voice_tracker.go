package main

import "sync"

// VoiceTracker keeps track of users' previous voice channel states so that
// join/leave/move events can be detected reliably.
type VoiceTracker struct {
	mu     sync.RWMutex
	states map[string]string
}

func NewVoiceTracker() *VoiceTracker {
	return &VoiceTracker{
		states: make(map[string]string),
	}
}

// key returns a deterministic key for the guild/user combination.
func (vt *VoiceTracker) key(guildID, userID string) string {
	return guildID + ":" + userID
}

// Get returns the channel ID previously recorded for this guild/user.
func (vt *VoiceTracker) Get(guildID, userID string) (string, bool) {
	vt.mu.RLock()
	defer vt.mu.RUnlock()
	channelID, ok := vt.states[vt.key(guildID, userID)]
	return channelID, ok
}

// Set records the channel ID for the guild/user combination.
func (vt *VoiceTracker) Set(guildID, userID, channelID string) {
	vt.mu.Lock()
	vt.states[vt.key(guildID, userID)] = channelID
	vt.mu.Unlock()
}

// Delete removes any record for the guild/user combination.
func (vt *VoiceTracker) Delete(guildID, userID string) {
	vt.mu.Lock()
	delete(vt.states, vt.key(guildID, userID))
	vt.mu.Unlock()
}
