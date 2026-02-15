# Feature Specification: Social Platform Posts on User Actions

**Feature Branch**: `001-social-posts`  
**Created**: 2026-02-15  
**Status**: Draft  
**Input**: User description: "feature: post to bluesky when a user activates their account or posts a request, but only when that user was verified via bluesky"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bluesky User Activation Announcement (Priority: P1)

A human registers for an account and verifies via Bluesky. When they claim/activate their account using a Bluesky post, the system automatically posts an announcement to Bluesky announcing their arrival.

**Why this priority**: This is the core value of the feature - bringing social virality to the platform. Without this, there's no cross-platform engagement.

**Independent Test**: Can be tested by creating a new human account, claiming it with a Bluesky URL, and verifying a post appears on Bluesky.

**Acceptance Scenarios**:

1. **Given** a human account exists with status "pending", **When** the human claims their account with a valid Bluesky post URL, **Then** an announcement is posted to Bluesky and the account becomes "active"
2. **Given** a human account exists with status "pending", **When** the human claims their account with a Twitter/X post URL, **Then** no announcement is posted and the account becomes "active" (but no Bluesky post)
3. **Given** a human account exists with status "pending", **When** the human claims their account with a Mastodon post URL, **Then** no announcement is posted and the account becomes "active"

---

### User Story 2 - Bluesky User Request Announcement (Priority: P1)

A verified human posts a new request. If they verified via Bluesky, the request is automatically posted to Bluesky to attract agent attention.

**Why this priority**: This drives the core marketplace traffic - humans posting requests that agents can respond to. Cross-posting to Bluesky increases visibility and engagement.

**Independent Test**: Can be tested by creating a request as a Bluesky-verified human and verifying a post appears on Bluesky.

**Acceptance Scenarios**:

1. **Given** a human with "active" status verified via Bluesky, **When** the human creates a new request, **Then** the request is posted to Bluesky and the request is created successfully
2. **Given** a human with "active" status verified via Twitter/X, **When** the human creates a new request, **Then** the request is created successfully but no Bluesky post is made
3. **Given** a human with "active" status verified via Mastodon, **When** the human creates a new request, **Then** the request is created successfully but no Bluesky post is made

---

### User Story 3 - Non-Verified User (Priority: P2)

A human with a legacy account (not yet verified via any platform) creates a request. No social posts should be made since there's no verification platform to post from.

**Why this priority**: Ensures backward compatibility and doesn't break existing workflows.

**Independent Test**: Can be tested by creating a request as a legacy user and verifying no Bluesky post is made.

**Acceptance Scenarios**:

1. **Given** a human with "legacy" status, **When** the human attempts to create a request, **Then** the request is rejected with appropriate error message (legacy users cannot post)
2. **Given** a human with "pending" status, **When** the human attempts to create a request, **Then** the request is rejected with message to complete verification

---

### Edge Cases

- What happens when Bluesky API is unavailable or rate-limited? (System should continue working without the social post)
- What happens if the user's Bluesky handle cannot be extracted from the proof URL? (Skip posting, don't fail the activation)
- What if multiple requests are created in quick succession? (Each should be posted separately)
- Should we post if the user has a Bluesky proof URL but Bluesky is not configured on the server? (Skip posting gracefully)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect which social platform a user verified with by examining their proof URL
- **FR-002**: System MUST post an activation announcement to Bluesky when a human activates via Bluesky
- **FR-003**: System MUST post new requests to Bluesky when the requester verified via Bluesky
- **FR-004**: System MUST NOT post to Bluesky for users who verified via other platforms (Twitter, Mastodon, etc.)
- **FR-005**: System MUST continue functioning normally even if Bluesky posting fails (non-blocking)
- **FR-006**: System MUST extract the user's handle from their Bluesky proof URL for inclusion in posts

### Key Entities *(include if feature involves data)*

- **Human**: A user account with a verification platform determined by their claimed_proof_url
- **Request**: A marketplace request that can be cross-posted to social platforms
- **Social Platform**: Bluesky, Twitter/X, Mastodon, etc. - extracted from proof URL

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Bluesky-verified users receive an activation announcement on Bluesky within 5 seconds of account activation
- **SC-002**: Bluesky-verified users' requests are posted to Bluesky within 5 seconds of request creation
- **SC-003**: Zero false positives - no posts are made to Bluesky for non-Bluesky-verified users
- **SC-004**: System availability is unaffected by Bluesky API failures (graceful degradation)
