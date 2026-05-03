┌─────────────────────────────────────────────────────────────┐
│  Two API endpoints:                                         │
│                                                             │
│  POST /auth/sendOTP                                         │
│    Input:  { mobile, scope }                                │
│    Action: 1. Validate mobile                               │
│            2. Check user exists for this scope              │
│            3. Generate 6-digit OTP                          │
│            4. Store in DB (with expiry)                     │
│            5. Send via MSG91 (or log to console in dev)     │
│    Output: { success, expiresIn }                           │
│                                                             │
│  POST /auth/verifyOTP                                       │
│    Input:  { mobile, otp, scope }                           │
│    Action: 1. Look up active OTP                            │
│            2. Check matches, not expired, not used          │
│            3. Mark OTP as used                              │
│            4. Generate JWT with user info + roles           │
│    Output: { token, user, roles }                           │
└─────────────────────────────────────────────────────────────┘
Field meanings:

mobile — who the OTP was sent to
code — the 6-digit code (we'll also support a fixed dev code like "000000")
scope — 'owner' | 'super_admin' | 'society'
scopeRef — the slug context: super admin slug or society slug (null for owner)
attempts — to lock after too many wrong tries
isUsed — prevents reuse after successful verification
expiresAt — typically 5 minutes from creation